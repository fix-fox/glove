import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isDockerAvailable, localBuild } from "@/lib/local-build";

const exec = promisify(execFile);
const REPO = "fix-fox/glove";
const ROOT = process.cwd();
const CONFIG_PATH = join(ROOT, "config.json");

async function run(cmd: string, args: string[], opts?: { timeout?: number }) {
  const { stdout } = await exec(cmd, args, { cwd: ROOT, timeout: opts?.timeout });
  return stdout.trim();
}

function emit(controller: ReadableStreamDefaultController, msg: string) {
  controller.enqueue(new TextEncoder().encode(msg + "\n"));
}

async function buildLocal(controller: ReadableStreamDefaultController): Promise<string> {
  const tmpDir = await mkdtemp(join(tmpdir(), "zmk-"));
  const firmwarePath = await localBuild({
    board: "glove80_lh",
    outputDir: tmpDir,
    onProgress: (line) => emit(controller, `[local] ${line}`),
  });
  emit(controller, `Found firmware: ${firmwarePath.split("/").pop()}`);
  return firmwarePath;
}

async function buildRemote(controller: ReadableStreamDefaultController): Promise<string> {
  // ── Git commit + push ──
  await run("git", ["add", "config.json", "config/glove80.keymap", "config/glove80.conf"]);
  let hasChanges = false;
  try {
    await run("git", ["diff", "--cached", "--quiet"]);
  } catch {
    hasChanges = true;
  }

  if (hasChanges) {
    emit(controller, "Committing changes...");
    await run("git", ["commit", "-m", "keymap: update from configurator"]);
    emit(controller, "Pushing to GitHub...");
    await run("git", ["push"]);
    emit(controller, "Pushed.");
  } else {
    emit(controller, "No changes to commit.");
  }

  // ── Wait for build ──
  const headSha = hasChanges
    ? await run("git", ["rev-parse", "HEAD"])
    : "";

  emit(controller, "Waiting for build...");

  let runId = "";
  let conclusion = "";
  for (let attempt = 0; attempt < 120; attempt++) {
    const json = await run("gh", [
      "run", "list", "--repo", REPO, "--workflow", "build.yml",
      "--limit", "5", "--json", "databaseId,status,conclusion,headSha",
    ]);
    const runs = JSON.parse(json) as Array<{
      databaseId: number; status: string; conclusion: string; headSha: string;
    }>;

    const target = headSha
      ? runs.find((r) => r.headSha === headSha)
      : runs[0];

    if (!target) {
      if (attempt % 6 === 0) {
        emit(controller, "Waiting for GitHub to start the build...");
      }
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }

    runId = String(target.databaseId);
    if (target.status === "completed") {
      conclusion = target.conclusion;
      break;
    }
    if (attempt === 0) {
      emit(controller, `Build in progress (run ${runId})...`);
    }
    if (attempt % 6 === 5) {
      emit(controller, `Still building... (${(attempt + 1) * 5}s)`);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }

  if (!runId) {
    throw new Error("Timed out waiting for build.");
  }

  if (conclusion !== "success") {
    throw new Error(`Build failed (${conclusion}). See: https://github.com/${REPO}/actions/runs/${runId}`);
  }

  emit(controller, "Build succeeded!");

  // ── Download firmware ──
  emit(controller, "Downloading firmware artifact...");
  const tmpDir = await run("mktemp", ["-d"]);
  await run("gh", ["run", "download", runId, "--repo", REPO, "--dir", tmpDir]);

  const files = await run("find", [tmpDir, "-name", "glove80_lh*.uf2", "-type", "f"]);
  const firmwareFile = files.split("\n")[0]!.trim();
  if (!firmwareFile) {
    await run("rm", ["-rf", tmpDir]);
    throw new Error("Could not find left hand firmware (glove80_lh*.uf2)");
  }
  emit(controller, `Found firmware: ${firmwareFile.split("/").pop()}`);
  return firmwareFile;
}

async function waitForDevice(controller: ReadableStreamDefaultController): Promise<void> {
  emit(controller, "");
  emit(controller, "Put the LEFT hand in bootloader mode:");
  emit(controller, "  1. Hold the bottom-left key (magic key)");
  emit(controller, "  2. While holding, tap the top-left key");
  emit(controller, "  3. Release both — keyboard mounts as GLV80LHBOOT (D:)");
  emit(controller, "");
  emit(controller, "Waiting for device at D:\\ ...");

  for (let elapsed = 0; elapsed < 60; elapsed++) {
    try {
      await run("cmd.exe", ["/c", "if exist D:\\ (exit 0) else (exit 1)"], { timeout: 5000 });
      return;
    } catch {
      // Not found yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Timeout waiting for device at D:\\");
}

async function flashDevice(controller: ReadableStreamDefaultController, firmwarePath: string): Promise<void> {
  emit(controller, "Device detected! Copying firmware...");
  const winPath = await run("wslpath", ["-w", firmwarePath]);
  await run("cmd.exe", ["/c", `copy ${winPath} D:\\`]);
  emit(controller, "");
  emit(controller, "Firmware copied. The keyboard will reboot automatically.");
  emit(controller, "Done!");
}

export async function POST(request: Request) {
  const config = await request.json();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // ── Save config + generate ──
        emit(controller, "Saving config...");
        await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
        await run("npx", ["tsx", "scripts/generate-firmware.ts"]);
        emit(controller, "Generated firmware files.");

        // ── Build firmware ──
        const useLocal = await isDockerAvailable();
        let firmwarePath: string;

        if (useLocal) {
          firmwarePath = await buildLocal(controller);
        } else {
          firmwarePath = await buildRemote(controller);
        }

        // ── Flash ──
        await waitForDevice(controller);
        await flashDevice(controller, firmwarePath);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        emit(controller, `ERROR: ${message}`);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    },
  });
}
