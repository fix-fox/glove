import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { executeTeaRequest } from "../src/lib/tea-bridge";
import { editKeymap } from "../src/lib/repl/editor";

try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--edit") {
    editKeymap(resolve("config/glove80.keymap"));
  } else if (args.length === 0) {
    const input = readFileSync(0, "utf8");
    if (input.length > 65536) throw new Error("Bridge request is too large.");
    process.stdout.write(JSON.stringify(executeTeaRequest(JSON.parse(input))) + "\n");
  } else {
    throw new Error("Usage: tea-bridge.ts [--edit]. Supply one JSON request on stdin.");
  }
} catch (error) {
  process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
  process.exitCode = 1;
}
