import { describe, it, expect } from "vitest";
import { complete, COMMANDS } from "./complete";
import { makeConfig } from "./test-fixtures";

const config = makeConfig();

describe("complete", () => {
  it("completes command names on the first token", () => {
    expect(complete(config, "")).toEqual([COMMANDS, ""]);
    expect(complete(config, "la")[0]).toEqual(["layers", "layer"]);
  });

  it("completes layer names after `layer`", () => {
    expect(complete(config, "layer sy")[0]).toEqual(["symbols", "system"]);
    expect(complete(config, "layer ")[0]).toEqual(["default", "symbols", "system"]);
  });

  it("completes layer names then key names for `key`", () => {
    expect(complete(config, "key def")[0]).toEqual(["default"]);
    expect(complete(config, "key default LM")[0]).toEqual([
      "LM1", "LM2", "LM3", "LM4", "LM5", "LM6",
    ]);
  });

  it("completes macro and combo names", () => {
    expect(complete(config, "macro co")[0]).toEqual(["copy_url"]);
    expect(complete(config, "combo e")[0]).toEqual(["esc_combo"]);
  });

  it("completes flash flags", () => {
    expect(complete(config, "flash --l")[0]).toEqual(["--local"]);
  });

  it("completes command names after `help`", () => {
    expect(complete(config, "help fi")[0]).toEqual(["find"]);
  });

  it("returns no candidates where completion makes no sense", () => {
    expect(complete(config, "find Cmd")[0]).toEqual([]);
  });
});
