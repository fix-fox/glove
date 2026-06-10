import type {
  Behavior, ComboDefinition, Key, KeyboardConfig, Layer, MacroDefinition,
} from "../../types/schema";
import { GLOVE80_GRID, GLOVE80_KEY_NAMES } from "../layout-map";
import { behaviorLabel, holdTapSecondaryLabel, keyCodeDisplayLabel } from "../labels";
import { displayWidth, truncateDisplay } from "./text-width";
import { bold, cyan, dim, magenta, yellow } from "./color";

export function listLayers(config: KeyboardConfig): string[] {
  return config.layers.map((layer, i) => {
    const bound = layer.keys.filter(
      (k) => k.tap.type !== "none" && k.tap.type !== "trans",
    ).length;
    return `${String(i).padStart(2)}: ${layer.name} (${bound} keys bound)`;
  });
}

export function listMacros(config: KeyboardConfig): string[] {
  return (config.macros ?? []).map((m) => {
    const steps = `${m.steps.length} step${m.steps.length === 1 ? "" : "s"}`;
    return `${m.name} — ${steps}${m.label ? ` (${m.label})` : ""}`;
  });
}

export function listCombos(config: KeyboardConfig): string[] {
  return (config.combos ?? []).map((c) => {
    const keys = c.keyPositions.map((p) => GLOVE80_KEY_NAMES[p] ?? String(p)).join("+");
    return `${c.name}: ${keys} → ${c.binding}`;
  });
}

export function listHoldTaps(config: KeyboardConfig): string[] {
  return (config.holdTaps ?? []).map(
    (h) => `${h.name}: ${h.flavor}, ${h.tappingTermMs}ms, hold ${h.holdBinding}, tap ${h.tapBinding}`,
  );
}

export function listModMorphs(config: KeyboardConfig): string[] {
  return (config.modMorphs ?? []).map(
    (m) => `${m.name}: ${m.defaultBinding} / ${m.mods.join("+")} → ${m.morphBinding}`,
  );
}

export function listCondLayers(config: KeyboardConfig): string[] {
  const name = (i: number) => config.layers[i]?.name ?? String(i);
  return (config.conditionalLayers ?? []).map(
    (c) => `${c.name}: ${c.ifLayers.map(name).join(" + ")} → ${name(c.thenLayer)}`,
  );
}

const MIN_CELL = 4;
const MAX_CELL = 6;
const GUTTER_COL = 9; // the only GLOVE80_GRID column that never holds a key
const GUTTER = "  ";

type CellKind = "normal" | "layer" | "macro" | "trans" | "empty";

interface CellContent {
  tap: string;
  hold: string | null;
  kind: CellKind;
}

function cellContent(key: Key, config: KeyboardConfig): CellContent {
  const names = config.layers.map((l) => l.name);
  const morphs = config.modMorphs ?? [];
  const holdTaps = config.holdTaps ?? [];
  if (key.tap.type === "trans") return { tap: "·", hold: null, kind: "trans" };
  const tapLabel = behaviorLabel(key.tap, names, morphs, holdTaps);
  if (key.tap.type === "none" && !key.hold) return { tap: "", hold: null, kind: "empty" };
  let hold: string | null = null;
  if (key.tap.type === "hold_tap") {
    hold = holdTapSecondaryLabel(key.tap.name, key.tap.param1);
  } else if (key.hold) {
    hold = behaviorLabel(key.hold, names, morphs, holdTaps);
  }
  const kind: CellKind =
    key.tap.type === "mo" || key.tap.type === "to" || key.tap.type === "tog" || key.tap.type === "sl"
      ? "layer"
      : key.tap.type === "macro"
        ? "macro"
        : "normal";
  return { tap: tapLabel, hold, kind };
}

function cellPlainText(c: CellContent): string {
  return c.hold ? `${c.tap}·${c.hold}` : c.tap;
}

/** Center + colorize one cell's content to exactly `width` display columns. */
function renderCellContent(c: CellContent, width: number): string {
  const plain = truncateDisplay(cellPlainText(c), width);
  const pad = Math.max(0, width - displayWidth(plain));
  const leftPad = Math.floor(pad / 2);
  const left = " ".repeat(leftPad);
  const right = " ".repeat(pad - leftPad);
  let colored: string;
  if (c.kind === "trans" || c.kind === "empty") {
    colored = dim(plain);
  } else if (c.kind === "layer") {
    colored = yellow(plain);
  } else if (c.kind === "macro") {
    colored = magenta(plain);
  } else if (c.hold && plain === cellPlainText(c)) {
    colored = `${c.tap}${dim("·")}${cyan(c.hold)}`;
  } else {
    colored = plain; // truncated hold-tap: single color
  }
  return left + colored + right;
}

const LEGEND_SYMBOLS: ReadonlyArray<readonly [string, string]> = [
  ["◇", "◇ momentary"],
  ["⇄", "⇄ toggle"],
  ["⇨", "⇨ switch-to"],
  ["◆", "◆ sticky"],
];

function legend(layer: Layer, config: KeyboardConfig): string {
  const contents = layer.keys.map((k) => cellContent(k, config));
  const all = contents.map(cellPlainText).join(" ");
  const parts: string[] = [];
  for (const [symbol, text] of LEGEND_SYMBOLS) {
    if (all.includes(symbol)) parts.push(text);
  }
  if (contents.some((c) => c.hold !== null)) parts.push("A·⌘ tap·hold");
  if (contents.some((c) => c.kind === "trans")) parts.push("· transparent");
  return parts.length ? dim(parts.join("   ")) : "";
}

export function renderLayer(config: KeyboardConfig, layerIndex: number): string {
  const layer = config.layers[layerIndex];
  if (!layer) return `Layer ${layerIndex} not found`;
  const contents = layer.keys.map((k) => cellContent(k, config));
  const widest = Math.max(...contents.map((c) => displayWidth(cellPlainText(c))));
  const w = Math.max(MIN_CELL, Math.min(MAX_CELL, widest));
  const blank = " ".repeat(w + 2);
  const lines: string[] = [bold(`Layer ${layerIndex}: ${layer.name}`), ""];
  for (const row of GLOVE80_GRID) {
    const top: string[] = [];
    const mid: string[] = [];
    const bottom: string[] = [];
    row.forEach((idx, col) => {
      if (col === GUTTER_COL) {
        top.push(GUTTER);
        mid.push(GUTTER);
        bottom.push(GUTTER);
        return;
      }
      if (idx === null) {
        top.push(blank);
        mid.push(blank);
        bottom.push(blank);
        return;
      }
      const c = contents[idx] ?? { tap: "", hold: null, kind: "empty" as const };
      top.push(dim(`┌${"─".repeat(w)}┐`));
      mid.push(`${dim("│")}${renderCellContent(c, w)}${dim("│")}`);
      bottom.push(dim(`└${"─".repeat(w)}┘`));
    });
    lines.push(top.join(" ").trimEnd(), mid.join(" ").trimEnd(), bottom.join(" ").trimEnd(), "");
  }
  const leg = legend(layer, config);
  if (leg) lines.push(leg);
  return lines.join("\n").trimEnd();
}

export function macroDetail(def: MacroDefinition, indent = ""): string {
  const lines = [`${indent}macro ${def.name}${def.label ? ` (${def.label})` : ""}`];
  if (def.waitMs !== undefined || def.tapMs !== undefined) {
    lines.push(`${indent}  wait: ${def.waitMs ?? "default"}ms, tap: ${def.tapMs ?? "default"}ms`);
  }
  def.steps.forEach((step, i) => {
    const detail = "bindings" in step ? `${step.directive} ${step.bindings.join(" ")}` : step.directive;
    lines.push(`${indent}  ${i + 1}. ${detail}`);
  });
  return lines.join("\n");
}

export function comboDetail(config: KeyboardConfig, def: ComboDefinition): string {
  const positions = def.keyPositions.map((p) => `${GLOVE80_KEY_NAMES[p] ?? p} (${p})`).join(" + ");
  const layers = def.layers?.length
    ? def.layers.map((i) => config.layers[i]?.name ?? String(i)).join(", ")
    : "all";
  const lines = [
    `combo ${def.name}`,
    `  keys: ${positions}`,
    `  binding: ${def.binding}`,
    `  layers: ${layers}`,
  ];
  if (def.timeoutMs !== undefined) lines.push(`  timeout: ${def.timeoutMs}ms`);
  return lines.join("\n");
}

export function describeBehavior(
  behavior: Behavior,
  config: KeyboardConfig,
  indent = "",
): string {
  const names = config.layers.map((l) => l.name);
  switch (behavior.type) {
    case "kp":
      return `kp ${behavior.keyCode} — ${keyCodeDisplayLabel(behavior.keyCode)}`;
    case "mo":
      return `mo ${behavior.layerIndex} — momentary layer "${names[behavior.layerIndex] ?? behavior.layerIndex}"`;
    case "to":
      return `to ${behavior.layerIndex} — switch to layer "${names[behavior.layerIndex] ?? behavior.layerIndex}"`;
    case "sl":
      return `sl ${behavior.layerIndex} — sticky layer "${names[behavior.layerIndex] ?? behavior.layerIndex}"`;
    case "tog":
      return `tog ${behavior.layerIndex} — toggle layer "${names[behavior.layerIndex] ?? behavior.layerIndex}"`;
    case "trans":
      return "trans — falls through to lower layer";
    case "none":
      return "none";
    case "macro": {
      const def = (config.macros ?? []).find((m) => m.name === behavior.macroName);
      const params = [behavior.param, behavior.param2].filter(Boolean).join(", ");
      const head = `macro ${behavior.macroName}${params ? `(${params})` : ""}`;
      return def ? `${head}\n${macroDetail(def, `${indent}  `)}` : `${head} — definition not found`;
    }
    case "mod_morph": {
      const def = (config.modMorphs ?? []).find((m) => m.name === behavior.name);
      if (!def) return `mod-morph ${behavior.name} — definition not found`;
      return [
        `mod-morph ${behavior.name}`,
        `${indent}  default: ${def.defaultBinding}`,
        `${indent}  with ${def.mods.join("+")}: ${def.morphBinding}`,
      ].join("\n");
    }
    case "hold_tap": {
      const def = (config.holdTaps ?? []).find((h) => h.name === behavior.name);
      const head = `hold-tap ${behavior.name}(${behavior.param1}, ${behavior.param2})`;
      if (!def) return `${head} — definition not found`;
      const hold = ["&kp", "&mo", "&to", "&tog", "&sl"].includes(def.holdBinding)
        ? `${def.holdBinding} ${behavior.param1}`
        : def.holdBinding;
      const tap = def.tapBinding === "&kp" ? `&kp ${behavior.param2}` : def.tapBinding;
      return [
        head,
        `${indent}  hold: ${hold}`,
        `${indent}  tap:  ${tap}`,
        `${indent}  flavor: ${def.flavor}, tapping-term: ${def.tappingTermMs}ms`,
      ].join("\n");
    }
    default: {
      const label = behaviorLabel(behavior, names, config.modMorphs ?? [], config.holdTaps ?? []);
      return `${behavior.type}${label ? ` — ${label}` : ""}`;
    }
  }
}

export function keyDetail(config: KeyboardConfig, layerIndex: number, pos: number): string {
  const layer = config.layers[layerIndex];
  if (!layer) return `Layer ${layerIndex} not found`;
  const key = layer.keys[pos];
  if (!key) return `Position ${pos} not found`;
  return [
    `${GLOVE80_KEY_NAMES[pos]} (pos ${pos}) on layer ${layerIndex} "${layer.name}"`,
    `  tap:  ${describeBehavior(key.tap, config, "  ")}`,
    `  hold: ${key.hold ? describeBehavior(key.hold, config, "  ") : "(none)"}`,
  ].join("\n");
}
