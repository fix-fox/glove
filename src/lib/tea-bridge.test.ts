import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadKeymap } from "./keymap-loader";
import { setColorEnabled } from "./repl/color";
import { createTeaSnapshot, executeTeaRequest, parseTeaRequest } from "./tea-bridge";

let directory: string;
let path: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "glove-tea-"));
  path = join(directory, "test.keymap");
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
  setColorEnabled(null);
});

function setup(first = "&kp A", header = ""): string {
  const rest = Array(79).fill("&trans").join(" ");
  const source = header + '\n/ { keymap { compatible = "zmk,keymap";\n' +
    'base { bindings = <' + first + " /* retain */ " + rest + '>; };\n' +
    'nav { bindings = <&kp B ' + rest + '>; };\n}; };\n';
  writeFileSync(path, source);
  return source;
}

describe("Bubble Tea bridge", () => {
  it("exposes native labels, physical positions, source locations, and every definition kind", () => {
    const snapshot = createTeaSnapshot(loadKeymap());
    expect(snapshot.path).toBe("config/glove80.keymap");
    expect(snapshot.grid.flat().filter((position) => position !== null).sort((a, b) => a - b))
      .toEqual(Array.from({ length: 80 }, (_, index) => index));
    expect(snapshot.grid[5]!.slice(6, 13)).toEqual([52, 53, 54, null, 55, 56, 57]);
    expect(snapshot.layers.every((layer) => layer.keys.length === 80)).toBe(true);
    expect(snapshot.layers[0]!.keys[35]).toMatchObject({ position: 35, name: "LM2", tap: "A", hold: "⌃", kind: "modifier", editable: true });
    expect(snapshot.layers[0]!.keys[1]).toMatchObject({ tap: "", hold: "", kind: "empty" });
    expect(snapshot.layers[0]!.keys[35]!.source).toMatch(/^config\/glove80\.keymap:\d+$/);
    expect(snapshot.layers[0]!.keys[35]!.detail).toContain("hold-tap hml(LCTRL, A)");
    const hebrew = snapshot.layers.find((layer) => layer.name === "hebrew")!;
    expect(hebrew.keys[35]!.tap).toBe("ש");
    expect(hebrew.keys[0]!.tap).toBe("·");
    expect(new Set(snapshot.entities.map((entity) => entity.kind))).toEqual(new Set([
      "macro", "combo", "hold-tap", "mod-morph", "conditional", "tap-dance",
    ]));
    expect(snapshot.entities.find((entity) => entity.name === "caps_lock")!.detail).toContain("prior idle: 300ms");
    expect(snapshot.entities.find((entity) => entity.name === "hml")!.detail).toContain("quick tap: 0ms");
    expect(snapshot.entities.find((entity) => entity.name === "hebrew_symbols")!.detail).toContain("when: hebrew + symbols");
  });

  it("clears exactly one literal binding and returns a new display revision", () => {
    const original = setup();
    const before = createTeaSnapshot(loadKeymap(path));
    const result = executeTeaRequest({ action: "clear", layer: 0, position: 0, revision: before.revision }, path);
    expect(readFileSync(path, "utf8")).toBe(original.replace("&kp A", "&none"));
    if (!("snapshot" in result)) throw new Error("Expected a snapshot.");
    expect(result.message).toBe("Cleared LC1 on base.");
    expect(result.snapshot.layers[0]!.keys[0]).toMatchObject({ tap: "", kind: "empty" });
    expect(result.snapshot.revision).not.toBe(before.revision);
    const next = executeTeaRequest({ action: "clear", layer: 1, position: 0, revision: result.snapshot.revision }, path);
    if (!("snapshot" in next)) throw new Error("Expected a snapshot.");
    expect(next.snapshot.layers[1]!.keys[0]).toMatchObject({ tap: "·", kind: "empty" });
  });

  it("rejects clear after an included file changes, preserving both files", () => {
    const header = join(directory, "settings.h");
    writeFileSync(header, "#define TARGET 1\n");
    const original = setup("&to TARGET", '#include "settings.h"');
    const before = createTeaSnapshot(loadKeymap(path));
    writeFileSync(header, "#define TARGET 0\n");
    expect(() => executeTeaRequest({ action: "clear", layer: 0, position: 0, revision: before.revision }, path))
      .toThrow("Config changed since it was displayed. Reload before clearing a key.");
    expect(readFileSync(path, "utf8")).toBe(original);
    expect(readFileSync(header, "utf8")).toBe("#define TARGET 0\n");
  });

  it("invalidates a revision when an include symlink changes despite identical contents", () => {
    writeFileSync(join(directory, "one.h"), "#define TARGET 1\n");
    writeFileSync(join(directory, "two.h"), "#define TARGET 1\n");
    const link = join(directory, "settings.h");
    symlinkSync("one.h", link);
    const original = setup("&to TARGET", '#include "settings.h"');
    const before = createTeaSnapshot(loadKeymap(path));
    unlinkSync(link);
    symlinkSync("two.h", link);
    expect(() => executeTeaRequest({ action: "clear", layer: 0, position: 0, revision: before.revision }, path)).toThrow(/Config changed/);
    expect(readFileSync(path, "utf8")).toBe(original);
  });

  it("marks shared and commented bindings as requiring the editor", () => {
    setup("SHARED", "#define SHARED &kp A");
    let snapshot = createTeaSnapshot(loadKeymap(path));
    expect(snapshot.layers[0]!.keys[0]!.editable).toBe(false);
    expect(() => executeTeaRequest({ action: "clear", layer: 0, position: 0, revision: snapshot.revision }, path)).toThrow(/shared macro/);
    setup("&kp /* inside */ A");
    snapshot = createTeaSnapshot(loadKeymap(path));
    expect(snapshot.layers[0]!.keys[0]!.editable).toBe(false);
  });

  it("returns command intents without editing or flashing and removes terminal styling", () => {
    const original = setup();
    const revision = createTeaSnapshot(loadKeymap(path)).revision;
    setColorEnabled(true);
    const request = (command: string) => executeTeaRequest({ action: "command", command, layer: 0, side: "left", revision }, path);
    const clear = request("rm LC1");
    expect(clear).toMatchObject({ result: { kind: "clear-key", position: 0, layerIndex: 0 } });
    expect(JSON.stringify(clear)).not.toContain("\\u001b");
    expect(readFileSync(path, "utf8")).toBe(original);
    expect(request("flash --remote --full")).toEqual({ result: { kind: "flash", args: ["--remote", "--full"] } });
    expect(request("edit")).toEqual({ result: { kind: "edit" } });
    expect(request("layer nav")).toMatchObject({ result: { kind: "show-layer", index: 1, side: "left" } });
    expect(request("find A")).toMatchObject({ result: { kind: "output", text: expect.stringContaining("base") } });
    expect(request("typo")).toMatchObject({ result: { kind: "output", error: true } });
    expect(() => executeTeaRequest({ action: "command", command: "rm LC1", layer: 2, side: "both", revision }, path)).toThrow(/Layer is out of range/);
  });

  it("rejects commands against a changed config until the display reloads", () => {
    const original = setup();
    const revision = createTeaSnapshot(loadKeymap(path)).revision;
    const changed = original.replace("nav {", "navigation {");
    writeFileSync(path, changed);
    const command = { action: "command", command: "layer navigation", layer: 0, side: "both", revision };
    expect(() => executeTeaRequest(command, path)).toThrow("Config changed since it was displayed. Reload before running a command.");
    expect(readFileSync(path, "utf8")).toBe(changed);
    const current = createTeaSnapshot(loadKeymap(path)).revision;
    expect(executeTeaRequest({ ...command, revision: current }, path)).toMatchObject({ result: { kind: "show-layer", index: 1 } });
  });

  it("removes terminal controls from layer names and tap and hold labels", () => {
    const original = setup("&mo 1");
    const annotated = original.replace("&trans", "&lt 1 A").replace("nav {", "// @label \x1b[31mNav\x1b[0m\x07\nnav {");
    writeFileSync(path, annotated);
    const snapshot = createTeaSnapshot(loadKeymap(path));
    expect(snapshot.layers[1]!.name).toBe("Nav");
    expect(snapshot.layers[0]!.keys[0]!.tap).toBe("◇ Nav");
    expect(snapshot.layers[0]!.keys[1]!.hold).toBe("◇ Nav");
    expect(JSON.stringify(snapshot)).not.toMatch(/\\u00(?:1b|07)/);
  });

  it("rejects malformed requests before reading or changing any configuration", () => {
    for (const [request, message] of [
      [null, /JSON request object/],
      [[], /JSON request object/],
      [{ action: "bogus" }, /action must be/],
      [{ action: "snapshot", extra: true }, /Unexpected request field/],
      [{ action: "command", command: "help", layer: -1, side: "both" }, /layer must be/],
      [{ action: "command", command: "help", layer: 0, side: "bogus" }, /side must be/],
      [{ action: "command", command: "help", layer: 0, side: "both" }, /requires the revision/],
      [{ action: "clear", layer: 0, position: 0 }, /requires the revision/],
      [{ action: "clear", layer: 0, position: 1.5, revision: "a".repeat(64) }, /position must be/],
    ] as const) expect(() => executeTeaRequest(request, "/does/not/exist")).toThrow(message);
    expect(() => parseTeaRequest({ action: "clear", layer: 0, position: 0 })).toThrow(/requires the revision/);
    expect(parseTeaRequest({ action: "snapshot" })).toEqual({ action: "snapshot" });
  });

  it("writes one JSON response on success and stderr only for protocol errors", () => {
    const run = (input: string) => spawnSync(process.execPath, ["--no-deprecation", "--import=tsx", resolve("scripts/tea-bridge.ts")], { input, encoding: "utf8" });
    const valid = run('{"action":"snapshot"}');
    expect(valid.status).toBe(0);
    expect(valid.stderr).toBe("");
    expect(JSON.parse(valid.stdout).snapshot.layers[0].name).toBe("default");
    const invalid = run('{"action":"clear","layer":0,"position":0}');
    expect(invalid.status).toBe(1);
    expect(invalid.stdout).toBe("");
    expect(invalid.stderr).toContain("requires the revision");
  });
});
