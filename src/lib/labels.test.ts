import { describe, it, expect } from "vitest";
import { behaviorLabel, holdTapSecondaryLabel, keyCodeDisplayLabel } from "./labels";
import type { Behavior } from "../types/schema";

describe("behaviorLabel", () => {
  it("kp returns resolved display label", () => {
    expect(behaviorLabel({ type: "kp", keyCode: "A" })).toBe("A");
    expect(behaviorLabel({ type: "kp", keyCode: "LSHIFT" })).toBe("⇧");
  });

  it("mo returns symbol + index", () => {
    expect(behaviorLabel({ type: "mo", layerIndex: 1 })).toBe("◇ 1");
  });

  it("to returns symbol + index", () => {
    expect(behaviorLabel({ type: "to", layerIndex: 2 })).toBe("⇨ 2");
  });

  it("sl returns symbol + index", () => {
    expect(behaviorLabel({ type: "sl", layerIndex: 0 })).toBe("◆ 0");
  });

  it("trans returns empty string", () => {
    expect(behaviorLabel({ type: "trans" })).toBe("");
  });

  it("none returns empty string", () => {
    expect(behaviorLabel({ type: "none" })).toBe("");
  });

  it("bootloader returns BOOT", () => {
    expect(behaviorLabel({ type: "bootloader" })).toBe("BOOT");
  });

  it("sys_reset returns RESET", () => {
    expect(behaviorLabel({ type: "sys_reset" })).toBe("RESET");
  });

  it("bt BT_SEL returns BT SEL + profile", () => {
    expect(behaviorLabel({ type: "bt", action: "BT_SEL", profileIndex: 2 })).toBe("BT SEL 2");
  });

  it("bt BT_SEL defaults to profile 0", () => {
    const b: Behavior = { type: "bt", action: "BT_SEL" };
    expect(behaviorLabel(b)).toBe("BT SEL 0");
  });

  it("bt BT_CLR returns BT CLR", () => {
    expect(behaviorLabel({ type: "bt", action: "BT_CLR" })).toBe("BT CLR");
  });

  it("bt BT_NXT returns BT NXT", () => {
    expect(behaviorLabel({ type: "bt", action: "BT_NXT" })).toBe("BT NXT");
  });

  it("bt BT_PRV returns BT PRV", () => {
    expect(behaviorLabel({ type: "bt", action: "BT_PRV" })).toBe("BT PRV");
  });

  it("tog returns symbol + index", () => {
    expect(behaviorLabel({ type: "tog", layerIndex: 3 })).toBe("⇄ 3");
  });

  it("caps_word returns CAPS", () => {
    expect(behaviorLabel({ type: "caps_word" })).toBe("CAPS");
  });

  it("rgb_ug returns action", () => {
    expect(behaviorLabel({ type: "rgb_ug", action: "RGB_TOG" })).toBe("RGB_TOG");
  });

  it("out returns friendly name", () => {
    expect(behaviorLabel({ type: "out", action: "OUT_BLE" })).toBe("BLE");
    expect(behaviorLabel({ type: "out", action: "OUT_USB" })).toBe("USB");
  });

  it("mmv returns shortened direction", () => {
    expect(behaviorLabel({ type: "mmv", direction: "MOVE_UP" })).toBe("M_UP");
    expect(behaviorLabel({ type: "mmv", direction: "MOVE_DOWN" })).toBe("M_DN");
    expect(behaviorLabel({ type: "mmv", direction: "MOVE_RIGHT" })).toBe("M_RHT");
    expect(behaviorLabel({ type: "mmv", direction: "MOVE_LEFT" })).toBe("M_LEFT");
  });

  it("precision mmv returns p-prefixed label", () => {
    expect(behaviorLabel({ type: "mmv", direction: "MOVE_UP", precision: true })).toBe("pM_UP");
    expect(behaviorLabel({ type: "mmv", direction: "MOVE_DOWN", precision: true })).toBe("pM_DN");
  });

  it("msc returns shortened direction", () => {
    expect(behaviorLabel({ type: "msc", direction: "SCRL_UP" })).toBe("SC_UP");
    expect(behaviorLabel({ type: "msc", direction: "SCRL_DOWN" })).toBe("SC_DN");
    expect(behaviorLabel({ type: "msc", direction: "SCRL_RIGHT" })).toBe("SC_RHT");
    expect(behaviorLabel({ type: "msc", direction: "SCRL_LEFT" })).toBe("SC_LEFT");
  });

  it("mkp returns button", () => {
    expect(behaviorLabel({ type: "mkp", button: "LCLK" })).toBe("LCLK");
  });

  it("hold_tap shows tap key for HRM names, definition name otherwise", () => {
    // HRM (hml_/hmr_ prefix): show tap key (param2)
    expect(behaviorLabel({ type: "hold_tap", name: "hml_lgui", param1: "0", param2: "A" })).toBe("A");
    expect(behaviorLabel({ type: "hold_tap", name: "hml_lshift", param1: "0", param2: "S" })).toBe("S");
    expect(behaviorLabel({ type: "hold_tap", name: "hmr_rctrl", param1: "0", param2: "SEMI" })).toBe(";");
    // magic: show "magic-tap"
    expect(behaviorLabel({ type: "hold_tap", name: "magic", param1: "1", param2: "0" })).toBe("magic-tap");
    // generic: show definition name
    expect(behaviorLabel({ type: "hold_tap", name: "my_ht", param1: "0", param2: "A" })).toBe("my_ht");
  });

  it("hold_tap with mod-morph tapBinding resolves base key from definition", () => {
    const modMorphs = [{
      id: "mm1",
      name: "mm_q_shift_qmark",
      defaultBinding: "&kp Q",
      morphBinding: "&kp QMARK",
      mods: ["MOD_LSFT", "MOD_RSFT"],
    }];
    const holdTaps = [{
      id: "ht1",
      name: "hml_lctrl_mm_q_shift_qmark",
      flavor: "balanced" as const,
      tappingTermMs: 280,
      holdBinding: "&kp",
      tapBinding: "&mm_q_shift_qmark",
    }];
    // param2 is "0" but label should resolve to "Q" via holdTap → modMorph lookup
    expect(behaviorLabel(
      { type: "hold_tap", name: "hml_lctrl_mm_q_shift_qmark", param1: "LCTRL", param2: "0" },
      undefined, modMorphs, holdTaps,
    )).toBe("Q");
  });
});

describe("behaviorLabel with layer names", () => {
  const layerNames = ["Base", "Nav", "Num", "Sym"];

  it("mo shows ◇ + layer name (≤3 chars pass through, >3 truncated)", () => {
    expect(behaviorLabel({ type: "mo", layerIndex: 0 }, layerNames)).toBe("◇ BAS");
    expect(behaviorLabel({ type: "mo", layerIndex: 1 }, layerNames)).toBe("◇ Nav");
  });

  it("to shows ⇨ + layer name", () => {
    expect(behaviorLabel({ type: "to", layerIndex: 2 }, layerNames)).toBe("⇨ Num");
  });

  it("tog shows ⇄ + layer name", () => {
    expect(behaviorLabel({ type: "tog", layerIndex: 3 }, layerNames)).toBe("⇄ Sym");
  });

  it("sl shows ◆ + layer name", () => {
    expect(behaviorLabel({ type: "sl", layerIndex: 0 }, layerNames)).toBe("◆ BAS");
  });

  it("falls back to index when name not found", () => {
    expect(behaviorLabel({ type: "mo", layerIndex: 99 }, layerNames)).toBe("◇ 99");
  });

  it("falls back to index when no layerNames provided", () => {
    expect(behaviorLabel({ type: "mo", layerIndex: 1 })).toBe("◇ 1");
  });
});

describe("holdTapSecondaryLabel", () => {
  it("derives modifier symbol from param1", () => {
    expect(holdTapSecondaryLabel("hml", "LCTRL")).toBe("⌃");
    expect(holdTapSecondaryLabel("hmr", "LGUI")).toBe("⌘");
    expect(holdTapSecondaryLabel("hml", "LG(LALT)")).toBe("⌘⌥");
  });

  it("works with mod-morph HRM variants", () => {
    expect(holdTapSecondaryLabel("hml_mm_q_shift_qmark", "LCTRL")).toBe("⌃");
  });
});

describe("keyCodeDisplayLabel", () => {
  it("letters pass through", () => {
    expect(keyCodeDisplayLabel("A")).toBe("A");
  });

  it("numbers resolve to digit label", () => {
    expect(keyCodeDisplayLabel("N0")).toBe("0");
    expect(keyCodeDisplayLabel("N9")).toBe("9");
  });

  it("punctuation uses symbol", () => {
    expect(keyCodeDisplayLabel("SEMI")).toBe(";");
    expect(keyCodeDisplayLabel("DOT")).toBe(".");
    expect(keyCodeDisplayLabel("COMMA")).toBe(",");
    expect(keyCodeDisplayLabel("FSLH")).toBe("/");
    expect(keyCodeDisplayLabel("BSLH")).toBe("\\");
    expect(keyCodeDisplayLabel("LBKT")).toBe("[");
    expect(keyCodeDisplayLabel("RBKT")).toBe("]");
    expect(keyCodeDisplayLabel("MINUS")).toBe("-");
    expect(keyCodeDisplayLabel("EQUAL")).toBe("=");
    expect(keyCodeDisplayLabel("SQT")).toBe("'");
    expect(keyCodeDisplayLabel("GRAVE")).toBe("`");
    expect(keyCodeDisplayLabel("TILDE")).toBe("~");
  });

  it("arrow keys use triangle symbols with text presentation", () => {
    expect(keyCodeDisplayLabel("UP")).toBe("▲");
    expect(keyCodeDisplayLabel("DOWN")).toBe("▼");
    expect(keyCodeDisplayLabel("LEFT")).toBe("◀\uFE0E");
    expect(keyCodeDisplayLabel("RIGHT")).toBe("▶\uFE0E");
  });

  it("control keys use symbols or abbreviations", () => {
    expect(keyCodeDisplayLabel("BSPC")).toBe("⌫");
    expect(keyCodeDisplayLabel("DEL")).toBe("⌦");
    expect(keyCodeDisplayLabel("RET")).toBe("Enter");
    expect(keyCodeDisplayLabel("SPACE")).toBe("Space");
    expect(keyCodeDisplayLabel("TAB")).toBe("Tab");
    expect(keyCodeDisplayLabel("ESC")).toBe("Esc");
    expect(keyCodeDisplayLabel("CAPS")).toBe("Caps");
    expect(keyCodeDisplayLabel("PG_UP")).toBe("PgUp");
    expect(keyCodeDisplayLabel("PG_DN")).toBe("PgDn");
    expect(keyCodeDisplayLabel("INS")).toBe("Ins");
    expect(keyCodeDisplayLabel("PSCRN")).toBe("PrtSc");
    expect(keyCodeDisplayLabel("SLCK")).toBe("ScrLk");
    expect(keyCodeDisplayLabel("PAUSE_BREAK")).toBe("Pause");
    expect(keyCodeDisplayLabel("HOME")).toBe("Home");
    expect(keyCodeDisplayLabel("END")).toBe("End");
  });

  it("standalone modifiers use Mac symbols", () => {
    expect(keyCodeDisplayLabel("LSHIFT")).toBe("⇧");
    expect(keyCodeDisplayLabel("RSHIFT")).toBe("⇧R");
    expect(keyCodeDisplayLabel("LCTRL")).toBe("⌃");
    expect(keyCodeDisplayLabel("RCTRL")).toBe("⌃R");
    expect(keyCodeDisplayLabel("LALT")).toBe("⌥");
    expect(keyCodeDisplayLabel("RALT")).toBe("⌥R");
    expect(keyCodeDisplayLabel("LGUI")).toBe("⌘");
    expect(keyCodeDisplayLabel("RGUI")).toBe("⌘R");
  });

  it("modified keys use modifier symbols + resolved base key", () => {
    expect(keyCodeDisplayLabel("LC(S)")).toBe("⌃S");
    expect(keyCodeDisplayLabel("LS(FSLH)")).toBe("⇧/");
    expect(keyCodeDisplayLabel("LA(LC(DEL))")).toBe("⌥⌃⌦");
    expect(keyCodeDisplayLabel("LG(N1)")).toBe("⌘1");
  });

  it("function keys pass through", () => {
    expect(keyCodeDisplayLabel("F1")).toBe("F1");
    expect(keyCodeDisplayLabel("F12")).toBe("F12");
  });

  it("media keys use label", () => {
    expect(keyCodeDisplayLabel("C_VOL_UP")).toBe("Vol Up");
    expect(keyCodeDisplayLabel("C_PP")).toBe("Play/Pause");
  });

  it("unknown codes pass through", () => {
    expect(keyCodeDisplayLabel("UNKNOWN_KEY")).toBe("UNKNOWN_KEY");
  });
});
