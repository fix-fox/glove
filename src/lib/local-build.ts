import { spawn, execFile } from "node:child_process";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import { join } from "node:path";

const execAsync = promisify(execFile);

let dockerAvailable: boolean | null = null;

export async function isDockerAvailable(): Promise<boolean> {
  if (dockerAvailable !== null) return dockerAvailable;
  try {
    await execAsync("docker", ["info"], { timeout: 5000 });
    dockerAvailable = true;
  } catch {
    dockerAvailable = false;
  }
  return dockerAvailable;
}

interface LocalBuildOptions {
  board: string;
  outputDir: string;
  onProgress: (line: string) => void;
}

export function localBuild(opts: LocalBuildOptions): Promise<string> {
  const scriptPath = join(process.cwd(), "scripts", "zmk-docker-build.sh");
  const outputFile = join(opts.outputDir, `${opts.board}-zmk.uf2`);

  return new Promise((resolve, reject) => {
    const proc = spawn("bash", [
      scriptPath,
      "--board", opts.board,
      "--output-dir", opts.outputDir,
    ], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdout = createInterface({ input: proc.stdout });
    stdout.on("line", (line) => opts.onProgress(line));

    const stderr = createInterface({ input: proc.stderr });
    stderr.on("line", (line) => opts.onProgress(line));

    proc.on("close", (code) => {
      if (code === 0) {
        resolve(outputFile);
      } else {
        reject(new Error(`Build failed with exit code ${code}`));
      }
    });

    proc.on("error", reject);
  });
}
