/** Parsed view of native ZMK bindings used for rendering and search. */
export type Behavior =
  | { type: "kp"; keyCode: string }
  | { type: "mo"; layerIndex: number }
  | { type: "to"; layerIndex: number }
  | { type: "sl"; layerIndex: number }
  | { type: "tog"; layerIndex: number }
  | { type: "trans" }
  | { type: "none" }
  | { type: "bootloader" }
  | { type: "sys_reset" }
  | { type: "caps_word" }
  | { type: "bt"; action: "BT_SEL" | "BT_CLR" | "BT_CLR_ALL" | "BT_NXT" | "BT_PRV" | "BT_DISC"; profileIndex?: number }
  | { type: "rgb_ug"; action: string }
  | { type: "out"; action: "OUT_BLE" | "OUT_USB" }
  | { type: "mmv"; direction: string; precision?: boolean }
  | { type: "msc"; direction: string }
  | { type: "mkp"; button: string }
  | { type: "macro"; macroName: string; param?: string; param2?: string }
  | { type: "mod_morph"; name: string }
  | { type: "hold_tap"; name: string; param1: string; param2: string }
  | { type: "tap_dance"; name: string };

export interface Key {
  tap: Behavior;
  /** Null when holding the key repeats its tap behavior. */
  hold: Behavior | null;
}

export interface Layer {
  name: string;
  keys: Key[];
}

export type MacroStep =
  | { directive: "press" | "tap" | "release"; bindings: string[] }
  | { directive: "pause_for_release" | "param_1to1" | "param_2to1" };

export interface MacroDefinition {
  name: string;
  label?: string;
  bindingCells?: 1 | 2;
  waitMs?: number;
  tapMs?: number;
  steps: MacroStep[];
}

export interface ModMorphDefinition {
  name: string;
  label?: string;
  defaultBinding: string;
  morphBinding: string;
  mods: string[];
}

export interface HoldTapDefinition {
  name: string;
  label?: string;
  flavor: "balanced" | "tap-preferred" | "hold-preferred";
  tappingTermMs: number;
  quickTapMs?: number;
  requirePriorIdleMs?: number;
  holdBinding: string;
  tapBinding: string;
  holdTriggerKeyPositions?: number[];
  holdTriggerOnRelease?: boolean;
}

export interface TapDanceDefinition {
  name: string;
  label?: string;
  tappingTermMs?: number;
  /** Raw ZMK bindings, ordered by tap count. */
  bindings: string[];
}

export interface ComboDefinition {
  name: string;
  keyPositions: number[];
  binding: string;
  timeoutMs?: number;
  requirePriorIdleMs?: number;
  layers?: number[];
}

export interface ConditionalLayerDefinition {
  name: string;
  ifLayers: number[];
  thenLayer: number;
}

/** Read model derived from config files. It is never serialized as configuration. */
export interface Keymap {
  layers: Layer[];
  macros?: MacroDefinition[];
  modMorphs?: ModMorphDefinition[];
  holdTaps?: HoldTapDefinition[];
  tapDances?: TapDanceDefinition[];
  combos?: ComboDefinition[];
  conditionalLayers?: ConditionalLayerDefinition[];
}

export const GLOVE80_KEY_COUNT = 80;
