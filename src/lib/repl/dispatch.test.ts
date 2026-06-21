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
    expect(outputOf("key default")).toContain("key <layer> <pos>");
  });

  it("surfaces resolution errors", () => {
    expect(outputOf("layer nope")).toContain("Unknown layer");
  });

  it("runs list, render, and detail commands", () => {
    expect(outputOf("layers")).toContain("default");
    const r = dispatch(config, "layer default");
    expect(r.kind).toBe("enter-layer");
    if (r.kind === "enter-layer") {
      expect(r.index).toBe(0);
      expect(r.text).toContain("Layer 0: default");
    }
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

describe("layer context", () => {
  const ctx = { layerIndex: 0 };

  it("exit words leave the context", () => {
    for (const word of ["up", "..", "esc", "UP"]) {
      expect(dispatch(config, word, ctx)).toEqual({ kind: "exit-layer" });
    }
  });

  it("exit words are unknown commands at top level", () => {
    const r = dispatch(config, "up");
    expect(r.kind === "output" && r.text.includes("Unknown command")).toBe(true);
  });

  it("bare positions show key detail in context", () => {
    for (const pos of ["RM4", "43", "rm4"]) {
      const r = dispatch(config, pos, ctx);
      expect(r.kind === "output" && r.text.includes("kp LG(C)"), pos).toBe(true);
    }
  });

  it("key auto-fills the context layer with one arg", () => {
    const r = dispatch(config, "key RM4", ctx);
    expect(r.kind === "output" && r.text.includes("kp LG(C)")).toBe(true);
    // explicit two-arg form still works inside a context
    const r2 = dispatch(config, "key symbols 0", ctx);
    expect(r2.kind).toBe("output");
  });

  it("one-arg key at top level still prints usage", () => {
    expect(outputOf("key RM4")).toContain("key <layer> <pos>");
  });

  it("layer switches context", () => {
    const r = dispatch(config, "layer symbols", ctx);
    expect(r.kind).toBe("enter-layer");
    if (r.kind === "enter-layer") expect(r.index).toBe(1);
  });

  it("global commands still work in context", () => {
    const r = dispatch(config, "macros", ctx);
    expect(r.kind === "output" && r.text.includes("copy_url")).toBe(true);
  });

  it("help and unknown-command hints mention the context", () => {
    const h = dispatch(config, "help", ctx);
    expect(h.kind === "output" && h.text.includes('in layer "default"')).toBe(true);
    const u = dispatch(config, "frobnicate", ctx);
    expect(u.kind === "output" && u.text.includes("up")).toBe(true);
  });
});

describe("rm (clear key in layer context)", () => {
  it("clears a base-layer key to none and reports the old binding", () => {
    const cfg = makeConfig();
    const r = dispatch(cfg, "rm RM4", { layerIndex: 0 });
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
    dispatch(cfg, "rm RM4", { layerIndex: 0 }); // now none
    const r = dispatch(cfg, "rm RM4", { layerIndex: 0 });
    expect(r.kind).toBe("output");
    expect(r.kind === "output" && r.text.includes("already clear")).toBe(true);
  });

  it("surfaces position errors and usage", () => {
    const cfg = makeConfig();
    expect(dispatch(cfg, "rm nope", { layerIndex: 0 })).toEqual({
      kind: "output",
      text: expect.stringContaining("Unknown key name"),
    });
    expect(dispatch(cfg, "rm", { layerIndex: 0 })).toEqual({
      kind: "output",
      text: expect.stringContaining("rm <pos>"),
    });
  });

  it("at top level explains a layer is required and does not mutate", () => {
    const cfg = makeConfig();
    const before = JSON.stringify(cfg.layers[0]!.keys[43]);
    const r = dispatch(cfg, "rm RM4");
    expect(r.kind === "output" && r.text.includes("inside a layer")).toBe(true);
    expect(JSON.stringify(cfg.layers[0]!.keys[43])).toBe(before);
  });
});
