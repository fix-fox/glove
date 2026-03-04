import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

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
        if (hasChanges) {
          // Give GitHub time to queue the new workflow run so we don't
          // pick up the previous (already-completed) run.
          emit(controller, "Waiting for new build to start...");
          await new Promise((r) => setTimeout(r, 5000));
        }
        emit(controller, "Checking for workflow runs...");

        // Poll until we find a completed (or in-progress) run
        let runId = "";
        let conclusion = "";
        for (let attempt = 0; attempt < 120; attempt++) {
          const json = await run("gh", [
            "run", "list", "--repo", REPO, "--workflow", "build.yml",
            "--limit", "1", "--json", "databaseId,status,conclusion",
          ]);
          const runs = JSON.parse(json);
          if (runs.length === 0) {
            emit(controller, "No workflow runs found. Waiting...");
            await new Promise((r) => setTimeout(r, 5000));
            continue;
          }
          const latest = runs[0];
          runId = String(latest.databaseId);
          if (latest.status === "completed") {
            conclusion = latest.conclusion;
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
          emit(controller, "ERROR: Timed out waiting for build.");
          controller.close();
          return;
        }

        if (conclusion !== "success") {
          emit(controller, `ERROR: Build failed (${conclusion}). See: https://github.com/${REPO}/actions/runs/${runId}`);
          controller.close();
          return;
        }

        emit(controller, "Build succeeded!");

        // ── Download firmware ──
        emit(controller, "Downloading firmware artifact...");
        const tmpDir = await run("mktemp", ["-d"]);
        await run("gh", ["run", "download", runId, "--repo", REPO, "--dir", tmpDir]);

        const files = await run("find", [tmpDir, "-name", "glove80_lh*.uf2", "-type", "f"]);
        const firmwareFile = files.split("\n")[0]!.trim();
        if (!firmwareFile) {
          emit(controller, "ERROR: Could not find left hand firmware (glove80_lh*.uf2)");
          await run("rm", ["-rf", tmpDir]);
          controller.close();
          return;
        }
        emit(controller, `Found firmware: ${firmwareFile.split("/").pop()}`);

        // ── Wait for device ──
        emit(controller, "");
        emit(controller, "Put the LEFT hand in bootloader mode:");
        emit(controller, "  1. Hold the bottom-left key (magic key)");
        emit(controller, "  2. While holding, tap the top-left key");
        emit(controller, "  3. Release both — keyboard mounts as GLV80LHBOOT (D:)");
        emit(controller, "");
        emit(controller, "Waiting for device at D:\\ ...");

        let deviceFound = false;
        for (let elapsed = 0; elapsed < 60; elapsed++) {
          try {
            await run("cmd.exe", ["/c", "if exist D:\\ (exit 0) else (exit 1)"], { timeout: 5000 });
            deviceFound = true;
            break;
          } catch {
            // Not found yet
          }
          await new Promise((r) => setTimeout(r, 1000));
        }

        if (!deviceFound) {
          emit(controller, "ERROR: Timeout waiting for device at D:\\");
          await run("rm", ["-rf", tmpDir]);
          controller.close();
          return;
        }

        emit(controller, "Device detected! Copying firmware...");
        const winPath = await run("wslpath", ["-w", firmwareFile]);
        await run("cmd.exe", ["/c", `copy ${winPath} D:\\`]);
        emit(controller, "");
        emit(controller, "Firmware copied. The keyboard will reboot automatically.");
        emit(controller, "Done!");

        await run("rm", ["-rf", tmpDir]);
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
