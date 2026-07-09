import { describe, it, expect, beforeAll } from "vitest";
import { dispatch } from "./dispatch";
import { makeConfig } from "./test-fixtures";
import { setColorEnabled } from "./color";

beforeAll(() => setColorEnabled(false));

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
    expect(outputOf("key")).toContain("key <pos>");
  });

  it("rejects the old two-arg key form", () => {
    expect(outputOf("key symbols RM4")).toContain("key <pos>");
  });

  it("surfaces resolution errors", () => {
    expect(outputOf("layer nope")).toContain("Unknown layer");
    expect(outputOf("key nope")).toContain("Unknown key name");
  });

  it("runs list, render, and detail commands", () => {
    expect(outputOf("layers")).toContain("default");
    const r = dispatch(config, "layer default");
    expect(r.kind).toBe("show-layer");
    if (r.kind === "show-layer") {
      expect(r.index).toBe(0);
      expect(r.text).toContain("Layer 0: default");
    }
    expect(outputOf("key RM4")).toContain("kp LG(C)");
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

  it("reports no-match find queries (unparseable input falls through to text search)", () => {
    expect(outputOf("find foo+c")).toContain("No bindings found");
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
    expect(outputOf("help key")).toContain("displayed layer");
  });

  it("handles unknown macro/combo when none are defined", () => {
    const { macros, combos, ...rest } = config;
    const empty = rest as typeof config;
    expect(outputOf2(empty, "macro nope")).toContain("No macros defined.");
    expect(outputOf2(empty, "combo nope")).toContain("No combos defined.");
  });
});

describe("find tiers", () => {
  it("keycode tier still works and stays aligned", () => {
    const text = outputOf("find Cmd+C");
    expect(text).toContain("layer default · RM4 (pos 43) · tap → LG(C)");
  });

  it("alias tier expands concepts with a hint", () => {
    // fixture has LG(C) bound → alias "copy" must hit it
    const text = outputOf("find copy");
    expect(text).toContain("copy ≈ ⌘C");
    expect(text).toContain("LG(C)");
  });

  it("text tier finds entities and keycode labels when other tiers miss", () => {
    const text = outputOf("find copy_u");
    expect(text).toContain('macro "copy_url"');
    const text2 = outputOf("find backspace");
    expect(text2).toContain("keycode BSPC");
  });

  it("still reports nothing found", () => {
    expect(outputOf("find frobnicate")).toContain("No bindings found");
  });
});

describe("displayed-layer context", () => {
  it("bare positions show key detail on the displayed layer", () => {
    for (const pos of ["RM4", "43", "rm4"]) {
      const r = dispatch(config, pos);
      expect(r.kind === "output" && r.text.includes("kp LG(C)"), pos).toBe(true);
    }
  });

  it("key and bare positions follow the displayed layer", () => {
    const r = dispatch(config, "key RM4", { layerIndex: 1 });
    expect(r.kind === "output" && r.text.includes('layer 1 "symbols"')).toBe(true);
    const bare = dispatch(config, "RM4", { layerIndex: 1 });
    expect(bare.kind === "output" && bare.text.includes('layer 1 "symbols"')).toBe(true);
  });

  it("layer switches the displayed layer", () => {
    const r = dispatch(config, "layer symbols");
    expect(r.kind).toBe("show-layer");
    if (r.kind === "show-layer") expect(r.index).toBe(1);
  });

  it("old drill-down exit words are plain unknown commands", () => {
    for (const word of ["up", "..", "esc"]) {
      const r = dispatch(config, word);
      expect(r.kind === "output" && r.text.includes("Unknown command"), word).toBe(true);
    }
  });
});

describe("left/right/both (view side)", () => {
  it("switches the shown half, keeping the displayed layer", () => {
    const r = dispatch(config, "left", { layerIndex: 1 });
    expect(r.kind).toBe("show-layer");
    if (r.kind === "show-layer") {
      expect(r.index).toBe(1);
      expect(r.side).toBe("left");
      expect(r.text).toContain("(left half)");
    }
    const b = dispatch(config, "both", { layerIndex: 1, side: "left" });
    expect(b.kind === "show-layer" && b.side === "both").toBe(true);
    expect(b.kind === "show-layer" && !b.text.includes("half")).toBe(true);
  });

  it("layer keeps the current side", () => {
    const r = dispatch(config, "layer symbols", { layerIndex: 0, side: "right" });
    expect(r.kind === "show-layer" && r.side === "right").toBe(true);
    expect(r.kind === "show-layer" && r.text.includes("(right half)")).toBe(true);
  });

  it("rejects arguments with usage", () => {
    expect(outputOf("left foo")).toContain("left half");
  });
});

describe("rm (clear key on the displayed layer)", () => {
  it("clears a base-layer key to none and reports the old binding", () => {
    const cfg = makeConfig();
    const r = dispatch(cfg, "rm RM4");
    expect(r.kind).toBe("mutate");
    if (r.kind === "mutate") {
      expect(r.text).toContain("RM4");
      expect(r.text).toContain("LG(C)");
    }
    expect(cfg.layers[0]!.keys[43]).toEqual({ tap: { type: "none" }, hold: null });
  });

  it("clears a non-base-layer key to trans", () => {
    const cfg = makeConfig();
    const r = dispatch(cfg, "rm 0", { layerIndex: 1 });
    expect(r.kind).toBe("mutate");
    expect(cfg.layers[1]!.keys[0]).toEqual({ tap: { type: "trans" }, hold: null });
  });

  it("reports a no-op without mutating when the key is already clear", () => {
    const cfg = makeConfig();
    dispatch(cfg, "rm RM4"); // now none
    const r = dispatch(cfg, "rm RM4");
    expect(r.kind).toBe("output");
    expect(r.kind === "output" && r.text.includes("already clear")).toBe(true);
  });

  it("surfaces position errors and usage", () => {
    const cfg = makeConfig();
    expect(dispatch(cfg, "rm nope")).toEqual({
      kind: "output",
      text: expect.stringContaining("Unknown key name"),
    });
    expect(dispatch(cfg, "rm")).toEqual({
      kind: "output",
      text: expect.stringContaining("rm <pos>"),
    });
  });
});
