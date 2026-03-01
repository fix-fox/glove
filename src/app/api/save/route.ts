import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

const exec = promisify(execFile);
const ROOT = process.cwd();
const CONFIG_PATH = join(ROOT, "config.json");

async function run(cmd: string, args: string[]) {
  const { stdout, stderr } = await exec(cmd, args, { cwd: ROOT });
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

export async function POST(request: Request) {
  try {
    const config = await request.json();
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");

    // Generate firmware files
    await run("npx", ["tsx", "scripts/generate-firmware.ts"]);

    // Stage, commit, push
    await run("git", ["add", "config.json", "config/glove80.keymap", "config/glove80.conf"]);

    // Check if there are staged changes
    try {
      await run("git", ["diff", "--cached", "--quiet"]);
      // No changes — skip commit/push
      return NextResponse.json({ ok: true, message: "Saved (no changes to commit)" });
    } catch {
      // diff --quiet exits non-zero when there are changes — proceed
    }

    await run("git", ["commit", "-m", "keymap: update from configurator"]);
    await run("git", ["push"]);

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
