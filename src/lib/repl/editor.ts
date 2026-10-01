import { spawnSync } from "node:child_process";

/** Split an editor command into argv without evaluating shell syntax or expansions. */
export function parseEditorCommand(command: string): string[] {
  const args: string[] = [];
  let word = "";
  let started = false;
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < command.length; i++) {
    const char = command[i]!;
    if (char === "\\" && quote !== "'") {
      const next = command[++i];
      if (next === undefined) throw new Error("Editor command ends with an incomplete escape.");
      word += next;
      started = true;
    } else if (quote) {
      if (char === quote) quote = null;
      else word += char;
    } else if (char === "'" || char === '"') {
      quote = char;
      started = true;
    } else if (/\s/.test(char)) {
      if (started) args.push(word);
      word = "";
      started = false;
    } else {
      word += char;
      started = true;
    }
  }
  if (quote) throw new Error("Editor command contains an unclosed quote.");
  if (started) args.push(word);
  if (!args[0]) throw new Error("Editor command must name an executable.");
  return args;
}

/** Open the authoritative keymap; the caller suspends any active readline interface. */
export function editKeymap(path: string): void {
  const command = process.env.VISUAL?.trim() || process.env.EDITOR?.trim() || "vi";
  const [executable, ...args] = parseEditorCommand(command);
  const result = spawnSync(executable!, [...args, path], { stdio: "inherit", shell: false });
  if (result.error) throw new Error(`Could not start editor: ${result.error.message}`);
  if (result.signal) throw new Error(`Editor stopped by ${result.signal}. Run reload after checking the file.`);
  if (result.status !== 0) throw new Error(`Editor exited with code ${result.status}. Run reload after checking the file.`);
}
