// scripts/repl.ts
import { readFileSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import * as readline from "readline";
import { KeyboardConfigSchema } from "@/types/schema";
import { migrateConfig } from "@/lib/migrations";
import { dispatch, type ReplState } from "@/lib/repl/dispatch";
import { complete } from "@/lib/repl/complete";
import { cyan, dim, yellow } from "@/lib/repl/color";

const config = KeyboardConfigSchema.parse(JSON.parse(readFileSync("config.json", "utf-8")));
migrateConfig(config);

let state: ReplState = { layerIndex: null };

function promptFor(): string {
  if (state.layerIndex !== null) {
    const name = config.layers[state.layerIndex]?.name ?? String(state.layerIndex);
    return `${cyan("glove")}${dim(" > ")}${yellow(name)}${dim(" > ")}`;
  }
  return cyan("glove> ");
}

/** Execute one line; returns false when the REPL should exit. */
function run(line: string): boolean {
  const result = dispatch(config, line, state);
  if (result.kind === "quit") return false;
  if (result.kind === "exit-layer") {
    state = { layerIndex: null };
    return true;
  }
  if (result.kind === "enter-layer") {
    state = { layerIndex: result.index };
    console.log(`\n${result.text}\n`);
    return true;
  }
  if (result.kind === "mutate") {
    writeFileSync("config.json", JSON.stringify(config, null, 2) + "\n");
    console.log(`\n${result.text} ${dim("(saved config.json — run `npm run generate-firmware` to rebuild)")}\n`);
    return true;
  }
  if (result.kind === "flash") {
    const r = spawnSync("bash", ["scripts/glove-flash.sh", ...result.args], { stdio: "inherit" });
    if (r.error) {
      console.error(`flash spawn failed: ${r.error.message}`);
    } else if (r.status !== 0) {
      console.error(`flash exited with code ${r.status}`);
    }
    return true;
  }
  if (result.text) console.log(`\n${result.text}\n`);
  return true;
}

const args = process.argv.slice(2);
if (args.length > 0) {
  // One-shot mode: npm run repl -- find Cmd+C
  run(args.join(" "));
} else {
  console.log(dim("Glove80 keymap REPL (mostly read-only; `rm` edits config.json). Tab completes; `help` for commands, `quit` to exit."));
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: (line: string) => complete(config, line, state),
    prompt: promptFor(),
  });
  rl.prompt();
  rl.on("line", (line) => {
    if (!run(line.trim())) {
      rl.close();
      return;
    }
    rl.setPrompt(promptFor());
    rl.prompt();
  });

  if (process.stdin.isTTY) {
    readline.emitKeypressEvents(process.stdin, rl);
    process.stdin.on("keypress", (_str, key: { name?: string } | undefined) => {
      if (key?.name === "escape" && state.layerIndex !== null) {
        state = { layerIndex: null };
        // Node idiom is rl.write(null, key) but the TS lib type wants string|Buffer:
        rl.write(null as unknown as string, { ctrl: true, name: "u" }); // clear current input
        rl.setPrompt(promptFor());
        rl.prompt(true);
      }
    });
  }

  rl.on("close", () => process.exit(0));
}
