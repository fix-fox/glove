import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadKeymap } from "./keymap-loader";

let directory: string;
let path: string;
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), "glove-loader-")); path = join(directory, "test.keymap"); });
afterEach(() => rmSync(directory, { recursive: true, force: true }));

function source(first = "&kp A", header = "", extra = ""): string {
  const transparent = Array(79).fill("&trans").join(" ");
  return header + '\n/ {\n' + extra + '\nkeymap { compatible = "zmk,keymap";\n' +
    'base { bindings = <' + first + " " + transparent + '>; };\n' +
    'nav { bindings = <&none ' + transparent + '>; };\n};\n};\n';
}

function load(text: string) { writeFileSync(path, text); return loadKeymap(path); }

describe("native keymap reader", () => {
  it("loads the real config with the seven intentional removals and preserved labels", () => {
    const { config } = loadKeymap();
    expect(config.layers).toHaveLength(18);
    for (const pos of [1, 65, 66, 67, 68, 77, 78]) expect(config.layers[0]!.keys[pos]).toEqual({ tap: { type: "none" }, hold: null });
    expect(config.layers[15]!.name).toBe("Apps");
    expect(config.macros!.find((macro) => macro.name === "copy_url")?.label).toBe("COPY_URL");
    expect(config.layers[0]!.keys[69]).toEqual({ tap: { type: "mod_morph", name: "mm_bspc_shift_del" }, hold: { type: "mo", layerIndex: 14 } });
    const left = config.holdTaps!.find((definition) => definition.name === "hml")!;
    const tmux = config.holdTaps!.find((definition) => definition.name === "hml_ctrl_a")!;
    expect(tmux.holdTriggerKeyPositions).toEqual(left.holdTriggerKeyPositions);
    expect([left.tappingTermMs, left.quickTapMs, left.requirePriorIdleMs]).toEqual([280, 0, 100]);
  });

  it("expands nested constants, multiline property groups, and includes without losing source locations", () => {
    writeFileSync(join(directory, "settings.h"), '#define NAV 1\n#define TARGET NAV\n#define LAYER_BASE 0\n#define LAYER_NAV NAV\n#define BOTH \\\n      compatible = "zmk,behavior-hold-tap"; \\\n      #binding-cells = <2>;\n');
    const extra = 'behaviors { held: held { BOTH flavor = "balanced"; tapping-term-ms = <200>; bindings = <&mo>, <&kp>; }; };';
    const document = load(source("&to TARGET", '#include "settings.h"', extra));
    expect(document.config.holdTaps![0]!.tappingTermMs).toBe(200);
    expect(document.config.layers[0]!.keys[0]!.tap).toEqual({ type: "to", layerIndex: 1 });
    const binding = document.bindings[0]![0]!;
    expect(readFileSync(path, "utf8").slice(binding.start, binding.end)).toBe("&to TARGET");
    expect(document.sources.size).toBe(2);
  });

  it("keeps nested modifier calls and annotations intact", () => {
    const document = load(source("&kp LC(LG(Q))").replace("base {", "// @label Main layer\nbase {"));
    expect(document.config.layers[0]!.name).toBe("Main layer");
    expect(document.config.layers[0]!.keys[0]!.tap).toEqual({ type: "kp", keyCode: "LC(LG(Q))" });
  });

  it("ignores commented-out directives and binding text", () => {
    const document = load(source("&kp /* &bad Z */ A", '/*\n#include "missing.h"\n*/\n// #define A BAD'));
    expect(document.config.layers[0]!.keys[0]!.tap).toEqual({ type: "kp", keyCode: "A" });
  });

  it("rejects line-spliced comments that the C preprocessor would extend", () => {
    expect(() => load(source("&kp A // comment \\\n&kp B"))).toThrow(/Line continuations inside comments/);
    expect(() => load(source("&kp \\\nA"))).toThrow(/Line continuations are supported only/);
  });

  it("reads precision movement after expansion inside a function call", () => {
    const document = load(source("&mmv MOVE_X(-SPEED)", "#define SPEED 300"));
    expect(document.config.layers[0]!.keys[0]!.tap).toEqual({ type: "mmv", direction: "MOVE_LEFT", precision: true });
  });

  it.each([
    ["&not_defined", /Unknown behavior/],
    ["&kp", /expects 1 arguments/],
    ["&none A", /expects 0 arguments/],
    ["&to 2", /Layer index out of range/],
    ["&to UNDEFINED", /Expected a decimal/],
    ["&to 01", /without leading zeroes/],
    ["&kp LC(A", /Unclosed parenthesized/],
  ])("rejects invalid binding %s with source context", (binding, error) => {
    expect(() => load(source(binding))).toThrow(error);
    try { load(source(binding)); } catch (cause) { expect(String(cause)).toContain(path + ":"); }
  });

  it.each([
    ["#if 1\n#endif", /Unsupported directive/],
    ["#define F(x) x", /Unsupported directive/],
    ["#include <unknown.dtsi>", /Unsupported system include/],
    ["#define A B\n#define B A", /Recursive constant/],
    ["#define X 1\n#define X 2", /Duplicate constant/],
  ])("rejects unsupported or ambiguous preprocessing %s", (header, error) => {
    expect(() => load(source("&kp A", header))).toThrow(error);
  });

  it("rejects a moved layer with stale named indices", () => {
    expect(() => load(source("&kp A", "#define LAYER_BASE 1"))).toThrow(/must equal declaration index 0/);
  });

  it("rejects include cycles and repeated includes", () => {
    writeFileSync(join(directory, "settings.h"), '#include "test.keymap"\n');
    expect(() => load(source("&kp A", '#include "settings.h"'))).toThrow(/Include cycle/);
    writeFileSync(join(directory, "settings.h"), '#define SOME_VALUE 1\n');
    expect(() => load(source("&kp A", '#include "settings.h"\n#include "settings.h"'))).toThrow(/Duplicate include/);
  });

  it("rejects missing includes without presenting a partial keymap", () => {
    expect(() => load(source("&kp A", '#include "missing.h"'))).toThrow(/ENOENT/);
  });

  it("rejects wrong layer sizes, duplicate properties, and duplicate nodes", () => {
    expect(() => load(source("&none &none"))).toThrow(/needs 80 bindings, got 81/);
    expect(() => load(source().replace("base {", "base { bindings = <&none>;"))).toThrow(/Duplicate property/);
    expect(() => load(source().replace("nav {", "base {"))).toThrow(/Duplicate node/);
  });

  it("rejects unknown properties and unclosed nodes instead of ignoring them", () => {
    expect(() => load(source().replace("base {", "base { typo = <3>;"))).toThrow(/Unsupported property typo/);
    expect(() => load(source().slice(0, -4))).toThrow(/Unclosed node|Unexpected end/);
  });

  it("rejects an incompatible builtin override", () => {
    const header = '&lt { flavor = "balanced"; tapping-term-ms = <200>; #binding-cells = <0>; };';
    expect(() => load(source("&none", header))).toThrow(/cannot be changed/);
  });

  it("validates layer arguments forwarded by a custom hold-tap", () => {
    const extra = 'behaviors { magic: magic { compatible = "zmk,behavior-hold-tap"; #binding-cells = <2>; flavor = "balanced"; tapping-term-ms = <200>; bindings = <&mo>, <&kp>; }; };';
    expect(() => load(source("&magic 999 A", "", extra))).toThrow(/Layer index out of range/);
    expect(load(source("&magic 1 A", "", extra)).config.layers[0]!.keys[0]!.tap.type).toBe("hold_tap");
  });

  it("rejects invalid definition references and cells", () => {
    const extra = 'behaviors { morph: morph { compatible = "zmk,behavior-mod-morph"; #binding-cells = <0>; bindings = <&kp A>, <&missing>; mods = <(MOD_LSFT|MOD_RSFT)>; }; };';
    expect(() => load(source("&morph", "", extra))).toThrow(/Unknown behavior/);
    expect(() => load(source("&morph", "", extra.replace("<0>", "<1>")))).toThrow(/Wrong #binding-cells/);
  });

  it("rejects macro parameter controls outside declared arity", () => {
    const extra = 'macros { one: one { compatible = "zmk,behavior-macro-one-param"; #binding-cells = <1>; bindings = <&macro_param_2to1>, <&macro_tap &kp MACRO_PLACEHOLDER>; }; };';
    expect(() => load(source("&one A", "", extra))).toThrow(/exceeds #binding-cells/);
    const valid = extra.replace("macro_param_2to1", "macro_param_1to1");
    expect(load(source("&one A", "", valid)).config.macros![0]!.bindingCells).toBe(1);
  });

  it("rejects recursive behavior references before they reach firmware", () => {
    const extra = 'macros { loop: loop { compatible = "zmk,behavior-macro"; #binding-cells = <0>; bindings = <&macro_tap &loop>; }; };';
    expect(() => load(source("&loop", "", extra))).toThrow(/Recursive behavior reference/);
  });

  it("rejects nested data in combo and conditional declarations", () => {
    const combo = 'combos { compatible = "zmk,combos"; combo { key-positions = <0 1>; bindings = <&kp A>; hidden { value; }; }; };';
    expect(() => load(source("&none", "", combo))).toThrow(/Nested combo/);
    const conditional = 'conditional_layers { compatible = "zmk,conditional-layers"; conditional { if-layers = <0 1>; then-layer = <1>; hidden { value; }; }; };';
    expect(() => load(source("&none", "", conditional))).toThrow(/Nested conditional/);
  });
});
