# REPL v3: Layer Context Mode + Hebrew Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `layer x` enters a layer context (prompt `glove > x > `, bare positions / auto-filled `key`, up/../Esc to exit) and hebrew layers render Hebrew glyphs.

**Architecture:** `ReplState` lives in the shell; `dispatch`/`complete` take it as an optional param (existing call sites unchanged). Two new `DispatchResult` kinds (`enter-layer`, `exit-layer`). Hebrew is a `hebrewMode` pass-through in `render.ts` using the web UI's rule (`name.toLowerCase().includes("hebrew")`).

**Tech Stack:** as v2 (strict TS, vitest, ANSI-16, readline).

**Spec:** `docs/superpowers/specs/2026-06-11-repl-layer-context-design.md`

**Conventions (every task):** work in `/Users/harelf/glove/.claude/worktrees/strange-sammet-7eaf33` (verify `git rev-parse --show-toplevel`); `npx tsc --noEmit` clean before each commit; ANSI escapes written `\x1b`.

---

### Task 1: Hebrew labels in render (`render.ts`)

**Files:** Modify `src/lib/repl/render.ts`; test `src/lib/repl/render.test.ts` (append to the boxed describe block).

- [ ] **Step 1: Append failing tests** (fixture facts: layer 1 is "symbols", all-none keys; `hebrewLabel("A")` = "ש"):

```ts
  it("renders hebrew labels on layers whose name contains 'hebrew'", () => {
    const cfg = makeConfig();
    cfg.layers[1]!.name = "hebrew";
    cfg.layers[1]!.keys[20] = { tap: { type: "kp", keyCode: "A" }, hold: null };
    expect(renderLayer(cfg, 1)).toContain("ש");
    expect(renderLayer(cfg, 0)).not.toContain("ש"); // non-hebrew layer unaffected
  });
```

And in the `keyDetail` describe block:

```ts
  it("shows hebrew labels in key detail on hebrew layers", () => {
    const cfg = makeConfig();
    cfg.layers[1]!.name = "hebrew-alt";
    cfg.layers[1]!.keys[20] = { tap: { type: "kp", keyCode: "A" }, hold: null };
    expect(keyDetail(cfg, 1, 20)).toContain("ש");
  });
```

- [ ] **Step 2:** `npx vitest run src/lib/repl/render.test.ts` — the new tests FAIL.

- [ ] **Step 3: Implement.** In `render.ts`:
  - Add a helper near the top of the rendering section:

```ts
/** Same rule as the web UI (KeyCap.tsx): hebrew layers get Hebrew glyph labels. */
function isHebrewLayer(layer: Layer): boolean {
  return layer.name.toLowerCase().includes("hebrew");
}
```

  - `cellContent(key, config)` → `cellContent(key, config, hebrewMode: boolean)`; pass `hebrewMode` as the 5th arg to BOTH `behaviorLabel` calls inside (tap and hold): `behaviorLabel(key.tap, names, morphs, holdTaps, hebrewMode)`. (`holdTapSecondaryLabel` takes no hebrewMode — modifiers aren't letters.)
  - `renderLayer`: `const hebrewMode = isHebrewLayer(layer);` and `layer.keys.map((k) => cellContent(k, config, hebrewMode))`.
  - `legend(layer, config)`: compute the same `hebrewMode` and pass to its `cellContent` call.
  - `describeBehavior(behavior, config, indent = "")` → add 4th param `hebrewMode = false`; in the `kp` arm use `keyCodeDisplayLabel(behavior.keyCode, hebrewMode)`. Recursive/inner calls (macro/mod-morph arms) can stay without it.
  - `keyDetail`: `const hebrewMode = isHebrewLayer(layer);` and pass it to both `describeBehavior` calls (`key.tap` and `key.hold`).

- [ ] **Step 4:** `npx vitest run src/lib/repl` ALL green (alignment suite included — hebrew glyphs are width-1); `npx tsc --noEmit` clean. Eyeball: `npm run repl --silent -- layer hebrew | head -12` shows Hebrew characters.

- [ ] **Step 5: Commit** — `git add -A src/lib/repl && git commit -m "feat(repl): hebrew glyph labels on hebrew layers"`

---

### Task 2: Layer context in dispatch (`dispatch.ts`)

**Files:** Modify `src/lib/repl/dispatch.ts`; test `src/lib/repl/dispatch.test.ts`.

- [ ] **Step 1a: Update ONE existing test.** In "runs list, render, and detail commands", replace the line
`expect(outputOf("layer default")).toContain("Layer 0: default");` with:

```ts
    const r = dispatch(config, "layer default");
    expect(r.kind).toBe("enter-layer");
    if (r.kind === "enter-layer") {
      expect(r.index).toBe(0);
      expect(r.text).toContain("Layer 0: default");
    }
```

- [ ] **Step 1b: Append the new describe block** (fixture: pos 43 = RM4 = kp LG(C); pos 0 trans; macro copy_url):

```ts
describe("layer context", () => {
  const ctx = { layerIndex: 0 };

  it("exit words leave the context", () => {
    for (const word of ["up", "..", "esc", "UP"]) {
      expect(dispatch(config, word, ctx)).toEqual({ kind: "exit-layer" });
    }
  });

  it("exit words are unknown commands at top level", () => {
    const r = dispatch(config, "up");
    expect(r.kind === "output" && r.text.includes("Unknown command")).toBe(true);
  });

  it("bare positions show key detail in context", () => {
    for (const pos of ["RM4", "43", "rm4"]) {
      const r = dispatch(config, pos, ctx);
      expect(r.kind === "output" && r.text.includes("kp LG(C)"), pos).toBe(true);
    }
  });

  it("key auto-fills the context layer with one arg", () => {
    const r = dispatch(config, "key RM4", ctx);
    expect(r.kind === "output" && r.text.includes("kp LG(C)")).toBe(true);
    // explicit two-arg form still works inside a context
    const r2 = dispatch(config, "key symbols 0", ctx);
    expect(r2.kind).toBe("output");
  });

  it("one-arg key at top level still prints usage", () => {
    expect(outputOf("key RM4")).toContain("key <layer> <pos>");
  });

  it("layer switches context", () => {
    const r = dispatch(config, "layer symbols", ctx);
    expect(r.kind).toBe("enter-layer");
    if (r.kind === "enter-layer") expect(r.index).toBe(1);
  });

  it("global commands still work in context", () => {
    const r = dispatch(config, "macros", ctx);
    expect(r.kind === "output" && r.text.includes("copy_url")).toBe(true);
  });

  it("help and unknown-command hints mention the context", () => {
    const h = dispatch(config, "help", ctx);
    expect(h.kind === "output" && h.text.includes('in layer "default"')).toBe(true);
    const u = dispatch(config, "frobnicate", ctx);
    expect(u.kind === "output" && u.text.includes("up")).toBe(true);
  });
});
```

- [ ] **Step 2:** Run — new tests FAIL (dispatch has no 3rd param).

- [ ] **Step 3: Implement.** In `dispatch.ts`:

```ts
export interface ReplState {
  layerIndex: number | null;
}

const TOP_LEVEL: ReplState = { layerIndex: null };

export type DispatchResult =
  | { kind: "output"; text: string }
  | { kind: "flash"; args: string[] }
  | { kind: "quit" }
  | { kind: "enter-layer"; index: number; text: string }
  | { kind: "exit-layer" };
```

Signature: `export function dispatch(config: KeyboardConfig, line: string, state: ReplState = TOP_LEVEL): DispatchResult`. After computing `cmd`/`args`, insert the context block BEFORE the switch:

```ts
  const ctxLayer = state.layerIndex !== null ? config.layers[state.layerIndex] : undefined;
  if (ctxLayer !== undefined && state.layerIndex !== null) {
    const lower = cmd.toLowerCase();
    if (args.length === 0 && (lower === "up" || lower === ".." || lower === "esc")) {
      return { kind: "exit-layer" };
    }
    if (args.length === 0) {
      const pr = resolvePosition(cmd);
      if (pr.ok) return out(keyDetail(config, state.layerIndex, pr.value));
    }
    if (lower === "key" && args.length === 1) {
      const pr = resolvePosition(args[0]!);
      if (!pr.ok) return out(pr.error);
      return out(keyDetail(config, state.layerIndex, pr.value));
    }
  }
```

Change `case "layer"` to enter:

```ts
    case "layer": {
      if (args.length !== 1) return out(USAGE.layer);
      const r = resolveLayer(config, args[0]!);
      if (!r.ok) return out(r.error);
      return { kind: "enter-layer", index: r.value.index, text: renderLayer(config, r.value.index) };
    }
```

Change `case "help"` no-topic branch to prepend context info:

```ts
      const ctxHelp = ctxLayer
        ? `${dim(`in layer "${ctxLayer.name}" — bare position (34, LM3) or key <pos> for key detail; up/../Esc to go back`)}\n\n`
        : "";
      return out(ctxHelp + HELP);
```

Change the `default` arm:

```ts
    default:
      return out(
        unknownCommand(cmd) +
          (ctxLayer ? ` ${dim(`(in layer "${ctxLayer.name}" — \`up\` to go back)`)}` : ""),
      );
```

(`dim` is already imported. `USAGE.layer`/`USAGE.key` strings stay as-is — the two-arg form remains the canonical help.)

- [ ] **Step 4:** `npx vitest run src/lib/repl` ALL green; `npx tsc --noEmit` clean. Note: one-shot `npm run repl --silent -- layer default` must still print the board (shell wiring is Task 4; until then the script's `run()` ignores enter-layer text — DO NOT fix the shell in this task; just verify lib tests).

- [ ] **Step 5: Commit** — `git add src/lib/repl/dispatch.ts src/lib/repl/dispatch.test.ts && git commit -m "feat(repl): layer context mode in dispatch (enter/exit, bare positions, key auto-fill)"`

---

### Task 3: State-aware completion (`complete.ts`)

**Files:** Modify `src/lib/repl/complete.ts`; test `src/lib/repl/complete.test.ts`.

- [ ] **Step 1: Append failing tests:**

```ts
describe("complete in layer context", () => {
  const ctx = { layerIndex: 0 };

  it("offers nav words and key names as first tokens", () => {
    expect(complete(config, "u", ctx)[0]).toContain("up");
    expect(complete(config, "LM", ctx)[0]).toEqual(["LM1", "LM2", "LM3", "LM4", "LM5", "LM6"]);
  });

  it("key completes positions instead of layers in context", () => {
    expect(complete(config, "key LM", ctx)[0]).toEqual(["LM1", "LM2", "LM3", "LM4", "LM5", "LM6"]);
  });

  it("still completes commands in context", () => {
    expect(complete(config, "fi", ctx)[0]).toContain("find");
  });
});
```

- [ ] **Step 2:** Run — FAIL (complete has no 3rd param).

- [ ] **Step 3: Implement.** In `complete.ts`: add `import type { ReplState } from "./dispatch";` (type-only — no runtime cycle with dispatch's value-import of FLASH_FLAGS). New signature `export function complete(config: KeyboardConfig, line: string, state?: ReplState): [string[], string]`. Add `const inContext = state !== undefined && state.layerIndex !== null;` then:
  - first-token branch: `if (parts.length <= 1) return pick(inContext ? ["up", "..", "esc", ...COMMANDS, ...GLOVE80_KEY_NAMES] : COMMANDS);`
  - key branch: `if (cmd === "key" && parts.length === 2) return pick(inContext ? GLOVE80_KEY_NAMES : layerNames);` (the 3-token branch stays unchanged).

- [ ] **Step 4:** `npx vitest run src/lib/repl` ALL green; `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit** — `git add src/lib/repl/complete.ts src/lib/repl/complete.test.ts && git commit -m "feat(repl): context-aware tab completion"`

---

### Task 4: Shell wiring + Esc key + smoke (`scripts/repl.ts`)

**Files:** Modify `scripts/repl.ts`.

- [ ] **Step 1: Implement.** Updated script (full body for the changed parts):

```ts
import { cyan, dim, yellow } from "@/lib/repl/color";
import { dispatch, type ReplState } from "@/lib/repl/dispatch";
// ...existing imports stay

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
```

Interactive branch: completer becomes `(line: string) => complete(config, line, state)`; prompt option `prompt: promptFor()`; the line handler re-applies the (possibly changed) prompt:

```ts
  rl.on("line", (line) => {
    if (!run(line.trim())) {
      rl.close();
      return;
    }
    rl.setPrompt(promptFor());
    rl.prompt();
  });
```

Esc keypress (after creating `rl`, TTY only):

```ts
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
```

- [ ] **Step 2: Verify**

```bash
npm test 2>&1 | grep -E "Tests|Test Files"          # all green
npx tsc --noEmit && echo CLEAN
npm run repl --silent -- layer hebrew | head -10      # one-shot still prints board (+hebrew glyphs)
printf 'layer sym\n34\nkey RM4\nup\nlayers\nquit\n' | npm run repl | head -40
#   → board, key detail for symbols pos 34, key detail RM4, back to top, layer list, clean exit 0
```

(Esc keypress is TTY-only — verify manually later; piped run must NOT crash.)

- [ ] **Step 3: Commit** — `git add scripts/repl.ts && git commit -m "feat(repl): layer context shell wiring with contextual prompt and Esc"`

---

## Verification checklist (after all tasks)

- `npm test` green, tsc clean.
- `glove layer hebrew` shows Hebrew glyphs; `hebrew-alt` too; alignment suite green.
- Interactive: `layer sym` → prompt `glove > symbols > `; `34`/`LM3`/`key RM4` show detail; `find`/`macros` still work; `up`/`..`/`esc`/Esc-key return to `glove> `; tab completion offers key names in context.
