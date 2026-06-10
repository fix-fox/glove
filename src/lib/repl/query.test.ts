import { describe, it, expect } from "vitest";
import { resolveLayer, resolvePosition } from "./query";
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
