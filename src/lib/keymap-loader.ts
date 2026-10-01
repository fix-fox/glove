import { resolve } from "node:path";
import type { Behavior, Key, Keymap, MacroStep } from "../types/keymap";
import { GLOVE80_KEY_COUNT } from "../types/keymap";
import { parseKeymapNodes, readKeymapSource, sourceError, type KeymapNode, type SourceToken } from "./keymap-source";

export interface BindingSource {
  file: string;
  start: number;
  end: number;
  /** False for a binding produced by a shared macro instead of a literal &reference. */
  editable: boolean;
}

export interface KeymapDocument {
  path: string;
  config: Keymap;
  sources: ReadonlyMap<string, string>;
  /** Include paths and symlink destinations observed during loading. */
  resolutions: ReadonlyMap<string, string>;
  bindings: BindingSource[][];
}

interface Binding {
  name: string;
  args: string[];
  token: SourceToken;
  source: BindingSource;
}

function property(node: KeymapNode, name: string): SourceToken[] {
  const value = node.properties.get(name);
  if (!value) sourceError(node.token, "Missing " + name + " in " + node.name);
  return value;
}

function textProperty(node: KeymapNode, name: string): string {
  const value = property(node, name);
  if (value.length !== 1 || !value[0]!.text.startsWith('"')) sourceError(node.token, name + " must be one string");
  try { return JSON.parse(value[0]!.text) as string; }
  catch { return sourceError(value[0]!, "Invalid quoted string"); }
}

/** Split a property into angle-bracket groups, checking every separator. */
function groups(node: KeymapNode, name: string): SourceToken[][] {
  const tokens = property(node, name);
  const result: SourceToken[][] = [];
  let index = 0;
  while (index < tokens.length) {
    if (tokens[index]?.text !== "<") sourceError(tokens[index]!, "Expected < in " + name);
    index++;
    const group: SourceToken[] = [];
    while (tokens[index] && tokens[index]!.text !== ">") group.push(tokens[index++]!);
    if (!tokens[index]) sourceError(node.token, "Unclosed < in " + name);
    index++;
    result.push(group);
    if (index === tokens.length) break;
    if (tokens[index++]?.text !== "," || index === tokens.length) sourceError(node.token, "Expected another comma-separated <...> group in " + name);
  }
  if (!result.length) sourceError(node.token, "Empty " + name);
  return result;
}

/** Keep a C-style function call or parenthesized modifier expression as one argument. */
function argumentsFrom(tokens: SourceToken[]): string[] {
  const result: string[] = [];
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index++]!;
    let text = token.text;
    if (text === "-" && /^\d+$/.test(tokens[index]?.text ?? "")) text += tokens[index++]!.text;
    else if (!/^(?:[A-Za-z_]\w*|\d+|0[xX][\da-fA-F]+|\()$/.test(text)) sourceError(token, "Unsupported binding argument " + text);
    let depth = text === "(" ? 1 : 0;
    if (!depth && tokens[index]?.text === "(") { text += "("; index++; depth = 1; }
    while (depth > 0) {
      const next = tokens[index++];
      if (!next) sourceError(token, "Unclosed parenthesized argument");
      if (next.text === "(") depth++;
      if (next.text === ")") depth--;
      if (["&", "<", ">", ";"].includes(next.text)) sourceError(next, "Invalid argument expression");
      text += next.text;
    }
    result.push(text);
  }
  return result;
}

function nonnegative(value: string, token: SourceToken): number {
  if (!/^(?:0|[1-9]\d*|0[xX][\da-fA-F]+)$/.test(value)) sourceError(token, "Expected a decimal or hexadecimal nonnegative integer without leading zeroes, got " + value);
  const number = Number(value);
  if (!Number.isSafeInteger(number)) sourceError(token, "Integer out of range: " + value);
  return number;
}

function numbers(node: KeymapNode, name: string): number[] {
  const value = groups(node, name);
  if (value.length !== 1) sourceError(node.token, name + " requires one <...> group");
  return argumentsFrom(value[0]!).map((v) => nonnegative(v, node.token));
}

function numberProperty(node: KeymapNode, name: string): number {
  const values = numbers(node, name);
  if (values.length !== 1) sourceError(node.token, name + " requires exactly one integer");
  return values[0]!;
}

function optionalNumber(node: KeymapNode, name: string, field: string): Record<string, number> {
  return node.properties.has(name) ? { [field]: numberProperty(node, name) } : {};
}

function bindingsIn(group: SourceToken[]): Binding[] {
  const result: Binding[] = [];
  let index = 0;
  while (index < group.length) {
    const token = group[index++]!;
    if (token.text !== "&") sourceError(token, "Expected a behavior reference beginning with &");
    const name = group[index++];
    if (!name || !/^[A-Za-z_]\w*$/.test(name.text)) sourceError(token, "Expected behavior name after &");
    const params: SourceToken[] = [];
    while (index < group.length && group[index]!.text !== "&") params.push(group[index++]!);
    const last = params.at(-1) ?? name;
    result.push({ name: name.text, args: argumentsFrom(params), token,
      source: { file: token.file, start: token.start, end: last.end, editable: !token.expanded && !name.expanded && last.file === token.file } });
  }
  return result;
}

function bindingText(binding: Binding): string {
  return ["&" + binding.name, ...binding.args].join(" ");
}

function allowedProperties(node: KeymapNode, names: string[]): void {
  for (const name of node.properties.keys()) {
    if (!names.includes(name)) sourceError(node.token, "Unsupported property " + name + " in " + node.name);
  }
}

const BUILTIN_CELLS: Readonly<Record<string, number>> = {
  kp: 1, mo: 1, to: 1, sl: 1, tog: 1, trans: 0, none: 0, bootloader: 0,
  sys_reset: 0, caps_word: 0, rgb_ug: 1, out: 1, mmv: 1, msc: 1, mkp: 1,
  lt: 2, mt: 2, macro_tap: 0, macro_press: 0, macro_release: 0,
  macro_pause_for_release: 0, macro_param_1to1: 0, macro_param_2to1: 0,
  macro_wait_time: 1, macro_tap_time: 1,
};

/** Read native ZMK files into the TUI's display model, with no generated configuration. */
export function loadKeymap(path = "config/glove80.keymap", replacements: ReadonlyMap<string, string> = new Map()): KeymapDocument {
  path = resolve(path);
  const source = readKeymapSource(path, replacements);
  const nodes = parseKeymapNodes(source.tokens);
  const roots = nodes.filter((node) => node.name === "/" && !node.reference);
  if (roots.length !== 1) throw new Error(path + ": Expected one root / { ... } node");
  const root = roots[0]!;
  allowedProperties(root, []);
  const sections = new Map<string, KeymapNode>();
  for (const section of root.children) {
    if (!["macros", "behaviors", "combos", "conditional_layers", "keymap"].includes(section.name)) sourceError(section.token, "Unsupported section " + section.name);
    if (sections.has(section.name)) sourceError(section.token, "Duplicate section " + section.name);
    sections.set(section.name, section);
  }
  const keymapNode = sections.get("keymap");
  if (!keymapNode) throw new Error(path + ": Missing keymap node");
  for (const [name, node] of sections) {
    const expected = { keymap: "zmk,keymap", combos: "zmk,combos", conditional_layers: "zmk,conditional-layers" }[name];
    allowedProperties(node, expected ? ["compatible"] : []);
    if (expected && textProperty(node, "compatible") !== expected) sourceError(node.token, "Expected compatible = " + expected);
  }
  const config: Keymap = { layers: [], macros: [], modMorphs: [], holdTaps: [], tapDances: [], combos: [], conditionalLayers: [] };
  const definitions = new Map<string, { node: KeymapNode; type: string; cells: number }>();
  for (const node of [...(sections.get("macros")?.children ?? []), ...(sections.get("behaviors")?.children ?? [])]) {
    if (!node.label) sourceError(node.token, "Behavior needs a node label before ':'");
    if (definitions.has(node.label) || node.label in BUILTIN_CELLS || node.label === "bt") sourceError(node.token, "Duplicate or reserved behavior label " + node.label);
    if (node.children.length) sourceError(node.token, "Nested behavior nodes are not supported");
    const type = textProperty(node, "compatible");
    const cells = numberProperty(node, "#binding-cells");
    const expected: Record<string, number> = {
      "zmk,behavior-macro": 0, "zmk,behavior-macro-one-param": 1, "zmk,behavior-macro-two-param": 2,
      "zmk,behavior-hold-tap": 2, "zmk,behavior-mod-morph": 0, "zmk,behavior-tap-dance": 0,
    };
    if (!(type in expected)) sourceError(node.token, "Unsupported behavior compatible " + type);
    if (cells !== expected[type]) sourceError(node.token, "Wrong #binding-cells for " + type);
    definitions.set(node.label, { node, type, cells });
  }
  const visited = new Set<string>();
  const checkCycle = (name: string, stack: string[]): void => {
    if (stack.includes(name)) sourceError(definitions.get(name)!.node.token, "Recursive behavior reference: " + [...stack, name].join(" -> "));
    if (visited.has(name)) return;
    const node = definitions.get(name)!.node;
    for (const binding of groups(node, "bindings").flatMap(bindingsIn)) {
      if (definitions.has(binding.name)) checkCycle(binding.name, [...stack, name]);
    }
    visited.add(name);
  };
  for (const name of definitions.keys()) checkCycle(name, []);
  const validateBinding = (binding: Binding, supplied = 0): void => {
    if (binding.name === "bt" && !["BT_SEL", "BT_CLR", "BT_CLR_ALL", "BT_NXT", "BT_PRV", "BT_DISC"].includes(binding.args[0] ?? "")) sourceError(binding.token, "Unknown Bluetooth action " + binding.args[0]);
    if (binding.name === "out" && !["OUT_BLE", "OUT_USB"].includes(binding.args[0] ?? "")) sourceError(binding.token, "Unknown output " + binding.args[0]);
    const cells = binding.name === "bt"
      ? (["BT_SEL", "BT_DISC"].includes(binding.args[0] ?? "") ? 2 : 1)
      : definitions.get(binding.name)?.cells ?? BUILTIN_CELLS[binding.name];
    if (cells === undefined) sourceError(binding.token, "Unknown behavior &" + binding.name);
    if (binding.args.length + supplied !== cells) sourceError(binding.token, "&" + binding.name + " expects " + cells + " arguments, got " + binding.args.length);
    if (["mo", "to", "sl", "tog", "lt"].includes(binding.name) && binding.args.length) {
      const layer = nonnegative(binding.args[0]!, binding.token);
      if (layer >= keymapNode.children.length) sourceError(binding.token, "Layer index out of range: " + layer);
    }
    if (binding.name === "bt" && binding.args[1] !== undefined) nonnegative(binding.args[1], binding.token);
    const custom = definitions.get(binding.name);
    if (custom?.type === "zmk,behavior-hold-tap" && supplied === 0) {
      const targets = groups(custom.node, "bindings").flatMap(bindingsIn);
      targets.forEach((target, index) => {
        if (["mo", "to", "sl", "tog"].includes(target.name)) {
          validateBinding({ ...binding, name: target.name, args: [binding.args[index]!] });
        }
      });
    }
  };
  const checkedBindings = (node: KeymapNode, supplied = 0) => groups(node, "bindings").map((group) => {
    const values = bindingsIn(group);
    if (!values.length) sourceError(node.token, "Empty bindings group");
    values.forEach((binding) => validateBinding(binding, supplied));
    return values;
  });
  const labeled = (node: KeymapNode) => ({ name: node.label ?? node.name, ...(node.displayLabel ? { label: node.displayLabel } : {}) });
  const parseHoldTap = (node: KeymapNode, name: string, inherited = false) => {
    allowedProperties(node, ["compatible", "#binding-cells", "flavor", "tapping-term-ms", "quick-tap-ms", "require-prior-idle-ms", "bindings", "hold-trigger-key-positions", "hold-trigger-on-release"]);
    const flavor = textProperty(node, "flavor");
    if (!["balanced", "tap-preferred", "hold-preferred"].includes(flavor)) sourceError(node.token, "Unsupported hold-tap flavor " + flavor);
    const bindings = inherited ? ["&mo", "&kp"] : groups(node, "bindings").map((group) => {
      const values = bindingsIn(group);
      if (values.length !== 1 || values[0]!.args.length) sourceError(node.token, "Hold-tap bindings must be two parameterless behavior references");
      const binding = values[0]!;
      const cells = definitions.get(binding.name)?.cells ?? BUILTIN_CELLS[binding.name];
      if (cells === undefined || cells > 1) sourceError(binding.token, "Hold-tap target must take zero or one argument");
      return bindingText(binding);
    });
    if (bindings.length !== 2) sourceError(node.token, "Hold-tap requires two bindings");
    const positions = node.properties.has("hold-trigger-key-positions") ? numbers(node, "hold-trigger-key-positions") : undefined;
    if (positions?.some((pos) => pos >= GLOVE80_KEY_COUNT)) sourceError(node.token, "Hold trigger position out of range");
    if ((node.properties.get("hold-trigger-on-release")?.length ?? 0) > 0) sourceError(node.token, "hold-trigger-on-release is a boolean property");
    config.holdTaps!.push({ ...labeled(node), name, flavor: flavor as "balanced" | "tap-preferred" | "hold-preferred",
      tappingTermMs: numberProperty(node, "tapping-term-ms"), holdBinding: bindings[0]!, tapBinding: bindings[1]!,
      ...optionalNumber(node, "quick-tap-ms", "quickTapMs"), ...optionalNumber(node, "require-prior-idle-ms", "requirePriorIdleMs"),
      ...(positions ? { holdTriggerKeyPositions: positions } : {}), ...(node.properties.has("hold-trigger-on-release") ? { holdTriggerOnRelease: true } : {}) });
  };
  for (const node of nodes.filter((node) => node !== root)) {
    if (!node.reference || node.name !== "lt" || node.children.length) sourceError(node.token, "Only the built-in &lt override is supported at the top level");
    if (node.properties.has("compatible") || node.properties.has("#binding-cells")) sourceError(node.token, "The built-in &lt type and #binding-cells cannot be changed");
    if (config.holdTaps!.some((definition) => definition.name === "lt")) sourceError(node.token, "Duplicate &lt override");
    if (node.properties.has("bindings")) sourceError(node.token, "Changing built-in &lt bindings is not supported; define a named behavior");
    parseHoldTap(node, "lt", true);
  }
  for (const [name, { node, type, cells }] of definitions) {
    if (type.startsWith("zmk,behavior-macro")) {
      allowedProperties(node, ["compatible", "#binding-cells", "bindings", "wait-ms", "tap-ms"]);
      const steps: MacroStep[] = checkedBindings(node).map((group) => {
        const directive = group[0]!.name.replace(/^macro_/, "");
        if (["tap", "press", "release"].includes(directive)) {
          if (group.length < 2) sourceError(node.token, "Macro action requires bindings");
          return { directive: directive as "tap" | "press" | "release", bindings: group.slice(1).map(bindingText) };
        }
        if (!["pause_for_release", "param_1to1", "param_2to1"].includes(directive) || group.length !== 1) sourceError(node.token, "Unsupported macro directive group &" + group[0]!.name);
        if ((directive === "param_1to1" && cells < 1) || (directive === "param_2to1" && cells < 2)) sourceError(node.token, "Macro parameter control exceeds #binding-cells");
        return { directive: directive as "pause_for_release" | "param_1to1" | "param_2to1" };
      });
      config.macros!.push({ ...labeled(node), steps, ...(cells ? { bindingCells: cells as 1 | 2 } : {}), ...optionalNumber(node, "wait-ms", "waitMs"), ...optionalNumber(node, "tap-ms", "tapMs") });
    } else if (type === "zmk,behavior-hold-tap") {
      parseHoldTap(node, name);
    } else if (type === "zmk,behavior-mod-morph") {
      allowedProperties(node, ["compatible", "#binding-cells", "bindings", "mods"]);
      const bindings = checkedBindings(node).flat();
      if (bindings.length !== 2) sourceError(node.token, "Mod-morph requires two bindings");
      const mods = groups(node, "mods").flat().map((token) => token.text).join("").replace(/^\(|\)$/g, "").split("|");
      if (mods.some((mod) => !/^MOD_[LR](SFT|CTL|ALT|GUI)$/.test(mod))) sourceError(node.token, "Expected modifier flags in mods");
      config.modMorphs!.push({ ...labeled(node), defaultBinding: bindingText(bindings[0]!), morphBinding: bindingText(bindings[1]!), mods });
    } else {
      allowedProperties(node, ["compatible", "#binding-cells", "bindings", "tapping-term-ms"]);
      const bindings = checkedBindings(node).flat().map(bindingText);
      if (bindings.length < 2) sourceError(node.token, "Tap dance requires at least two bindings");
      config.tapDances!.push({ ...labeled(node), bindings, ...optionalNumber(node, "tapping-term-ms", "tappingTermMs") });
    }
  }
  const behavior = (binding: Binding): Behavior => {
    const [first, second] = binding.args;
    const name = binding.name;
    const custom = definitions.get(name);
    if (custom?.type.startsWith("zmk,behavior-macro")) return { type: "macro", macroName: name, ...(first ? { param: first } : {}), ...(second ? { param2: second } : {}) };
    if (custom?.type === "zmk,behavior-mod-morph") return { type: "mod_morph", name };
    if (custom?.type === "zmk,behavior-tap-dance") return { type: "tap_dance", name };
    if (custom?.type === "zmk,behavior-hold-tap") return { type: "hold_tap", name, param1: first!, param2: second! };
    switch (name) {
      case "kp": return { type: "kp", keyCode: first! };
      case "mo": case "to": case "tog": case "sl": return { type: name, layerIndex: nonnegative(first!, binding.token) };
      case "trans": case "none": case "bootloader": case "sys_reset": case "caps_word": return { type: name };
      case "bt": {
        if (!["BT_SEL", "BT_CLR", "BT_CLR_ALL", "BT_NXT", "BT_PRV", "BT_DISC"].includes(first!)) sourceError(binding.token, "Unknown Bluetooth action " + first);
        return { type: "bt", action: first as Extract<Behavior, { type: "bt" }>["action"], ...(second ? { profileIndex: nonnegative(second, binding.token) } : {}) };
      }
      case "rgb_ug": return { type: "rgb_ug", action: first! };
      case "out":
        if (first !== "OUT_BLE" && first !== "OUT_USB") sourceError(binding.token, "Unknown output " + first);
        return { type: "out", action: first };
      case "mmv": {
        const precise = /^MOVE_([XY])\((-?\d+)\)$/.exec(first!);
        if (precise) return { type: "mmv", direction: "MOVE_" + (precise[1] === "X" ? (Number(precise[2]) < 0 ? "LEFT" : "RIGHT") : (Number(precise[2]) < 0 ? "UP" : "DOWN")), precision: true };
        return { type: "mmv", direction: first! };
      }
      case "msc": return { type: "msc", direction: first! };
      case "mkp": return { type: "mkp", button: first! };
      default: return sourceError(binding.token, "Behavior &" + name + " cannot be used directly as a layer key");
    }
  };
  const key = (binding: Binding): Key => {
    if (binding.name === "lt") return { tap: { type: "kp", keyCode: binding.args[1]! }, hold: { type: "mo", layerIndex: nonnegative(binding.args[0]!, binding.token) } };
    if (binding.name === "mt") return { tap: { type: "kp", keyCode: binding.args[1]! }, hold: { type: "kp", keyCode: binding.args[0]! } };
    const holdTap = config.holdTaps!.find((definition) => definition.name === binding.name);
    if (holdTap?.holdBinding === "&mo") {
      const layerIndex = nonnegative(binding.args[0]!, binding.token);
      if (layerIndex >= keymapNode.children.length) sourceError(binding.token, "Layer index out of range: " + layerIndex);
      const target = holdTap.tapBinding.slice(1);
      const cells = definitions.get(target)?.cells ?? BUILTIN_CELLS[target];
      const tap = behavior({ ...binding, name: target, args: cells === 0 ? [] : [binding.args[1]!] });
      // Keep magic's existing display convention; its hold still receives range validation.
      if (binding.name !== "magic") return { tap, hold: { type: "mo", layerIndex } };
    }
    return { tap: behavior(binding), hold: null };
  };
  const layerBindings: BindingSource[][] = [];
  const layerNames = new Set<string>();
  for (const node of keymapNode.children) {
    allowedProperties(node, ["bindings"]);
    if (node.children.length) sourceError(node.token, "Nested layer nodes are not supported");
    const name = node.displayLabel ?? node.name;
    const constantName = "LAYER_" + node.name.toUpperCase();
    const constant = source.constants.get(constantName);
    if (constant && (constant.length !== 1 || nonnegative(constant[0]!.text, node.token) !== config.layers.length)) {
      sourceError(node.token, constantName + " must equal declaration index " + config.layers.length + "; update layer constants when reordering layers");
    }
    if (layerNames.has(name.toLowerCase())) sourceError(node.token, "Duplicate layer name " + name);
    layerNames.add(name.toLowerCase());
    const bindings = checkedBindings(node).flat();
    if (bindings.length !== GLOVE80_KEY_COUNT) sourceError(node.token, "Layer " + name + " needs 80 bindings, got " + bindings.length);
    config.layers.push({ name, keys: bindings.map(key) });
    layerBindings.push(bindings.map((binding) => binding.source));
  }
  if (!config.layers.length) sourceError(keymapNode.token, "Keymap needs at least one layer");
  for (const node of sections.get("combos")?.children ?? []) {
    if (node.children.length) sourceError(node.token, "Nested combo nodes are not supported");
    allowedProperties(node, ["key-positions", "bindings", "timeout-ms", "require-prior-idle-ms", "layers"]);
    const bindings = checkedBindings(node).flat();
    const positions = numbers(node, "key-positions");
    if (bindings.length !== 1 || positions.length < 2 || new Set(positions).size !== positions.length || positions.some((pos) => pos >= 80)) sourceError(node.token, "Combo needs one binding and distinct valid key positions");
    const layers = node.properties.has("layers") ? numbers(node, "layers") : undefined;
    if (layers?.some((layer) => layer >= config.layers.length)) sourceError(node.token, "Combo layer index out of range");
    config.combos!.push({ name: node.name, keyPositions: positions, binding: bindingText(bindings[0]!), ...optionalNumber(node, "timeout-ms", "timeoutMs"), ...optionalNumber(node, "require-prior-idle-ms", "requirePriorIdleMs"), ...(layers ? { layers } : {}) });
  }
  for (const node of sections.get("conditional_layers")?.children ?? []) {
    if (node.children.length) sourceError(node.token, "Nested conditional layer nodes are not supported");
    allowedProperties(node, ["if-layers", "then-layer"]);
    const ifLayers = numbers(node, "if-layers");
    const thenLayer = numberProperty(node, "then-layer");
    if (ifLayers.length < 2 || [...ifLayers, thenLayer].some((layer) => layer >= config.layers.length)) sourceError(node.token, "Conditional layer indices must refer to existing layers");
    config.conditionalLayers!.push({ name: node.name, ifLayers, thenLayer });
  }
  return { path, config, sources: source.sources, resolutions: source.resolutions, bindings: layerBindings };
}
