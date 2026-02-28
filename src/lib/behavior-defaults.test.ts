import { describe, expect, it } from "vitest";
import { BehaviorSchema } from "../types/schema";
import {
  ALL_BEHAVIOR_TYPES,
  BEHAVIOR_TYPE_LABELS,
  HOLD_BEHAVIOR_TYPES,
  defaultBehaviorForType,
} from "./behavior-defaults";

describe("ALL_BEHAVIOR_TYPES", () => {
  it("has 19 types", () => {
    expect(ALL_BEHAVIOR_TYPES).toHaveLength(19);
  });
});

describe("HOLD_BEHAVIOR_TYPES", () => {
  it("has 6 types", () => {
    expect(HOLD_BEHAVIOR_TYPES).toHaveLength(6);
  });

  it("is a subset of ALL_BEHAVIOR_TYPES", () => {
    const all = new Set<string>(ALL_BEHAVIOR_TYPES);
    for (const t of HOLD_BEHAVIOR_TYPES) {
      expect(all).toContain(t);
    }
  });
});

describe("BEHAVIOR_TYPE_LABELS", () => {
  it("has a label for every behavior type", () => {
    for (const t of ALL_BEHAVIOR_TYPES) {
      expect(BEHAVIOR_TYPE_LABELS[t]).toBeTruthy();
    }
  });
});

describe("defaultBehaviorForType", () => {
  it("returns valid behaviors for all types", () => {
    for (const t of ALL_BEHAVIOR_TYPES) {
      const behavior = defaultBehaviorForType(t);
      expect(behavior.type).toBe(t);
      const result = BehaviorSchema.safeParse(behavior);
      expect(result.success).toBe(true);
    }
  });

  it("returns kp with keyCode A", () => {
    const b = defaultBehaviorForType("kp");
    expect(b).toEqual({ type: "kp", keyCode: "A" });
  });

  it("returns mo with layerIndex 0", () => {
    const b = defaultBehaviorForType("mo");
    expect(b).toEqual({ type: "mo", layerIndex: 0 });
  });

  it("returns bt with BT_CLR", () => {
    const b = defaultBehaviorForType("bt");
    expect(b).toEqual({ type: "bt", action: "BT_CLR" });
  });
});
