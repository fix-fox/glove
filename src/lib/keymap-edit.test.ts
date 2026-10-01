import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadKeymap } from "./keymap-loader";
import { clearKey } from "./keymap-edit";

let directory: string;
let path: string;
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), "glove-edit-")); path = join(directory, "test.keymap"); });
afterEach(() => rmSync(directory, { recursive: true, force: true }));

function setup(first = "&kp LC(A)", header = ""): string {
  const rest = Array(79).fill("&trans").join("  ");
  const source = header + '\n/ { keymap { compatible = "zmk,keymap";\n' +
    '// @label Base\nbase { bindings = <' + first + " /* keep trailing comment */ " + rest + '>; };\n' +
    'nav { bindings = <&kp B ' + rest + '>; };\n}; };\n';
  writeFileSync(path, source, { mode: 0o640 });
  return source;
}

describe("native binding edits", () => {
  it("changes only the selected binding and preserves comments, formatting, and permissions", () => {
    const source = setup();
    const after = clearKey(loadKeymap(path), 0, 0);
    expect(readFileSync(path, "utf8")).toBe(source.replace("&kp LC(A)", "&none"));
    expect(after.config.layers[0]!.keys[0]).toEqual({ tap: { type: "none" }, hold: null });
    expect(statSync(path).mode & 0o777).toBe(0o640);
    expect(readdirSync(directory)).toEqual(["test.keymap"]);
  });

  it("uses transparent bindings on non-base layers and keeps ranges fresh for consecutive edits", () => {
    setup();
    const first = clearKey(loadKeymap(path), 0, 0);
    const second = clearKey(first, 1, 0);
    expect(second.config.layers[1]!.keys[0]).toEqual({ tap: { type: "trans" }, hold: null });
    expect(readFileSync(path, "utf8")).toContain("nav { bindings = <&trans ");
  });

  it("edits a literal reference with a constant argument at its use site", () => {
    writeFileSync(join(directory, "settings.h"), "#define TARGET 1\n");
    const source = setup("&to TARGET", '#include "settings.h"');
    clearKey(loadKeymap(path), 0, 0);
    expect(readFileSync(path, "utf8")).toBe(source.replace("&to TARGET", "&none"));
    expect(readFileSync(join(directory, "settings.h"), "utf8")).toBe("#define TARGET 1\n");
  });

  it("refuses a stale main file and leaves the external edit untouched", () => {
    const source = setup();
    const document = loadKeymap(path);
    const external = source.replace("&kp B", "&kp C");
    writeFileSync(path, external);
    expect(() => clearKey(document, 0, 0)).toThrow(/changed on disk/);
    expect(readFileSync(path, "utf8")).toBe(external);
  });

  it("checks included files even when the target binding is already clear", () => {
    writeFileSync(join(directory, "settings.h"), "#define TARGET 1\n");
    const original = setup("&none", '#include "settings.h"');
    const document = loadKeymap(path);
    writeFileSync(join(directory, "settings.h"), "#define TARGET 0\n");
    expect(() => clearKey(document, 0, 0)).toThrow(/changed on disk/);
    expect(readFileSync(path, "utf8")).toBe(original);
  });

  it("refuses an include whose symlink was retargeted after loading", () => {
    writeFileSync(join(directory, "old.h"), "#define TARGET 1\n");
    writeFileSync(join(directory, "new.h"), "#define TARGET 0\n");
    const link = join(directory, "settings.h");
    symlinkSync("old.h", link);
    const original = setup("&to TARGET", '#include "settings.h"');
    const document = loadKeymap(path);
    unlinkSync(link);
    symlinkSync("new.h", link);
    expect(() => clearKey(document, 0, 0)).toThrow(/changed its symlink target/);
    expect(readFileSync(path, "utf8")).toBe(original);
    expect(readFileSync(join(directory, "old.h"), "utf8")).toBe("#define TARGET 1\n");
    expect(readFileSync(join(directory, "new.h"), "utf8")).toBe("#define TARGET 0\n");
  });

  it("refuses bindings supplied by shared macros and comments embedded inside a binding", () => {
    const macroSource = setup("KEY", "#define KEY &kp A");
    expect(() => clearKey(loadKeymap(path), 0, 0)).toThrow(/shared macro/);
    expect(readFileSync(path, "utf8")).toBe(macroSource);
    const commentSource = setup("&kp /* important */ A");
    expect(() => clearKey(loadKeymap(path), 0, 0)).toThrow(/contains comments/);
    expect(readFileSync(path, "utf8")).toBe(commentSource);
  });

  it("rejects invalid positions without modifying source", () => {
    const source = setup();
    const document = loadKeymap(path);
    for (const [layer, key] of [[-1, 0], [0, -1], [0, 80], [2, 0], [0, 1.5]]) {
      expect(() => clearKey(document, layer!, key!)).toThrow();
    }
    expect(readFileSync(path, "utf8")).toBe(source);
  });
});
