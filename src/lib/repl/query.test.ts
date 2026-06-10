import { describe, it, expect } from "vitest";
import { resolveLayer, resolvePosition, parseFindQuery, findBindings } from "./query";
import { makeConfig } from "./test-fixtures";

describe("resolveLayer", () => {
  const config = makeConfig();

  it("resolves by index", () => {
    const r = resolveLayer(config, "1");
    expect(r).toMatchObject({ ok: true, value: { index: 1 } });
  });

  it("rejects out-of-range index", () => {
    const r = resolveLayer(config, "3");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("out of range");
  });

  it("resolves exact name case-insensitively", () => {
    const r = resolveLayer(config, "SYMBOLS");
    expect(r).toMatchObject({ ok: true, value: { index: 1 } });
  });

  it("resolves a unique prefix", () => {
    const r = resolveLayer(config, "def");
    expect(r).toMatchObject({ ok: true, value: { index: 0 } });
  });

  it("errors on ambiguous prefix, listing the matches", () => {
    const r = resolveLayer(config, "sy");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("symbols");
      expect(r.error).toContain("system");
    }
  });

  it("errors on unknown name, listing valid layers", () => {
    const r = resolveLayer(config, "nope");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("default");
  });
});

describe("resolvePosition", () => {
  it("accepts a numeric position", () => {
    expect(resolvePosition("43")).toEqual({ ok: true, value: 43 });
  });

  it("rejects positions above 79", () => {
    const r = resolvePosition("80");
    expect(r.ok).toBe(false);
  });

  it("resolves key names case-insensitively", () => {
    expect(resolvePosition("lm1")).toEqual({ ok: true, value: 34 });
    expect(resolvePosition("RM4")).toEqual({ ok: true, value: 43 });
  });

  it("errors on unknown key name with a hint", () => {
    const r = resolvePosition("XX9");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("LM3");
  });
});

describe("parseFindQuery", () => {
  it("parses Cmd+C", () => {
    expect(parseFindQuery("Cmd+C")).toEqual({ mods: ["LG"], key: "C" });
  });

  it("parses ZMK form LG(C)", () => {
    expect(parseFindQuery("LG(C)")).toEqual({ mods: ["LG"], key: "C" });
  });

  it("parses Mac symbol form ⌘C", () => {
    expect(parseFindQuery("⌘C")).toEqual({ mods: ["LG"], key: "C" });
  });

  it("parses a bare keycode", () => {
    expect(parseFindQuery("f5")).toEqual({ mods: [], key: "F5" });
  });

  it("sorts multiple modifiers", () => {
    expect(parseFindQuery("Shift+Cmd+C")).toEqual({ mods: ["LG", "LS"], key: "C" });
  });

  it("returns null for empty or unknown-modifier input", () => {
    expect(parseFindQuery("")).toBeNull();
    expect(parseFindQuery("foo+c")).toBeNull();
  });
});

describe("findBindings", () => {
  const config = makeConfig();

  it("finds an explicit modified binding on a layer key", () => {
    const results = findBindings(config, { mods: ["LG"], key: "C" });
    const locations = results.map((r) => r.location);
    expect(locations).toContain("layer default · RM4 (pos 43) · tap");
  });

  it("explicit query does not match the bare keycode", () => {
    const results = findBindings(config, { mods: ["LG"], key: "C" });
    expect(results.every((r) => !r.location.includes("pos 20"))).toBe(true);
  });

  it("bare query matches bare and modified bindings, noting modifiers", () => {
    const results = findBindings(config, { mods: [], key: "C" });
    const bare = results.find((r) => r.location.includes("pos 20"));
    const modified = results.find((r) => r.location.includes("pos 43"));
    expect(bare?.note).toBeUndefined();
    expect(modified?.note).toContain("LG");
  });

  it("finds keycodes in macro steps, including split bindings", () => {
    const results = findBindings(config, { mods: ["LG"], key: "C" });
    expect(results.some((r) => r.location === "macro copy_url · step 2 (tap)")).toBe(true);
  });

  it("finds hold-tap params", () => {
    const results = findBindings(config, { mods: [], key: "LGUI" });
    expect(results.some((r) => r.location.includes("pos 34"))).toBe(true);
  });

  it("finds keycodes in mod-morph definitions", () => {
    const results = findBindings(config, { mods: [], key: "DEL" });
    expect(results.some((r) => r.location === "mod-morph mm_bspc_shift_del · morph")).toBe(true);
  });

  it("finds keycodes in combo bindings", () => {
    const results = findBindings(config, { mods: [], key: "ESC" });
    expect(results.some((r) => r.location === "combo esc_combo")).toBe(true);
  });

  it("finds plain keycode bindings with the tap slot in the location", () => {
    const results = findBindings(config, { mods: [], key: "F5" });
    expect(results.some((r) => r.location === "layer default · LN1 (pos 10) · tap")).toBe(true);
  });
});
