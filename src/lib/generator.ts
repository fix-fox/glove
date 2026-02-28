import type { Behavior, Key, KeyboardConfig, MacroDefinition, ModMorphDefinition, HoldTapDefinition, ComboDefinition, ConditionalLayerDefinition } from "../types/schema";
import { parseModifiedKeyCode } from "./keycodes";

function tapBehaviorToString(behavior: Behavior): string {
  switch (behavior.type) {
    case "kp":
      return `&kp ${behavior.keyCode}`;
    case "mo":
      return `&mo ${behavior.layerIndex}`;
    case "to":
      return `&to ${behavior.layerIndex}`;
    case "sl":
      return `&sl ${behavior.layerIndex}`;
    case "tog":
      return `&tog ${behavior.layerIndex}`;
    case "trans":
      return "&trans";
    case "none":
      return "&none";
    case "bootloader":
      return "&bootloader";
    case "sys_reset":
      return "&sys_reset";
    case "caps_word":
      return "&caps_word";
    case "bt": {
      const parts = ["&bt", behavior.action];
      if (behavior.profileIndex !== undefined) {
        parts.push(String(behavior.profileIndex));
      }
      return parts.join(" ");
    }
    case "rgb_ug":
      return `&rgb_ug ${behavior.action}`;
    case "out":
      return `&out ${behavior.action}`;
    case "mmv":
      return `&mmv ${behavior.direction}`;
    case "msc":
      return `&msc ${behavior.direction}`;
    case "mkp":
      return `&mkp ${behavior.button}`;
    case "macro":
      return `&${behavior.macroName}`;
    case "mod_morph":
      return `&${behavior.name}`;
    case "hold_tap":
      return `&${behavior.name} ${behavior.param1} ${behavior.param2}`;
  }
}

export function behaviorToString(key: Key): string {
  if (key.hold === null) {
    return tapBehaviorToString(key.tap);
  }

  // Layer-tap: hold is a layer behavior
  if (key.hold.type === "mo" || key.hold.type === "to" || key.hold.type === "sl" || key.hold.type === "tog") {
    if (key.tap.type === "kp") {
      return `&lt ${key.hold.layerIndex} ${key.tap.keyCode}`;
    }
    // Non-kp tap: needs a custom hold-tap def named lt_<tapName>
    const tapName = tapBehaviorToString(key.tap).replace(/^&/, "");
    return `&lt_${tapName} ${key.hold.layerIndex} 0`;
  }

  // Mod-tap: hold is kp (modifier) → &mt <holdKeyCode> <tapKeyCode>
  if (key.hold.type === "kp" && key.tap.type === "kp") {
    return `&mt ${key.hold.keyCode} ${key.tap.keyCode}`;
  }

  // Unsupported combination — validation should catch this before we get here
  return tapBehaviorToString(key.tap);
}

export type ValidationError = {
  path: string;
  message: string;
};

const ZMK_MODIFIERS = new Set([
  "LSHIFT", "RSHIFT", "LCTRL", "RCTRL", "LALT", "RALT", "LGUI", "RGUI",
]);

const VALID_HOLD_TYPES = new Set(["kp", "mo", "to", "sl", "tog", "hold_tap"]);

function validateBehavior(
  behavior: Behavior,
  path: string,
  layerCount: number,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (
    (behavior.type === "mo" || behavior.type === "to" || behavior.type === "sl" || behavior.type === "tog") &&
    behavior.layerIndex >= layerCount
  ) {
    errors.push({
      path,
      message: `layerIndex ${behavior.layerIndex} out of bounds (max ${layerCount - 1})`,
    });
  }

  if (behavior.type === "bt" && (behavior.action === "BT_SEL" || behavior.action === "BT_DISC") && behavior.profileIndex === undefined) {
    errors.push({ path, message: `${behavior.action} requires profileIndex` });
  }

  return errors;
}

export function validateConfig(config: KeyboardConfig): ValidationError[] {
  const errors: ValidationError[] = [];
  const layerCount = config.layers.length;

  const seenNames = new Map<string, number>();
  for (let li = 0; li < config.layers.length; li++) {
    const sanitized = sanitizeLayerName(config.layers[li]!.name);
    if (seenNames.has(sanitized)) {
      errors.push({
        path: `layers[${li}].name`,
        message: `duplicate layer name "${sanitized}" (conflicts with layers[${seenNames.get(sanitized)}])`,
      });
    }
    seenNames.set(sanitized, li);
  }

  for (let li = 0; li < config.layers.length; li++) {
    const layer = config.layers[li]!;
    for (let ki = 0; ki < layer.keys.length; ki++) {
      const key = layer.keys[ki]!;
      const keyPath = `layers[${li}].keys[${ki}]`;

      errors.push(...validateBehavior(key.tap, `${keyPath}.tap`, layerCount));

      if (key.hold !== null) {
        errors.push(...validateBehavior(key.hold, `${keyPath}.hold`, layerCount));

        if (!VALID_HOLD_TYPES.has(key.hold.type)) {
          errors.push({
            path: keyPath,
            message: `hold must be kp or layer behavior (mo/to/sl), got "${key.hold.type}"`,
          });
        }

        if (key.hold.type === "kp") {
          // Accept plain modifiers (LSHIFT) and modified modifiers (LC(LSHIFT))
          const parsed = parseModifiedKeyCode(key.hold.keyCode);
          if (!ZMK_MODIFIERS.has(parsed.key)) {
            errors.push({
              path: `${keyPath}.hold`,
              message: `mod-tap requires modifier keyCode, got "${key.hold.keyCode}"`,
            });
          }
        }

        if (key.hold.type === "kp" && key.tap.type !== "kp") {
          errors.push({
            path: keyPath,
            message: `mod-tap requires key press tap, got "${key.tap.type}"`,
          });
        }
      }
    }
  }

  return errors;
}

export function sanitizeLayerName(name: string): string {
  let sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  if (sanitized === "") {
    sanitized = "layer";
  }

  if (/^[0-9]/.test(sanitized)) {
    sanitized = `layer_${sanitized}`;
  }

  return sanitized;
}

// Glove80 physical row lengths matching the official keymap layout:
//   Row 1: 10 (5L + 5R function keys)
//   Row 2: 12 (6L + 6R number row)
//   Row 3: 12 (6L + 6R top alpha)
//   Row 4: 12 (6L + 6R home row)
//   Row 5: 18 (6L + 3L inner + 3R inner + 6R bottom)
//   Row 6: 16 (5L + 3L thumb + 3R thumb + 5R)
const GLOVE80_ROW_LENGTHS = [10, 12, 12, 12, 18, 16];

export type GeneratorResult =
  | { ok: true; keymap: string }
  | { ok: false; errors: ValidationError[] };

// =============================================================================
// Macro generation
// =============================================================================

function generateMacroBlock(macro: MacroDefinition): string {
  const lines: string[] = [];
  lines.push(`        ${macro.name}: ${macro.name} {`);
  if (macro.bindingCells === 1) {
    lines.push(`            compatible = "zmk,behavior-macro-one-param";`);
    lines.push(`            #binding-cells = <1>;`);
  } else {
    lines.push(`            compatible = "zmk,behavior-macro";`);
    lines.push(`            #binding-cells = <0>;`);
  }
  if (macro.waitMs !== undefined) {
    lines.push(`            wait-ms = <${macro.waitMs}>;`);
  }
  if (macro.tapMs !== undefined) {
    lines.push(`            tap-ms = <${macro.tapMs}>;`);
  }

  const bindings: string[] = [];
  for (const step of macro.steps) {
    switch (step.directive) {
      case "press":
        bindings.push(`<&macro_press ${step.bindings.join(" ")}>`);
        break;
      case "tap":
        bindings.push(`<&macro_tap ${step.bindings.join(" ")}>`);
        break;
      case "release":
        bindings.push(`<&macro_release ${step.bindings.join(" ")}>`);
        break;
      case "pause_for_release":
        bindings.push(`<&macro_pause_for_release>`);
        break;
      case "param_1to1":
        bindings.push(`<&macro_param_1to1>`);
        break;
    }
  }
  lines.push(`            bindings = ${bindings.join(" ")};`);
  lines.push(`        };`);
  return lines.join("\n");
}

function generateMacrosSection(macros: MacroDefinition[]): string {
  if (macros.length === 0) return "";
  const blocks = macros.map(generateMacroBlock);
  return `    macros {\n${blocks.join("\n\n")}\n    };\n\n`;
}

// =============================================================================
// Mod-morph generation
// =============================================================================

function generateModMorphBlock(mm: ModMorphDefinition): string {
  const lines: string[] = [];
  lines.push(`        ${mm.name}: ${mm.name} {`);
  lines.push(`            compatible = "zmk,behavior-mod-morph";`);
  lines.push(`            #binding-cells = <0>;`);
  lines.push(`            bindings = <${mm.defaultBinding}>, <${mm.morphBinding}>;`);
  lines.push(`            mods = <(${mm.mods.join("|")})>;`);
  lines.push(`        };`);
  return lines.join("\n");
}

// =============================================================================
// Hold-tap generation
// =============================================================================

function generateHoldTapBlock(ht: HoldTapDefinition): string {
  const lines: string[] = [];
  lines.push(`        ${ht.name}: ${ht.name} {`);
  lines.push(`            compatible = "zmk,behavior-hold-tap";`);
  lines.push(`            #binding-cells = <2>;`);
  lines.push(`            flavor = "${ht.flavor}";`);
  lines.push(`            tapping-term-ms = <${ht.tappingTermMs}>;`);
  if (ht.quickTapMs !== undefined) {
    lines.push(`            quick-tap-ms = <${ht.quickTapMs}>;`);
  }
  if (ht.requirePriorIdleMs !== undefined) {
    lines.push(`            require-prior-idle-ms = <${ht.requirePriorIdleMs}>;`);
  }
  lines.push(`            bindings = <${ht.holdBinding}>, <${ht.tapBinding}>;`);
  if (ht.holdTriggerKeyPositions && ht.holdTriggerKeyPositions.length > 0) {
    lines.push(`            hold-trigger-key-positions = <${ht.holdTriggerKeyPositions.join(" ")}>;`);
  }
  if (ht.holdTriggerOnRelease === true) {
    lines.push(`            hold-trigger-on-release;`);
  }
  lines.push(`        };`);
  return lines.join("\n");
}

function generateBehaviorsSection(modMorphs: ModMorphDefinition[], holdTaps: HoldTapDefinition[]): string {
  const blocks: string[] = [];
  for (const mm of modMorphs) blocks.push(generateModMorphBlock(mm));
  for (const ht of holdTaps) blocks.push(generateHoldTapBlock(ht));
  if (blocks.length === 0) return "";
  return `    behaviors {\n${blocks.join("\n\n")}\n    };\n\n`;
}

// =============================================================================
// Combo generation
// =============================================================================

function generateComboBlock(combo: ComboDefinition): string {
  const lines: string[] = [];
  lines.push(`        ${combo.name} {`);
  lines.push(`            key-positions = <${combo.keyPositions.join(" ")}>;`);
  lines.push(`            bindings = <${combo.binding}>;`);
  if (combo.timeoutMs !== undefined) {
    lines.push(`            timeout-ms = <${combo.timeoutMs}>;`);
  }
  if (combo.requirePriorIdleMs !== undefined) {
    lines.push(`            require-prior-idle-ms = <${combo.requirePriorIdleMs}>;`);
  }
  if (combo.layers && combo.layers.length > 0) {
    lines.push(`            layers = <${combo.layers.join(" ")}>;`);
  }
  lines.push(`        };`);
  return lines.join("\n");
}

function generateCombosSection(combos: ComboDefinition[]): string {
  if (combos.length === 0) return "";
  const blocks = combos.map(generateComboBlock);
  return `    combos {\n        compatible = "zmk,combos";\n\n${blocks.join("\n\n")}\n    };\n\n`;
}

// =============================================================================
// Conditional layer generation
// =============================================================================

function generateConditionalLayerBlock(cl: ConditionalLayerDefinition): string {
  const lines: string[] = [];
  lines.push(`        ${cl.name} {`);
  lines.push(`            if-layers = <${cl.ifLayers.join(" ")}>;`);
  lines.push(`            then-layer = <${cl.thenLayer}>;`);
  lines.push(`        };`);
  return lines.join("\n");
}

function generateConditionalLayersSection(cls: ConditionalLayerDefinition[]): string {
  if (cls.length === 0) return "";
  const blocks = cls.map(generateConditionalLayerBlock);
  return `    conditional_layers {\n        compatible = "zmk,conditional-layers";\n\n${blocks.join("\n\n")}\n    };\n\n`;
}

// =============================================================================
// Feature detection
// =============================================================================

function detectFeatures(config: KeyboardConfig): { rgb: boolean; output: boolean; pointing: boolean } {
  let rgb = false;
  let output = false;
  let pointing = false;
  for (const layer of config.layers) {
    for (const key of layer.keys) {
      for (const b of [key.tap, key.hold]) {
        if (!b) continue;
        if (b.type === "rgb_ug") rgb = true;
        if (b.type === "out") output = true;
        if (b.type === "mmv" || b.type === "msc" || b.type === "mkp") pointing = true;
      }
    }
  }
  return { rgb, output, pointing };
}

export function generateKeymap(config: KeyboardConfig): GeneratorResult {
  const errors = validateConfig(config);
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const layerBlocks = config.layers.map((layer) => {
    const bindings = layer.keys.map((key) => behaviorToString(key));

    // Chunk into physical rows
    const rows: string[] = [];
    let offset = 0;
    for (const rowLen of GLOVE80_ROW_LENGTHS) {
      rows.push(bindings.slice(offset, offset + rowLen).join("  "));
      offset += rowLen;
    }

    const bindingsStr = rows.map((r) => `                ${r}`).join("\n");
    const name = sanitizeLayerName(layer.name);

    return `        ${name} {
            bindings = <
${bindingsStr}
            >;
        };`;
  });

  const features = detectFeatures(config);
  const includes = [
    "#include <behaviors.dtsi>",
    "#include <dt-bindings/zmk/keys.h>",
    "#include <dt-bindings/zmk/bt.h>",
  ];
  if (features.output) includes.push("#include <dt-bindings/zmk/outputs.h>");
  if (features.rgb) includes.push("#include <dt-bindings/zmk/rgb.h>");
  if (features.pointing) includes.push("#include <dt-bindings/zmk/pointing.h>");

  const macrosSection = generateMacrosSection(config.macros ?? []);
  const behaviorsSection = generateBehaviorsSection(config.modMorphs ?? [], config.holdTaps ?? []);
  const combosSection = generateCombosSection(config.combos ?? []);
  const condLayersSection = generateConditionalLayersSection(config.conditionalLayers ?? []);

  const keymap = `${includes.join("\n")}

/ {
${macrosSection}${behaviorsSection}${combosSection}${condLayersSection}    keymap {
        compatible = "zmk,keymap";

${layerBlocks.join("\n\n")}
    };
};
`;

  return { ok: true, keymap };
}
