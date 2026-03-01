// =============================================================================
// Mod-active layer and HRM hold-tap auto-management
// =============================================================================

import type { KeyboardConfig, Layer, MacroDefinition, HoldTapDefinition, HrmSettings } from "../types/schema";
import { DEFAULT_KEY, DEFAULT_LT_SETTINGS, GLOVE80_KEY_COUNT } from "../types/schema";
import { HRM_DEFAULTS, hrmSide, getHRMTriggerPositions } from "./hrm";

/** Resolve effective HRM timing settings from config (or fallback to defaults). */
export function getEffectiveHrmSettings(config: KeyboardConfig): HrmSettings {
  return config.hrmSettings ?? HRM_DEFAULTS;
}

/** Resolve effective layer-tap timing settings from config (or fallback to defaults). */
export function getEffectiveLtSettings(config: KeyboardConfig): HrmSettings {
  return config.ltSettings ?? DEFAULT_LT_SETTINGS;
}

export const MOD_ACTIVE_LAYER_NAME = "mod_active";
export const MOD_ACTIVATE_MACRO_NAME = "mod_activate";

/** Detection: is this the auto-managed mod_active layer? */
export function isModActiveLayer(layer: Layer): boolean {
  return layer.name === MOD_ACTIVE_LAYER_NAME;
}

/** Detection: is this the auto-managed mod_activate macro? */
export function isModMacro(macro: MacroDefinition): boolean {
  return macro.name === MOD_ACTIVATE_MACRO_NAME;
}

/**
 * Ensure the mod_active layer exists in the config.
 * Returns the (possibly updated) config and the layer index.
 */
export function ensureModActiveLayer(config: KeyboardConfig): {
  config: KeyboardConfig;
  modActiveLayerIndex: number;
} {
  const existingIdx = config.layers.findIndex((l) => l.name === MOD_ACTIVE_LAYER_NAME);
  if (existingIdx !== -1) {
    return { config, modActiveLayerIndex: existingIdx };
  }

  const newLayer: Layer = {
    id: crypto.randomUUID(),
    name: MOD_ACTIVE_LAYER_NAME,
    keys: Array.from({ length: GLOVE80_KEY_COUNT }, () => ({ ...DEFAULT_KEY })),
  };

  return {
    config: { ...config, layers: [...config.layers, newLayer] },
    modActiveLayerIndex: config.layers.length,
  };
}

/**
 * Ensure the parameterized mod_activate macro exists.
 * Uses zmk,behavior-macro-one-param: param1 = modifier keycode.
 * Activates mod_active layer + presses the modifier.
 */
export function ensureModActivateMacro(
  config: KeyboardConfig,
  modActiveLayerIndex: number,
): KeyboardConfig {
  const macros = config.macros ?? [];
  if (macros.some((m) => m.name === MOD_ACTIVATE_MACRO_NAME)) return config;

  const macro: MacroDefinition = {
    id: crypto.randomUUID(),
    name: MOD_ACTIVATE_MACRO_NAME,
    bindingCells: 1,
    waitMs: 0,
    tapMs: 0,
    steps: [
      { directive: "press", bindings: [`&mo ${modActiveLayerIndex}`] },
      { directive: "param_1to1" },
      { directive: "press", bindings: ["&kp MACRO_PLACEHOLDER"] },
      { directive: "pause_for_release" },
      { directive: "param_1to1" },
      { directive: "release", bindings: ["&kp MACRO_PLACEHOLDER"] },
      { directive: "release", bindings: [`&mo ${modActiveLayerIndex}`] },
    ],
  };

  return { ...config, macros: [...macros, macro] };
}

// =============================================================================
// HRM hold-tap definitions (shared per side + unique mod-morph variants)
// =============================================================================

/**
 * Ensure an HRM hold-tap definition exists for the given key position.
 *
 * Shared definitions (tapBinding = "&kp"):  named "hml" or "hmr"
 * Unique definitions (tapBinding = "&mm_xxx"): named "hml_mm_xxx" or "hmr_mm_xxx"
 *
 * All use &mod_activate as holdBinding (parameterized macro).
 */
export function ensureHRMDef(
  config: KeyboardConfig,
  _modCodes: string[],
  keyIndex: number,
  tapBinding?: string,
): { config: KeyboardConfig; holdTapName: string } {
  const side = hrmSide(keyIndex);
  const resolvedTapBinding = tapBinding ?? "&kp";

  let holdTapName: string = side;
  if (resolvedTapBinding !== "&kp") {
    const tapName = resolvedTapBinding.replace(/^&/, "");
    holdTapName = `${side}_${tapName}`;
  }

  const holdTaps = config.holdTaps ?? [];
  const existing = holdTaps.find((ht) => ht.name === holdTapName);
  if (existing) {
    return { config, holdTapName };
  }

  const triggerPositions = getHRMTriggerPositions(keyIndex);
  const s = getEffectiveHrmSettings(config);

  const def: HoldTapDefinition = {
    id: crypto.randomUUID(),
    name: holdTapName,
    flavor: s.flavor,
    tappingTermMs: s.tappingTermMs,
    quickTapMs: s.quickTapMs,
    requirePriorIdleMs: s.requirePriorIdleMs,
    holdBinding: `&${MOD_ACTIVATE_MACRO_NAME}`,
    tapBinding: resolvedTapBinding,
    holdTriggerKeyPositions: triggerPositions,
    holdTriggerOnRelease: true,
  };

  return {
    config: { ...config, holdTaps: [...holdTaps, def] },
    holdTapName,
  };
}

/** Detection: is this an auto-managed HRM definition? */
export function isHRMDef(ht: HoldTapDefinition): boolean {
  return ht.name === "hml" || ht.name === "hmr" ||
    ht.name.startsWith("hml_") || ht.name.startsWith("hmr_");
}

// =============================================================================
// Layer-tap hold-tap definition (shadows built-in &lt with quick-tap)
// =============================================================================

export const LT_DEF_NAME = "lt";

export function ensureLtDef(config: KeyboardConfig): KeyboardConfig {
  const holdTaps = config.holdTaps ?? [];
  if (holdTaps.some((ht) => ht.name === LT_DEF_NAME)) return config;
  const s = getEffectiveLtSettings(config);
  const def: HoldTapDefinition = {
    id: crypto.randomUUID(),
    name: LT_DEF_NAME,
    flavor: s.flavor,
    tappingTermMs: s.tappingTermMs,
    quickTapMs: s.quickTapMs,
    requirePriorIdleMs: s.requirePriorIdleMs,
    holdBinding: "&mo",
    tapBinding: "&kp",
  };
  return { ...config, holdTaps: [...holdTaps, def] };
}

export function isLtDef(ht: HoldTapDefinition): boolean {
  return ht.name === LT_DEF_NAME;
}

/**
 * Ensure a layer-tap hold-tap definition exists for a non-kp tap binding.
 * Named "lt_<tapName>" with holdBinding=&mo, tapBinding=&<tapName>.
 */
export function ensureLayerTapDef(
  config: KeyboardConfig,
  tapBehaviorName: string,
): { config: KeyboardConfig; holdTapName: string } {
  const holdTapName = `lt_${tapBehaviorName}`;
  const holdTaps = config.holdTaps ?? [];
  if (holdTaps.some((ht) => ht.name === holdTapName)) {
    return { config, holdTapName };
  }
  const s = getEffectiveLtSettings(config);
  const def: HoldTapDefinition = {
    id: crypto.randomUUID(),
    name: holdTapName,
    flavor: s.flavor,
    tappingTermMs: s.tappingTermMs,
    quickTapMs: s.quickTapMs,
    requirePriorIdleMs: s.requirePriorIdleMs,
    holdBinding: "&mo",
    tapBinding: `&${tapBehaviorName}`,
  };
  return {
    config: { ...config, holdTaps: [...holdTaps, def] },
    holdTapName,
  };
}
