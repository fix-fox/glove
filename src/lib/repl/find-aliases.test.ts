import { describe, it, expect } from "vitest";
import { FIND_ALIASES, lookupAlias } from "./find-aliases";
import { parseFindQuery } from "./query";

describe("find aliases", () => {
  it("resolves screenshot to the macOS chords", () => {
    const alias = lookupAlias("screenshot");
    expect(alias).toBeDefined();
    expect(alias!.queries).toContain("LG(LS(N5))");
    expect(alias!.queries).toContain("LG(LS(N4))");
    expect(alias!.hint).toContain("⌘⇧5");
  });

  it("is case-insensitive and trims", () => {
    expect(lookupAlias(" Screenshot ")).toBe(FIND_ALIASES.screenshot);
  });

  it("returns undefined for unknown concepts", () => {
    expect(lookupAlias("frobnicate")).toBeUndefined();
  });

  it("every alias query parses as a find query", () => {
    for (const [name, alias] of Object.entries(FIND_ALIASES)) {
      for (const q of alias.queries) {
        expect(parseFindQuery(q), `${name}: ${q}`).not.toBeNull();
      }
    }
  });
});
