import type { KeyboardConfig } from "../../types/schema";
import { GLOVE80_KEY_NAMES } from "../layout-map";
import { FIND_ALIASES } from "./find-aliases";

export const COMMANDS = [
  "layers", "layer", "left", "right", "both", "key", "rm", "macros", "macro",
  "combos", "combo", "holdtaps", "morphs", "condlayers", "find", "flash",
  "help", "quit", "exit",
];

export const FLASH_FLAGS = ["--local", "--remote", "--full"];

/** Readline completer: candidates for the token being typed + that token. */
export function complete(config: KeyboardConfig, line: string): [string[], string] {
  const parts = line.split(/\s+/);
  const last = parts[parts.length - 1] ?? "";
  const pick = (candidates: readonly string[]): [string[], string] => [
    candidates.filter((c) => c.toLowerCase().startsWith(last.toLowerCase())),
    last,
  ];
  if (parts.length <= 1) {
    return pick(COMMANDS);
  }
  const cmd = (parts[0] ?? "").toLowerCase();
  if (cmd === "layer" && parts.length === 2) return pick(config.layers.map((l) => l.name));
  if ((cmd === "key" || cmd === "rm") && parts.length === 2) return pick(GLOVE80_KEY_NAMES);
  if (cmd === "macro" && parts.length === 2) return pick((config.macros ?? []).map((m) => m.name));
  if (cmd === "combo" && parts.length === 2) return pick((config.combos ?? []).map((c) => c.name));
  if (cmd === "flash") return pick(FLASH_FLAGS);
  if (cmd === "help" && parts.length === 2) return pick(COMMANDS);
  if (cmd === "find" && parts.length === 2) return pick(Object.keys(FIND_ALIASES));
  return [[], last];
}
