import { describe, it, expect } from "vitest";
import type { Behavior, ModMorphDefinition } from "../types/schema";
import { unpackModMorphChain } from "./mod-morph-utils";

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
