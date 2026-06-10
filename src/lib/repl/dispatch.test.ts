import { describe, it, expect } from "vitest";
import { dispatch } from "./dispatch";
import { makeConfig } from "./test-fixtures";

const config = makeConfig();

function outputOf(line: string): string {
  const r = dispatch(config, line);
  if (r.kind !== "output") throw new Error(`expected output, got ${r.kind}`);
  return r.text;
}

function outputOf2(cfg: typeof config, line: string): string {
  const r = dispatch(cfg, line);
  if (r.kind !== "output") throw new Error(`expected output, got ${r.kind}`);
  return r.text;
}

describe("dispatch", () => {
  it("quits on quit/exit", () => {
    expect(dispatch(config, "quit")).toEqual({ kind: "quit" });
    expect(dispatch(config, "exit")).toEqual({ kind: "quit" });
  });

  it("returns empty output for a blank line", () => {
    expect(dispatch(config, "  ")).toEqual({ kind: "output", text: "" });
  });

  it("suggests the closest command for typos", () => {
    expect(outputOf("lyer default")).toContain("Did you mean `layer`?");
  });

  it("prints usage when args are missing", () => {
    expect(outputOf("layer")).toContain("layer <name|index>");
    expect(outputOf("key default")).toContain("key <layer> <pos>");
  });

  it("surfaces resolution errors", () => {
    expect(outputOf("layer nope")).toContain("Unknown layer");
  });

  it("runs list, render, and detail commands", () => {
    expect(outputOf("layers")).toContain("default");
    expect(outputOf("layer default")).toContain("Layer 0: default");
    expect(outputOf("key default RM4")).toContain("kp LG(C)");
    expect(outputOf("macro copy_url")).toContain("1. tap");
    expect(outputOf("combo esc_combo")).toContain("LT1 (22)");
  });

  it("errors on unknown macro with valid names listed", () => {
    expect(outputOf("macro nope")).toContain("copy_url");
  });

  it("runs find and formats results", () => {
    const text = outputOf("find Cmd+C");
    expect(text).toContain("layer default · RM4 (pos 43) · tap → LG(C)");
  });

  it("reports unparseable and no-match find queries", () => {
    expect(outputOf("find foo+c")).toContain("Could not parse");
    expect(outputOf("find F24")).toContain("No bindings found");
  });

  it("returns a flash action for valid flags and usage for bad ones", () => {
    expect(dispatch(config, "flash --remote --full")).toEqual({
      kind: "flash",
      args: ["--remote", "--full"],
    });
    expect(outputOf("flash --bogus")).toContain("--local|--remote");
  });

  it("prints help and per-command help", () => {
    expect(outputOf("help")).toContain("find <query>");
    expect(outputOf("help find")).toContain("reverse lookup");
  });

  it("handles unknown macro/combo when none are defined", () => {
    const { macros, combos, ...rest } = config;
    const empty = rest as typeof config;
    expect(outputOf2(empty, "macro nope")).toContain("No macros defined.");
    expect(outputOf2(empty, "combo nope")).toContain("No combos defined.");
  });
});
