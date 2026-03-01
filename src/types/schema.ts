import { z } from "zod";

// =============================================================================
// Behaviors
// =============================================================================

// &kp A, &kp LSHIFT, &kp N1
const KpSchema = z.object({
  type: z.literal("kp"),
  keyCode: z.string().min(1),
});

// &mo 1 — momentary layer (active while held)
const MoSchema = z.object({
  type: z.literal("mo"),
  layerIndex: z.number().int().min(0),
});

// &to 1 — toggle to layer (stays active)
const ToSchema = z.object({
  type: z.literal("to"),
  layerIndex: z.number().int().min(0),
});

// &sl 1 — sticky/one-shot layer (active for next keypress)
const SlSchema = z.object({
  type: z.literal("sl"),
  layerIndex: z.number().int().min(0),
});

// &trans — transparent, falls through to layer below
const TransSchema = z.object({
  type: z.literal("trans"),
});

// &none — key does nothing
const NoneSchema = z.object({
  type: z.literal("none"),
});

// &bootloader — enter bootloader for flashing
const BootloaderSchema = z.object({
  type: z.literal("bootloader"),
});

// &sys_reset — reset the keyboard
const SysResetSchema = z.object({
  type: z.literal("sys_reset"),
});

// &bt BT_SEL 0, &bt BT_CLR, &bt BT_CLR_ALL, &bt BT_NXT, &bt BT_PRV, &bt BT_DISC 0
const BtSchema = z.object({
  type: z.literal("bt"),
  action: z.enum(["BT_SEL", "BT_CLR", "BT_CLR_ALL", "BT_NXT", "BT_PRV", "BT_DISC"]),
  profileIndex: z.number().int().min(0).max(4).optional(),
});

// &tog 3 — toggle layer on/off
const TogSchema = z.object({
  type: z.literal("tog"),
  layerIndex: z.number().int().min(0),
});

// &caps_word — auto-shift until non-alpha
const CapsWordSchema = z.object({
  type: z.literal("caps_word"),
});

// &rgb_ug RGB_TOG, RGB_BRI, etc.
const RgbUgSchema = z.object({
  type: z.literal("rgb_ug"),
  action: z.string().min(1),
});

// &out OUT_BLE, OUT_USB
const OutSchema = z.object({
  type: z.literal("out"),
  action: z.enum(["OUT_BLE", "OUT_USB"]),
});

// &mmv MOVE_UP, MOVE_DOWN, MOVE_LEFT, MOVE_RIGHT
const MmvSchema = z.object({
  type: z.literal("mmv"),
  direction: z.string().min(1),
  precision: z.boolean().optional(),
});

// &msc SCRL_UP, SCRL_DOWN, SCRL_LEFT, SCRL_RIGHT
const MscSchema = z.object({
  type: z.literal("msc"),
  direction: z.string().min(1),
});

// &mkp LCLK, RCLK, MCLK
const MkpSchema = z.object({
  type: z.literal("mkp"),
  button: z.string().min(1),
});

// &macro_name — references a user-defined macro
const MacroBehaviorSchema = z.object({
  type: z.literal("macro"),
  macroName: z.string().min(1),
});

// &mod_morph_name — references a user-defined mod-morph
const ModMorphBehaviorSchema = z.object({
  type: z.literal("mod_morph"),
  name: z.string().min(1),
});

// &hold_tap_name param1 param2 — references a user-defined hold-tap
const HoldTapBehaviorSchema = z.object({
  type: z.literal("hold_tap"),
  name: z.string().min(1),
  param1: z.string().min(1),
  param2: z.string().min(1),
});

export const BehaviorSchema = z.discriminatedUnion("type", [
  KpSchema,
  MoSchema,
  ToSchema,
  SlSchema,
  TransSchema,
  NoneSchema,
  BootloaderSchema,
  SysResetSchema,
  BtSchema,
  TogSchema,
  CapsWordSchema,
  RgbUgSchema,
  OutSchema,
  MmvSchema,
  MscSchema,
  MkpSchema,
  MacroBehaviorSchema,
  ModMorphBehaviorSchema,
  HoldTapBehaviorSchema,
]);

// =============================================================================
// Key
// =============================================================================

export const KeySchema = z.object({
  // What happens on tap
  tap: BehaviorSchema,
  // What happens on hold (null = tap behavior applies on hold too)
  hold: BehaviorSchema.nullable(),
});

// =============================================================================
// Layer
// =============================================================================

export const LayerSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  keys: z.array(KeySchema).length(80),
});

// =============================================================================
// Macros
// =============================================================================

export const MacroStepSchema = z.discriminatedUnion("directive", [
  z.object({ directive: z.literal("press"), bindings: z.array(z.string().min(1)).min(1) }),
  z.object({ directive: z.literal("tap"), bindings: z.array(z.string().min(1)).min(1) }),
  z.object({ directive: z.literal("release"), bindings: z.array(z.string().min(1)).min(1) }),
  z.object({ directive: z.literal("pause_for_release") }),
  z.object({ directive: z.literal("param_1to1") }),
]);

export const MacroDefinitionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  label: z.string().optional(),
  bindingCells: z.literal(1).optional(),
  waitMs: z.number().int().min(0).optional(),
  tapMs: z.number().int().min(0).optional(),
  steps: z.array(MacroStepSchema).min(1),
});

// =============================================================================
// Mod-Morph definitions
// =============================================================================

export const ModMorphDefinitionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  label: z.string().optional(),
  defaultBinding: z.string().min(1),
  morphBinding: z.string().min(1),
  mods: z.array(z.string().min(1)).min(1),
});

// =============================================================================
// Custom Hold-Tap definitions
// =============================================================================

export const HoldTapDefinitionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  label: z.string().optional(),
  flavor: z.enum(["balanced", "tap-preferred", "hold-preferred"]),
  tappingTermMs: z.number().int().min(0),
  quickTapMs: z.number().int().min(0).optional(),
  requirePriorIdleMs: z.number().int().min(0).optional(),
  holdBinding: z.string().min(1),
  tapBinding: z.string().min(1),
  holdTriggerKeyPositions: z.array(z.number().int().min(0)).optional(),
  holdTriggerOnRelease: z.boolean().optional(),
});

// =============================================================================
// Combos
// =============================================================================

export const ComboDefinitionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  keyPositions: z.array(z.number().int().min(0)).min(2),
  binding: z.string().min(1),
  timeoutMs: z.number().int().min(0).optional(),
  requirePriorIdleMs: z.number().int().min(0).optional(),
  layers: z.array(z.number().int().min(0)).optional(),
});

// =============================================================================
// Conditional Layers
// =============================================================================

export const ConditionalLayerDefinitionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  ifLayers: z.array(z.number().int().min(0)).min(2),
  thenLayer: z.number().int().min(0),
});

// =============================================================================
// Keyboard Config (root)
// =============================================================================

export const MouseSettingsSchema = z.object({
  normalSpeed: z.number().int().min(1),
  precisionSpeed: z.number().int().min(1),
});

export const HrmSettingsSchema = z.object({
  flavor: z.enum(["balanced", "tap-preferred", "hold-preferred"]),
  tappingTermMs: z.number().int().min(0),
  quickTapMs: z.number().int().min(0),
  requirePriorIdleMs: z.number().int().min(0),
});

export const KeyboardConfigSchema = z.object({
  name: z.string().default("My Glove80 Layout"),
  version: z.literal(1),
  layers: z.array(LayerSchema).min(1),
  macros: z.array(MacroDefinitionSchema).optional(),
  modMorphs: z.array(ModMorphDefinitionSchema).optional(),
  holdTaps: z.array(HoldTapDefinitionSchema).optional(),
  combos: z.array(ComboDefinitionSchema).optional(),
  conditionalLayers: z.array(ConditionalLayerDefinitionSchema).optional(),
  hrmSettings: HrmSettingsSchema.optional(),
  mouseSettings: MouseSettingsSchema.optional(),
});

// =============================================================================
// Inferred Types
// =============================================================================

export type Behavior = z.infer<typeof BehaviorSchema>;
export type Key = z.infer<typeof KeySchema>;
export type Layer = z.infer<typeof LayerSchema>;
export type MacroStep = z.infer<typeof MacroStepSchema>;
export type MacroDefinition = z.infer<typeof MacroDefinitionSchema>;
export type ModMorphDefinition = z.infer<typeof ModMorphDefinitionSchema>;
export type HoldTapDefinition = z.infer<typeof HoldTapDefinitionSchema>;
export type ComboDefinition = z.infer<typeof ComboDefinitionSchema>;
export type ConditionalLayerDefinition = z.infer<typeof ConditionalLayerDefinitionSchema>;
export type MouseSettings = z.infer<typeof MouseSettingsSchema>;
export type HrmSettings = z.infer<typeof HrmSettingsSchema>;
export type KeyboardConfig = z.infer<typeof KeyboardConfigSchema>;

// =============================================================================
// Constants
// =============================================================================

export const GLOVE80_KEY_COUNT = 80;

export const DEFAULT_MOUSE_SETTINGS: MouseSettings = {
  normalSpeed: 900,
  precisionSpeed: 300,
};

export const DEFAULT_KEY: Key = {
  tap: { type: "trans" },
  hold: null,
};
