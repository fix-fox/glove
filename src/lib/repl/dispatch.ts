import type { KeyboardConfig } from "../../types/schema";
import { findBindings, parseFindQuery, resolveLayer, resolvePosition } from "./query";
import {
  comboDetail,
  keyDetail,
  listCombos,
  listCondLayers,
  listHoldTaps,
  listLayers,
  listMacros,
  listModMorphs,
  macroDetail,
  renderLayer,
} from "./render";
import { FLASH_FLAGS } from "./complete";

export type DispatchResult =
  | { kind: "output"; text: string }
  | { kind: "flash"; args: string[] }
  | { kind: "quit" };

const USAGE = {
  layers: "layers — list all layers",
  layer: "layer <name|index> — render a layer, e.g. `layer symbols`",
  key: "key <layer> <pos> — key detail, e.g. `key symbols RM4` or `key 5 43`",
  macros: "macros — list all macros",
  macro: "macro <name> — full macro definition",
  combos: "combos — list all combos",
  combo: "combo <name> — full combo definition",
  holdtaps: "holdtaps — list hold-tap definitions",
  morphs: "morphs — list mod-morph definitions",
  condlayers: "condlayers — list conditional layers",
  find: "find <query> — reverse lookup, e.g. `find Cmd+C`, `find F5`, `find LG(C)`",
  flash: "flash [--local|--remote] [--full] — generate, build, and flash via scripts/glove-flash.sh",
  help: "help [command] — show help",
  quit: "quit — exit the REPL",
} as const satisfies Record<string, string>;

export const HELP = Object.values(USAGE).join("\n");

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => {
    const row = new Array<number>(b.length + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 1; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    const prevRow = dp[i - 1]!;
    const currRow = dp[i]!;
    for (let j = 1; j <= b.length; j++) {
      currRow[j] = Math.min(
        (prevRow[j] ?? 0) + 1,
        (currRow[j - 1] ?? 0) + 1,
        (prevRow[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length]![b.length] ?? 0;
}

function unknownCommand(cmd: string): string {
  const closest = Object.keys(USAGE)
    .map((c) => ({ c, d: levenshtein(c, cmd.toLowerCase()) }))
    .filter(({ d }) => d <= 2)
    .sort((x, y) => x.d - y.d)[0];
  const hint = closest ? ` Did you mean \`${closest.c}\`?` : "";
  return `Unknown command "${cmd}".${hint} Type \`help\` for commands.`;
}

const out = (text: string): DispatchResult => ({ kind: "output", text });

export function dispatch(config: KeyboardConfig, line: string): DispatchResult {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return out("");
  const cmd = tokens[0]!;
  const args = tokens.slice(1);

  switch (cmd.toLowerCase()) {
    case "quit":
    case "exit":
      return { kind: "quit" };
    case "help": {
      const topic = args[0]?.toLowerCase();
      if (topic && USAGE[topic as keyof typeof USAGE]) {
        return out(USAGE[topic as keyof typeof USAGE]);
      }
      return out(HELP);
    }
    case "layers":
      return out(listLayers(config).join("\n"));
    case "macros":
      return out(listMacros(config).join("\n") || "No macros defined.");
    case "combos":
      return out(listCombos(config).join("\n") || "No combos defined.");
    case "holdtaps":
      return out(listHoldTaps(config).join("\n") || "No hold-taps defined.");
    case "morphs":
      return out(listModMorphs(config).join("\n") || "No mod-morphs defined.");
    case "condlayers":
      return out(listCondLayers(config).join("\n") || "No conditional layers defined.");
    case "layer": {
      if (args.length !== 1) return out(USAGE.layer);
      const r = resolveLayer(config, args[0]!);
      return out(r.ok ? renderLayer(config, r.value.index) : r.error);
    }
    case "key": {
      if (args.length !== 2) return out(USAGE.key);
      const lr = resolveLayer(config, args[0]!);
      if (!lr.ok) return out(lr.error);
      const pr = resolvePosition(args[1]!);
      if (!pr.ok) return out(pr.error);
      return out(keyDetail(config, lr.value.index, pr.value));
    }
    case "macro": {
      if (args.length !== 1) return out(USAGE.macro);
      const def = (config.macros ?? []).find((m) => m.name === args[0]);
      if (def) return out(macroDetail(def));
      const names = (config.macros ?? []).map((m) => m.name).join(", ");
      return out(`Unknown macro "${args[0]}". ${names ? `Macros: ${names}` : "No macros defined."}`);
    }
    case "combo": {
      if (args.length !== 1) return out(USAGE.combo);
      const def = (config.combos ?? []).find((c) => c.name === args[0]);
      if (def) return out(comboDetail(config, def));
      const names = (config.combos ?? []).map((c) => c.name).join(", ");
      return out(`Unknown combo "${args[0]}". ${names ? `Combos: ${names}` : "No combos defined."}`);
    }
    case "find": {
      if (args.length === 0) return out(USAGE.find);
      const raw = args.join(" ");
      const q = parseFindQuery(raw);
      if (!q) return out(`Could not parse query "${raw}". ${USAGE.find}`);
      const results = findBindings(config, q);
      if (results.length === 0) return out(`No bindings found for ${raw}.`);
      return out(
        results
          .map((r) => `${r.location} → ${r.binding}${r.note ? ` (${r.note})` : ""}`)
          .join("\n"),
      );
    }
    case "flash": {
      const bad = args.filter((a) => !FLASH_FLAGS.includes(a));
      if (bad.length > 0) return out(`Unknown flash flag ${bad.join(" ")}. ${USAGE.flash}`);
      return { kind: "flash", args };
    }
    default:
      return out(unknownCommand(cmd));
  }
}
