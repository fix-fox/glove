import { describe, it, expect } from "vitest";
import {
  LEFT_HAND_POSITIONS,
  LEFT_HRM_TRIGGER_POSITIONS,
  RIGHT_HRM_TRIGGER_POSITIONS,
  isLeftHand,
  hrmSide,
  getHRMTriggerPositions,
  inferModSide,
  modSuffix,
  MOD_SUFFIX_MAP,
  SUFFIX_TO_MOD,
  MOD_SYMBOL,
  HRM_DEFAULTS,
} from "./hrm";

describe("position constants", () => {
  it("LEFT_HAND_POSITIONS contains expected keys", () => {
    // Top-left: position 0
    expect(LEFT_HAND_POSITIONS.has(0)).toBe(true);
    // Home row left: positions 34-39
    for (let i = 34; i <= 39; i++) {
      expect(LEFT_HAND_POSITIONS.has(i)).toBe(true);
    }
    // Right-hand key should not be in left set
    expect(LEFT_HAND_POSITIONS.has(5)).toBe(false);
    expect(LEFT_HAND_POSITIONS.has(40)).toBe(false);
  });

  it("trigger position sets don't overlap with same side", () => {
    const leftTriggerSet = new Set(LEFT_HRM_TRIGGER_POSITIONS);
    // Left hand positions should mostly not be in left trigger positions
    // (triggers are opposite-side keys)
    for (const pos of [0, 1, 2, 3, 4]) {
      expect(leftTriggerSet.has(pos)).toBe(false);
    }
  });

  it("trigger positions include opposite-side keys", () => {
    const leftTriggerSet = new Set(LEFT_HRM_TRIGGER_POSITIONS);
    // Right-hand keys should be in left trigger positions
    for (const pos of [5, 6, 7, 8, 9]) {
      expect(leftTriggerSet.has(pos)).toBe(true);
    }

    const rightTriggerSet = new Set(RIGHT_HRM_TRIGGER_POSITIONS);
    // Left-hand keys should be in right trigger positions
    for (const pos of [0, 1, 2, 3, 4]) {
      expect(rightTriggerSet.has(pos)).toBe(true);
    }
  });
});

describe("isLeftHand", () => {
  it("returns true for left-hand positions", () => {
    expect(isLeftHand(0)).toBe(true);
    expect(isLeftHand(34)).toBe(true);
    expect(isLeftHand(64)).toBe(true);
  });

  it("returns false for right-hand positions", () => {
    expect(isLeftHand(5)).toBe(false);
    expect(isLeftHand(40)).toBe(false);
    expect(isLeftHand(79)).toBe(false);
  });
});

describe("hrmSide", () => {
  it("returns hml for left-hand keys", () => {
    expect(hrmSide(0)).toBe("hml");
    expect(hrmSide(34)).toBe("hml");
  });

  it("returns hmr for right-hand keys", () => {
    expect(hrmSide(5)).toBe("hmr");
    expect(hrmSide(40)).toBe("hmr");
  });
});

describe("getHRMTriggerPositions", () => {
  it("returns left triggers for left-hand keys", () => {
    const triggers = getHRMTriggerPositions(0);
    expect(triggers).toContain(5);
    expect(triggers).not.toContain(0);
  });

  it("returns right triggers for right-hand keys", () => {
    const triggers = getHRMTriggerPositions(5);
    expect(triggers).toContain(0);
    expect(triggers).not.toContain(5);
  });
});

describe("inferModSide", () => {
  it("always returns L* mods regardless of key position", () => {
    // Left-hand positions
    expect(inferModSide("shift", 0)).toBe("LSHIFT");
    expect(inferModSide("ctrl", 34)).toBe("LCTRL");
    expect(inferModSide("alt", 10)).toBe("LALT");
    expect(inferModSide("gui", 22)).toBe("LGUI");
    // Right-hand positions — still L*
    expect(inferModSide("shift", 5)).toBe("LSHIFT");
    expect(inferModSide("ctrl", 40)).toBe("LCTRL");
    expect(inferModSide("alt", 16)).toBe("LALT");
    expect(inferModSide("gui", 28)).toBe("LGUI");
  });
});

describe("modSuffix", () => {
  it("single modifier", () => {
    expect(modSuffix(["LCTRL"])).toBe("lctrl");
  });

  it("multiple modifiers", () => {
    expect(modSuffix(["LGUI", "LALT"])).toBe("lgui_lalt");
  });
});

describe("maps and defaults", () => {
  it("MOD_SUFFIX_MAP covers all 8 modifiers", () => {
    expect(Object.keys(MOD_SUFFIX_MAP)).toHaveLength(8);
  });

  it("SUFFIX_TO_MOD is inverse of MOD_SUFFIX_MAP", () => {
    for (const [code, suffix] of Object.entries(MOD_SUFFIX_MAP)) {
      expect(SUFFIX_TO_MOD[suffix]).toBe(code);
    }
  });

  it("MOD_SYMBOL covers all 8 modifiers", () => {
    expect(Object.keys(MOD_SYMBOL)).toHaveLength(8);
  });

  it("HRM_DEFAULTS has expected values", () => {
    expect(HRM_DEFAULTS.flavor).toBe("balanced");
    expect(HRM_DEFAULTS.tappingTermMs).toBe(280);
    expect(HRM_DEFAULTS.quickTapMs).toBe(175);
    expect(HRM_DEFAULTS.requirePriorIdleMs).toBe(150);
  });
});
