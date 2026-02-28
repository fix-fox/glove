import { describe, it, expect } from "vitest";
import type { Behavior, ModMorphDefinition } from "../types/schema";
import { unpackModMorphChain, packModMorphChain } from "./mod-morph-utils";
import type { ModMorphEntry } from "./mod-morph-utils";

function makeMM(name: string, defaultBinding: string, morphBinding: string, mods: string[]): ModMorphDefinition {
  return { id: crypto.randomUUID(), name, defaultBinding, morphBinding, mods };
}

describe("unpackModMorphChain", () => {
  it("returns null for non-mod_morph behavior", () => {
    expect(unpackModMorphChain({ type: "kp", keyCode: "A" }, [])).toBeNull();
  });

  it("returns null when definition not found", () => {
    const behavior: Behavior = { type: "mod_morph", name: "missing" };
    expect(unpackModMorphChain(behavior, [])).toBeNull();
  });

  it("unpacks single morph", () => {
    const mm = makeMM("mm_q_shift_qmark", "&kp Q", "&kp QMARK", ["MOD_LSFT", "MOD_RSFT"]);
    const behavior: Behavior = { type: "mod_morph", name: "mm_q_shift_qmark" };
    const result = unpackModMorphChain(behavior, [mm]);
    expect(result).toEqual({
      baseKeyCode: "Q",
      morphs: [{ mod: "shift", keyCode: "QMARK" }],
    });
  });

  it("unpacks chained morphs (2 levels)", () => {
    const inner = makeMM("mm_q_shift_qmark", "&kp Q", "&kp QMARK", ["MOD_LSFT", "MOD_RSFT"]);
    const outer = makeMM("mm_q_ctrl_excl", "&mm_q_shift_qmark", "&kp EXCL", ["MOD_LCTL", "MOD_RCTL"]);
    const behavior: Behavior = { type: "mod_morph", name: "mm_q_ctrl_excl" };
    const result = unpackModMorphChain(behavior, [inner, outer]);
    expect(result).toEqual({
      baseKeyCode: "Q",
      morphs: [
        { mod: "shift", keyCode: "QMARK" },
        { mod: "ctrl", keyCode: "EXCL" },
      ],
    });
  });

  it("returns null for malformed morph binding", () => {
    const mm = makeMM("broken", "&kp Q", "&mo 1", ["MOD_LSFT"]);
    const behavior: Behavior = { type: "mod_morph", name: "broken" };
    expect(unpackModMorphChain(behavior, [mm])).toBeNull();
  });
});

describe("packModMorphChain", () => {
  it("returns kp behavior when no morphs", () => {
    const { behavior, newModMorphs } = packModMorphChain("Q", [], []);
    expect(behavior).toEqual({ type: "kp", keyCode: "Q" });
    expect(newModMorphs).toHaveLength(0);
  });

  it("packs single morph", () => {
    const morphs: ModMorphEntry[] = [{ mod: "shift", keyCode: "QMARK" }];
    const { behavior, newModMorphs } = packModMorphChain("Q", morphs, []);

    expect(behavior).toEqual({ type: "mod_morph", name: "mm_q_shift_qmark" });
    expect(newModMorphs).toHaveLength(1);
    expect(newModMorphs[0]!.name).toBe("mm_q_shift_qmark");
    expect(newModMorphs[0]!.defaultBinding).toBe("&kp Q");
    expect(newModMorphs[0]!.morphBinding).toBe("&kp QMARK");
    expect(newModMorphs[0]!.mods).toEqual(["MOD_LSFT", "MOD_RSFT"]);
  });

  it("packs chained morphs", () => {
    const morphs: ModMorphEntry[] = [
      { mod: "shift", keyCode: "QMARK" },
      { mod: "ctrl", keyCode: "EXCL" },
    ];
    const { behavior, newModMorphs } = packModMorphChain("Q", morphs, []);

    expect(behavior).toEqual({ type: "mod_morph", name: "mm_q_ctrl_excl" });
    expect(newModMorphs).toHaveLength(2);
    // Inner: base → shift morph
    expect(newModMorphs[0]!.defaultBinding).toBe("&kp Q");
    expect(newModMorphs[0]!.morphBinding).toBe("&kp QMARK");
    // Outer: chains to inner, ctrl morph
    expect(newModMorphs[1]!.defaultBinding).toBe("&mm_q_shift_qmark");
    expect(newModMorphs[1]!.morphBinding).toBe("&kp EXCL");
  });

  it("reuses existing definition IDs", () => {
    const existing = makeMM("mm_q_shift_qmark", "&kp Q", "&kp QMARK", ["MOD_LSFT", "MOD_RSFT"]);
    const morphs: ModMorphEntry[] = [{ mod: "shift", keyCode: "QMARK" }];
    const { newModMorphs } = packModMorphChain("Q", morphs, [existing]);
    expect(newModMorphs[0]!.id).toBe(existing.id);
  });
});

describe("round-trip", () => {
  it("pack then unpack returns same morphs", () => {
    const morphs: ModMorphEntry[] = [
      { mod: "shift", keyCode: "QMARK" },
      { mod: "ctrl", keyCode: "EXCL" },
    ];
    const { behavior, newModMorphs } = packModMorphChain("Q", morphs, []);
    const unpacked = unpackModMorphChain(behavior, newModMorphs);
    expect(unpacked).toEqual({ baseKeyCode: "Q", morphs });
  });

  it("single morph round-trip", () => {
    const morphs: ModMorphEntry[] = [{ mod: "gui", keyCode: "AT" }];
    const { behavior, newModMorphs } = packModMorphChain("N2", morphs, []);
    const unpacked = unpackModMorphChain(behavior, newModMorphs);
    expect(unpacked).toEqual({ baseKeyCode: "N2", morphs });
  });
});
