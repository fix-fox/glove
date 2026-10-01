import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createRequire } from "node:module";
import { once } from "node:events";

const require = createRequire(import.meta.url);
const repl = resolve("scripts/repl.ts");
const runnerArgs = ["--no-deprecation", "--import", require.resolve("tsx"), repl];
const env = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" };
let directory: string;
let keymapPath: string;
let activeChild: ChildProcessWithoutNullStreams | undefined;

function source(keyCode = "A", layerName = "base"): string {
  return `/ { keymap { compatible = "zmk,keymap";
    ${layerName} { bindings = <&kp ${keyCode} ${Array(79).fill("&none").join(" ")}>; };
  }; };\n`;
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "glove-tui-test-"));
  mkdirSync(join(directory, "config"));
  keymapPath = join(directory, "config/glove80.keymap");
  writeFileSync(keymapPath, source());
});

afterEach(() => {
  activeChild?.kill();
  activeChild = undefined;
  rmSync(directory, { recursive: true, force: true });
});

function oneShot(...args: string[]) {
  return spawnSync(process.execPath, [...runnerArgs, ...args], {
    cwd: directory, env, encoding: "utf8", timeout: 10_000,
  });
}

/** Wait for each command's prompt before changing files, keeping the test independent of timing. */
async function session() {
  const child = spawn(process.execPath, runnerArgs, { cwd: directory, env });
  activeChild = child;
  let output = "";
  let errors = "";
  child.stdout.on("data", (data: Buffer) => { output += data.toString(); });
  child.stderr.on("data", (data: Buffer) => { errors += data.toString(); });
  function promptAfter(offset: number): Promise<void> {
    return new Promise((resolvePrompt, reject) => {
      const timer = setTimeout(() => finish(new Error(`TUI did not return a prompt: ${errors}`)), 5_000);
      const onExit = () => finish(new Error(`TUI exited before returning a prompt: ${errors}`));
      const onData = () => { if (output.slice(offset).includes("glove> ")) finish(); };
      function finish(error?: Error): void {
        clearTimeout(timer);
        child.stdout.off("data", onData);
        child.off("exit", onExit);
        if (error) reject(error);
        else resolvePrompt();
      }
      child.stdout.on("data", onData);
      child.once("exit", onExit);
      onData();
    });
  }
  await promptAfter(0);
  return {
    async command(line: string) {
      const offset = output.length;
      const ready = promptAfter(offset);
      child.stdin.write(`${line}\n`);
      await ready;
      return output.slice(offset);
    },
    async close() {
      const closed = once(child, "exit");
      child.stdin.end("quit\n");
      const [code] = await closed;
      return { code, output, errors };
    },
  };
}

describe("native-config CLI", () => {
  it("loads native bindings and persists a one-shot clear directly in the keymap", () => {
    const before = oneShot("key", "0");
    expect(before.status, before.stderr).toBe(0);
    expect(before.stdout).toContain("kp A");
    const cleared = oneShot("rm", "0");
    expect(cleared.status, cleared.stderr).toBe(0);
    expect(cleared.stdout).toContain("saved native config");
    expect(readFileSync(keymapPath, "utf8")).toBe(source().replace("&kp A", "&none"));
  });

  it("reports a startup parse failure with a nonzero exit and no stack trace", () => {
    writeFileSync(keymapPath, "/ { bad");
    const result = oneShot("layers");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unable to load keymap:");
    expect(result.stderr).not.toContain("at loadKeymap");
  });

  it("reports invalid commands and positions with a nonzero exit", () => {
    for (const args of [["bogus"], ["rm", "nope"], ["layer", "missing"], ["reload", "other.keymap"]]) {
      const result = oneShot(...args);
      expect(result.status, args.join(" ")).toBe(1);
      expect(result.stderr).not.toBe("");
    }
  });

  it("rejects edit in piped mode instead of starting an editor without a terminal", () => {
    const result = oneShot("edit");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("edit requires an interactive terminal");
  });

  it("keeps the last valid model after a failed reload, then recovers on the next reload", async () => {
    const tui = await session();
    writeFileSync(keymapPath, "/ { bad");
    await tui.command("reload");
    expect(await tui.command("key 0")).toContain("kp A");
    writeFileSync(keymapPath, source("B", "renamed"));
    expect(await tui.command("reload")).toContain("Reloaded");
    const detail = await tui.command("key 0");
    expect(detail).toContain("kp B");
    expect(detail).toContain('layer 0 "renamed"');
    const result = await tui.close();
    expect(result.code).toBe(1);
    expect(result.errors).not.toBe("");
  });

  it("leaves the old model and externally changed source intact when rm detects stale files", async () => {
    const tui = await session();
    writeFileSync(keymapPath, source("B"));
    await tui.command("rm 0");
    expect(await tui.command("key 0")).toContain("kp A");
    expect(readFileSync(keymapPath, "utf8")).toBe(source("B"));
    await tui.command("reload");
    expect(await tui.command("rm 0")).toContain("saved native config");
    expect(readFileSync(keymapPath, "utf8")).toBe(source("B").replace("&kp B", "&none"));
    const result = await tui.close();
    expect(result.code).toBe(1);
    expect(result.errors.toLowerCase()).toContain("reload");
  });

  it("checks stale files even when the displayed key is already clear", async () => {
    writeFileSync(keymapPath, source().replace("&kp A", "&none"));
    const tui = await session();
    writeFileSync(keymapPath, source("B"));
    const text = await tui.command("rm 0");
    expect(text).not.toContain("already clear");
    expect(readFileSync(keymapPath, "utf8")).toBe(source("B"));
    const result = await tui.close();
    expect(result.code).toBe(1);
    expect(result.errors.toLowerCase()).toContain("reload");
  });

  it("reloads before flash and does not start a build when the on-disk keymap is invalid", async () => {
    mkdirSync(join(directory, "scripts"));
    writeFileSync(join(directory, "scripts/glove-flash.sh"), 'echo "unexpected-build"\n');
    const tui = await session();
    writeFileSync(keymapPath, "/ { bad");
    await tui.command("flash");
    const result = await tui.close();
    expect(result.code).toBe(1);
    expect(result.errors).not.toBe("");
    expect(result.output).not.toContain("unexpected-build");
  });

  it("reports a failing flash subprocess as a command failure", () => {
    mkdirSync(join(directory, "scripts"));
    writeFileSync(join(directory, "scripts/glove-flash.sh"), "exit 7\n");
    const result = oneShot("flash");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Flash exited with code 7");
  });
});
