// scripts/repl.ts
import { readFileSync } from "fs";
import { spawnSync } from "child_process";
import * as readline from "readline";
import { KeyboardConfigSchema } from "@/types/schema";
import { migrateConfig } from "@/lib/migrations";
import { dispatch } from "@/lib/repl/dispatch";
import { complete } from "@/lib/repl/complete";

const config = KeyboardConfigSchema.parse(JSON.parse(readFileSync("config.json", "utf-8")));
migrateConfig(config);

/** Execute one line; returns false when the REPL should exit. */
function run(line: string): boolean {
  const result = dispatch(config, line);
  if (result.kind === "quit") return false;
  if (result.kind === "flash") {
    const r = spawnSync("bash", ["scripts/glove-flash.sh", ...result.args], { stdio: "inherit" });
    if (r.error) {
      console.error(`flash spawn failed: ${r.error.message}`);
    } else if (r.status !== 0) {
      console.error(`flash exited with code ${r.status}`);
    }
    return true;
  }
  if (result.text) console.log(result.text);
  return true;
}

const args = process.argv.slice(2);
if (args.length > 0) {
  // One-shot mode: npm run repl -- find Cmd+C
  run(args.join(" "));
} else {
  console.log("Glove80 keymap REPL (read-only). Tab completes; `help` for commands, `quit` to exit.");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: (line: string) => complete(config, line),
    prompt: "glove> ",
  });
  rl.prompt();
  rl.on("line", (line) => {
    if (!run(line.trim())) {
      rl.close();
      return;
    }
    rl.prompt();
  });
  rl.on("close", () => process.exit(0));
}
