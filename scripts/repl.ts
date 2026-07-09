// scripts/repl.ts
import { readFileSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import * as readline from "readline";
import { KeyboardConfigSchema } from "@/types/schema";
import { migrateConfig } from "@/lib/migrations";
import { dispatch, type ReplState } from "@/lib/repl/dispatch";
import { complete } from "@/lib/repl/complete";
import { renderLayer } from "@/lib/repl/render";
import { cyan, dim } from "@/lib/repl/color";
import { displayWidth, padDisplay, stripAnsi, truncateDisplay } from "@/lib/repl/text-width";

const config = KeyboardConfigSchema.parse(JSON.parse(readFileSync("config.json", "utf-8")));
migrateConfig(config);

// The displayed layer is the context for key/rm/bare-position commands.
const state: ReplState = { layerIndex: 0, side: "both" };
const PROMPT = cyan("glove> ");

/** Returns a one-line status for the display area / stderr. */
function runFlash(flashArgs: string[]): string {
  const r = spawnSync("bash", ["scripts/glove-flash.sh", ...flashArgs], { stdio: "inherit" });
  if (r.error) return `flash spawn failed: ${r.error.message}`;
  if (r.status !== 0) return `flash exited with code ${r.status}`;
  return "flash done";
}

/** Execute one line: applies state/file effects, returns what to show. */
function execute(line: string): {
  quit?: true;
  text?: string;
  flash?: string[];
  layerShown?: true;
} {
  const result = dispatch(config, line, state, process.stdout.columns || undefined);
  switch (result.kind) {
    case "quit":
      return { quit: true };
    case "show-layer":
      state.layerIndex = result.index;
      state.side = result.side;
      return { text: result.text, layerShown: true };
    case "mutate":
      writeFileSync("config.json", JSON.stringify(config, null, 2) + "\n");
      return {
        text: `${result.text} ${dim("(saved config.json — run `npm run generate-firmware` to rebuild)")}`,
      };
    case "flash":
      return { flash: result.args };
    case "output":
      return { text: result.text };
  }
}

const args = process.argv.slice(2);
if (args.length > 0) {
  // One-shot mode: npm run repl -- find Cmd+C
  const o = execute(args.join(" "));
  if (o.flash) {
    const status = runFlash(o.flash);
    if (status !== "flash done") console.error(status);
  } else if (o.text) {
    console.log(`\n${o.text}\n`);
  }
} else if (process.stdin.isTTY && process.stdout.isTTY) {
  interactiveLoop();
} else {
  pipedLoop();
}

/**
 * Fixed two-region layout: a display area filling the screen and an input line
 * pinned to the bottom row. The display area always shows a layer (starts on
 * layer 0), centered horizontally; non-layer output (key detail, lists, find
 * results, help, errors) appears in a modal overlay on top of it, dismissed
 * with Esc. Tab completion cycles inline, listing candidates on the hint row.
 */
function interactiveLoop(): void {
  let overlay: string | null = null;
  let overlayKind: "layers" | null = null;
  let cycle: { cands: string[]; index: number; current: string } | null = null;
  let lastKeyWasTab = false;
  const HINT =
    "Tab completes, again cycles · help for commands · Esc closes popup · rm edits config.json · quit exits";

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    // Bare Esc waits this long to rule out an escape sequence (default 500ms).
    escapeCodeTimeout: 50,
    // Readline's own completion handling can only *extend* the line — anything
    // else (cycling to a shorter candidate, case-insensitive matches) makes it
    // print the candidate list under the prompt and scroll the layout. So the
    // completer applies every edit to the buffer itself and returns nothing.
    completer: (line: string): [string[], string] => {
      const replaceEnd = (oldLen: number, replacement: string) => {
        const r = rl as unknown as { line: string; cursor: number };
        r.line = line.slice(0, line.length - oldLen) + replacement + r.line.slice(line.length);
        r.cursor = line.length - oldLen + replacement.length;
        setImmediate(() => rl.prompt(true));
      };
      // Consecutive Tab: swap the inserted candidate for the next one.
      if (cycle && lastKeyWasTab && line.endsWith(cycle.current)) {
        cycle.index = (cycle.index + 1) % cycle.cands.length;
        const prev = cycle.current;
        cycle.current = cycle.cands[cycle.index]!;
        paintHintRow(completionStrip(cycle.cands, cycle.index));
        replaceEnd(prev.length, cycle.current);
        return [[], ""];
      }
      const [cands, token] = complete(config, line);
      if (cands.length === 0) {
        cycle = null;
        return [[], ""];
      }
      if (cands.length === 1) {
        cycle = null;
        replaceEnd(token.length, cands[0]!);
        return [[], ""];
      }
      // Multiple candidates: extend to the common prefix first if that makes
      // progress, otherwise start cycling; list candidates on the hint row.
      const lcp = commonPrefix(cands);
      if (lcp.length > token.length) {
        cycle = { cands, index: -1, current: lcp };
        paintHintRow(completionStrip(cands, -1));
        replaceEnd(token.length, lcp);
      } else {
        cycle = { cands, index: 0, current: cands[0]! };
        paintHintRow(completionStrip(cands, 0));
        replaceEnd(token.length, cands[0]!);
      }
      return [[], ""];
    },
    prompt: PROMPT,
  });

  /** Repaints only the hint row, leaving the input line and cursor untouched. */
  function paintHintRow(content: string): void {
    const rows = process.stdout.rows || 24;
    process.stdout.write(`\x1b7\x1b[${rows - 1};1H\x1b[2K\x1b[?7l${content}\x1b[?7h\x1b8`);
  }

  /** One-line candidate list, selection highlighted, windowed around it. */
  function completionStrip(cands: string[], index: number): string {
    const cols = process.stdout.columns || 80;
    const counter = index >= 0 ? `${index + 1}/${cands.length} ` : `${cands.length} matches  `;
    const budget = cols - counter.length - 4; // room for "… " / " …"
    const sel = Math.max(0, index);
    let a = sel;
    let b = sel + 1;
    let used = displayWidth(cands[sel]!);
    while (b < cands.length && used + 2 + displayWidth(cands[b]!) <= budget) {
      used += 2 + displayWidth(cands[b]!);
      b++;
    }
    while (a > 0 && used + 2 + displayWidth(cands[a - 1]!) <= budget) {
      used += 2 + displayWidth(cands[a - 1]!);
      a--;
    }
    const items = cands
      .slice(a, b)
      .map((c, i) => (a + i === index ? `\x1b[7m${c}\x1b[27m` : c))
      .join("  ");
    return dim(counter) + (a > 0 ? dim("… ") : "") + items + (b < cands.length ? dim(" …") : "");
  }

  /** Paints `text` in a bordered box centered over the display area. */
  function overlayBox(rows: number, cols: number, text: string): string {
    const bodyRows = Math.max(1, rows - 2);
    const raw = text.split("\n");
    const maxLines = Math.max(1, bodyRows - 2);
    const lines =
      raw.length > maxLines
        ? [...raw.slice(0, maxLines - 1), dim(`… ${raw.length - maxLines + 1} more lines`)]
        : raw;
    const inner = Math.min(Math.max(...lines.map(displayWidth), 12), Math.max(12, cols - 6));
    const boxWidth = inner + 4; // "│ " + content + " │"
    const left = Math.max(1, Math.floor((cols - boxWidth) / 2) + 1);
    const top = Math.max(1, Math.floor((bodyRows - (lines.length + 2)) / 2) + 1);
    const at = (r: number, c: number) => `\x1b[${r};${c}H`;
    const body = lines
      .map(
        (l, i) =>
          `${at(top + 1 + i, left)}${dim("│")} ${padDisplay(truncateDisplay(l, inner), inner)} ${dim("│")}`,
      )
      .join("");
    const bottom = `└${"─".repeat(boxWidth - 9)} esc ──┘`;
    return (
      at(top, left) +
      dim(`┌${"─".repeat(boxWidth - 2)}┐`) +
      body +
      at(top + lines.length + 1, left) +
      dim(bottom)
    );
  }

  function redraw(): void {
    // `|| 24`, not `?? 24`: a size-less pty reports rows/columns as 0.
    const rows = process.stdout.rows || 24;
    const cols = process.stdout.columns || 80;
    const bodyRows = Math.max(1, rows - 2);
    // Re-render every paint so mutations (rm) show up immediately.
    let layerLines = renderLayer(config, state.layerIndex, { side: state.side, width: cols }).split("\n");
    // Gray out the board while a popup covers it.
    if (overlay !== null) layerLines = layerLines.map((l) => (l ? dim(stripAnsi(l)) : l));
    const pad = Math.max(0, Math.floor((cols - Math.max(...layerLines.map(displayWidth))) / 2));
    const centered = pad > 0 ? layerLines.map((l) => (l ? " ".repeat(pad) + l : l)) : layerLines;
    const body =
      centered.length > bodyRows
        ? [...centered.slice(0, bodyRows - 1), dim(`… ${centered.length - bodyRows + 1} more lines`)]
        : centered;
    // ?7l turns off line wrap while painting so overwide lines clip instead of
    // pushing the rows below them; back on (?7h) for the input line.
    process.stdout.write(
      `\x1b[?7l\x1b[2J\x1b[H${body.join("\n")}\x1b[${rows - 1};1H${dim(HINT)}` +
        `${overlay !== null ? overlayBox(rows, cols, overlay) : ""}\x1b[?7h\x1b[${rows};1H\x1b[2K`,
    );
    rl.prompt(true);
  }

  rl.on("line", (rawLine) => {
    cycle = null;
    lastKeyWasTab = false;
    let line = rawLine.trim();
    // Modal shortcut: with the layers popup open, a bare number opens that layer.
    if (overlay !== null && overlayKind === "layers" && /^\d+$/.test(line)) {
      line = `layer ${line}`;
    }
    const o = execute(line);
    if (o.quit) {
      rl.close();
      return;
    }
    if (o.flash) {
      process.stdout.write("\n");
      overlay = runFlash(o.flash);
      overlayKind = null;
      // Scroll the build output into scrollback so the repaint doesn't erase it.
      process.stdout.write("\n".repeat(process.stdout.rows || 24));
    } else if (o.layerShown) {
      overlay = null;
      overlayKind = null;
    } else if (o.text) {
      overlayKind = line.split(/\s+/)[0]!.toLowerCase() === "layers" ? "layers" : null;
      overlay =
        overlayKind === "layers"
          ? `${o.text}\n\n${dim("number + enter shows that layer")}`
          : o.text;
    }
    redraw();
  });

  readline.emitKeypressEvents(process.stdin, rl);
  process.stdin.on("keypress", (_str, key: { name?: string } | undefined) => {
    if (key?.name === "tab") {
      lastKeyWasTab = true;
      return;
    }
    lastKeyWasTab = false;
    if (cycle) {
      cycle = null;
      paintHintRow(dim(HINT));
    }
    if (key?.name === "escape" && overlay !== null) {
      overlay = null;
      overlayKind = null;
      redraw();
    }
  });

  process.stdout.on("resize", redraw);

  rl.on("close", () => {
    process.stdout.write("\n");
    process.exit(0);
  });

  redraw();
}

/** Plain line-based loop for piped/scripted use (no TTY to paint on). */
function pipedLoop(): void {
  console.log(
    dim(
      "Glove80 keymap REPL (mostly read-only; `rm` edits config.json). Tab completes; `help` for commands, `quit` to exit.",
    ),
  );
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: (line: string) => complete(config, line),
    prompt: PROMPT,
  });
  rl.prompt();
  rl.on("line", (line) => {
    const o = execute(line.trim());
    if (o.quit) {
      rl.close();
      return;
    }
    if (o.flash) {
      const status = runFlash(o.flash);
      if (status !== "flash done") console.error(status);
    } else if (o.text) {
      console.log(`\n${o.text}\n`);
    }
    rl.prompt();
  });
  rl.on("close", () => process.exit(0));
}

function commonPrefix(items: string[]): string {
  let prefix = items[0]!;
  for (const s of items.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < s.length && prefix[i] === s[i]) i++;
    prefix = prefix.slice(0, i);
    if (!prefix) break;
  }
  return prefix;
}
