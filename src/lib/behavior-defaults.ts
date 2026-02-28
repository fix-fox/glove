import type { Behavior } from "../types/schema";

export const ALL_BEHAVIOR_TYPES = [
  "kp", "mo", "to", "sl", "tog", "trans", "none", "bootloader", "sys_reset",
  "bt", "caps_word", "rgb_ug", "out", "mmv", "msc", "mkp",
  "macro", "mod_morph", "hold_tap",
] as const;

export const HOLD_BEHAVIOR_TYPES = ["kp", "mo", "to", "sl", "tog", "hold_tap"] as const;

export const BEHAVIOR_TYPE_LABELS: Record<Behavior["type"], string> = {
  kp: "Key Press",
  mo: "Momentary Layer",
  to: "To Layer",
  sl: "Sticky Layer",
  tog: "Toggle Layer",
  trans: "Transparent",
  none: "None",
  bootloader: "Bootloader",
  sys_reset: "System Reset",
  bt: "Bluetooth",
  caps_word: "Caps Word",
  rgb_ug: "RGB Underglow",
  out: "Output Selection",
  mmv: "Mouse Move",
  msc: "Mouse Scroll",
  mkp: "Mouse Click",
  macro: "Macro",
  mod_morph: "Mod-Morph",
  hold_tap: "Custom Hold-Tap",
};

export function defaultBehaviorForType(type: Behavior["type"]): Behavior {
  switch (type) {
    case "kp":
      return { type: "kp", keyCode: "A" };
    case "mo":
      return { type: "mo", layerIndex: 0 };
    case "to":
      return { type: "to", layerIndex: 0 };
    case "sl":
      return { type: "sl", layerIndex: 0 };
    case "trans":
      return { type: "trans" };
    case "none":
      return { type: "none" };
    case "bootloader":
      return { type: "bootloader" };
    case "sys_reset":
      return { type: "sys_reset" };
    case "bt":
      return { type: "bt", action: "BT_CLR" };
    case "tog":
      return { type: "tog", layerIndex: 0 };
    case "caps_word":
      return { type: "caps_word" };
    case "rgb_ug":
      return { type: "rgb_ug", action: "RGB_TOG" };
    case "out":
      return { type: "out", action: "OUT_BLE" };
    case "mmv":
      return { type: "mmv", direction: "MOVE_UP" };
    case "msc":
      return { type: "msc", direction: "SCRL_UP" };
    case "mkp":
      return { type: "mkp", button: "LCLK" };
    case "macro":
      return { type: "macro", macroName: "my_macro" };
    case "mod_morph":
      return { type: "mod_morph", name: "my_morph" };
    case "hold_tap":
      return { type: "hold_tap", name: "my_ht", param1: "0", param2: "SPACE" };
  }
}
