import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
const flashScript = resolve("scripts/glove-flash.sh");
let directory: string;
let commandLog: string;
let env: NodeJS.ProcessEnv;

interface Invocation { command: string; args: string[] }

function shellQuote(value: string): string {
  return "'" + value.replaceAll("'", "'\\''") + "'";
}

function git(...args: string[]): string {
  return execFileSync(realGit, args, { cwd: directory, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function calls(): Invocation[] {
  if (!existsSync(commandLog)) return [];
  return readFileSync(commandLog, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as Invocation);
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "glove-flash-test-"));
  commandLog = join(directory, "commands.jsonl");
  const bin = join(directory, "bin");
  mkdirSync(bin);
  mkdirSync(join(directory, "scripts"));
  mkdirSync(join(directory, "config"));
  copyFileSync(flashScript, join(directory, "scripts/glove-flash.sh"));
  env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_SYSTEM: "/dev/null",
    FLASH_TEST_LOG: commandLog,
    FLASH_TEST_GIT: realGit,
    FLASH_TEST_OUTPUT: join(directory, "firmware-output"),
    FLASH_TEST_SCENARIO: "success",
  };
  git("init", "-b", "test-fixture");
  git("config", "user.name", "Flash workflow test");
  git("config", "user.email", "test@example.invalid");
  writeFileSync(join(directory, "config/glove80.keymap"), "fixture\n");
  writeFileSync(join(directory, "config/constants.h"), "#define TERM 250\n");
  git("add", "config");
  git("commit", "-m", "test(keymap): initial fixture");

  const stub = join(directory, "stub.cjs");
  writeFileSync(stub, `
const fs = require("node:fs");
const cp = require("node:child_process");
const [command, ...args] = process.argv.slice(2);
fs.appendFileSync(process.env.FLASH_TEST_LOG, JSON.stringify({command, args}) + "\\n");
if (command === "npm") process.exit(Number(process.env.FLASH_TEST_VALIDATION_EXIT || 0));
if (command === "build") process.exit(61);
if (command === "mktemp") {
  fs.mkdirSync(process.env.FLASH_TEST_OUTPUT);
  console.log(process.env.FLASH_TEST_OUTPUT);
  process.exit(0);
}
if (command === "git") {
  if (args[0] === "push") process.exit(0);
  const result = cp.spawnSync(process.env.FLASH_TEST_GIT, args, { stdio: "inherit" });
  process.exit(result.status === null ? 1 : result.status);
}
if (command === "gh") {
  const scenario = process.env.FLASH_TEST_SCENARIO;
  const sha = cp.execFileSync(process.env.FLASH_TEST_GIT, ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (args[0] === "run" && args[1] === "list") {
    if (scenario === "list-error") process.exit(52);
    if (scenario === "empty") { console.log("[]"); process.exit(0); }
    const run = {
      databaseId: 101,
      status: scenario === "watch-failure" ? "in_progress" : "completed",
      conclusion: scenario === "failed" ? "failure" : scenario === "watch-failure" ? null : "success",
      headSha: scenario === "wrong-sha" ? "0".repeat(40) : sha,
      headBranch: "test-fixture",
      createdAt: "2026-10-01T10:00:00Z",
      displayTitle: "Fixture build",
    };
    console.log(JSON.stringify([run]));
    if (scenario === "head-changed") {
      cp.execFileSync(process.env.FLASH_TEST_GIT, ["commit", "--allow-empty", "-m", "test(keymap): concurrent change"]);
    }
    process.exit(0);
  }
  if (args[0] === "run" && args[1] === "watch") process.exit(53);
  // Deliberately stop before any artifact or device access, even on a successful selection.
  if (args[0] === "run" && args[1] === "download") process.exit(73);
}
console.error("Unexpected test command", command, args);
process.exit(99);
`);
  for (const command of ["npm", "git", "gh", "mktemp"]) {
    writeFileSync(join(bin, command), `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(stub)} ${shellQuote(command)} "$@"\n`, { mode: 0o755 });
  }
  writeFileSync(join(directory, "scripts/zmk-docker-build.sh"), `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(stub)} build "$@"\n`, { mode: 0o755 });
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

function flash(args: string[] = ["--remote"], input = "y", overrides: NodeJS.ProcessEnv = {}) {
  return spawnSync("bash", [join(directory, "scripts/glove-flash.sh"), ...args], {
    cwd: directory, env: { ...env, ...overrides }, input, encoding: "utf8", timeout: 10_000,
  });
}

function downloads(): Invocation[] {
  return calls().filter(({ command, args }) => command === "gh" && args[1] === "download");
}

describe("native firmware workflow", () => {
  it.each([["--local"], ["--remote"]])("stops before any build when validation fails in %s mode", (mode) => {
    const result = flash([mode], "y", { FLASH_TEST_VALIDATION_EXIT: "42" });
    expect(result.status, result.stderr).toBe(42);
    expect(calls()).toEqual([{ command: "npm", args: ["run", "check-config", "--silent"] }]);
  });

  it("keeps the default local build and stops on its failure", () => {
    const result = flash([]);
    expect(result.status, result.stderr).toBe(61);
    expect(calls().find(({ command }) => command === "build")?.args).toEqual([
      "--board", "glove80_lh", "--output-dir", env.FLASH_TEST_OUTPUT,
    ]);
    expect(downloads()).toEqual([]);
  });

  it("commits staged headers and new includes, then selects the new HEAD", () => {
    const initialHead = git("rev-parse", "HEAD");
    writeFileSync(join(directory, "config/constants.h"), "#define TERM 300\n");
    git("add", "config/constants.h");
    writeFileSync(join(directory, "config/shared.dtsi"), "// new shared behaviors\n");
    const result = flash(["--remote"], "yy");
    expect(result.status, result.stderr).toBe(73);
    const head = git("rev-parse", "HEAD");
    expect(head).not.toBe(initialHead);
    expect(git("show", "HEAD:config/constants.h")).toBe("#define TERM 300");
    expect(git("show", "HEAD:config/shared.dtsi")).toBe("// new shared behaviors");
    expect(calls()).toContainEqual({ command: "git", args: ["add", "-A", "--", "config"] });
    expect(calls()).toContainEqual({ command: "git", args: ["push"] });
    const list = calls().find(({ command, args }) => command === "gh" && args[1] === "list")!;
    expect(list.args[list.args.indexOf("--commit") + 1]).toBe(head);
    expect(downloads()).toHaveLength(1);
    expect(downloads()[0]!.args.slice(0, 3)).toEqual(["run", "download", "101"]);
  });

  it.each(["empty", "wrong-sha", "failed", "list-error", "watch-failure", "head-changed"])("refuses downloads when exact-commit selection fails: %s", (scenario) => {
    const result = flash(["--remote"], "y", { FLASH_TEST_SCENARIO: scenario });
    expect(result.status, result.stdout + result.stderr).not.toBe(0);
    expect(downloads()).toEqual([]);
    const list = calls().find(({ command, args }) => command === "gh" && args[1] === "list")!;
    expect(list.args).toContain("--commit");
    if (scenario === "empty") expect(result.stderr).toContain("No firmware build found for current commit");
    if (scenario === "wrong-sha") expect(result.stderr).toContain("does not match current commit");
    if (scenario === "failed") expect(result.stdout).toContain("failed (status: failure)");
    if (scenario === "head-changed") expect(result.stderr).toContain("HEAD changed");
  });

  it.each([["--remote"], ["--remote", "--full"]])("honors the download refusal in %j mode", (...args) => {
    const result = flash(args, "n");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Aborted.");
    expect(downloads()).toEqual([]);
  });
});
