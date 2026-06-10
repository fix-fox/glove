# Keymap REPL (read-only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An `npm run repl` terminal REPL that queries the Glove80 keymap (`config.json`): list entities, render layers as ASCII, inspect keys, reverse-find bindings, plus a `flash` passthrough to `scripts/glove-flash.sh`.

**Architecture:** Pure query/render/completion/dispatch functions in `src/lib/repl/` (vitest-tested, no I/O), and a thin readline shell in `scripts/repl.ts` that loads `config.json` via the existing Zod schema + `migrateConfig`, exactly like `scripts/generate-firmware.ts`. CLI args run one command and exit.

**Tech Stack:** TypeScript, tsx, Node `readline`, `child_process.spawnSync`, vitest, zod (existing schema).

**Spec:** `docs/superpowers/specs/2026-06-10-keymap-repl-design.md`. One addition over the spec's file list: `src/lib/repl/dispatch.ts` holds command parsing/usage-hints/did-you-mean so they're unit-testable and the shell stays trivial.

## File structure

| File | Responsibility |
|---|---|
| `src/lib/repl/test-fixtures.ts` | Shared minimal `KeyboardConfig` fixture for tests |
| `src/lib/repl/query.ts` | Layer/position resolution, find-query parsing, reverse lookup |
| `src/lib/repl/render.ts` | Entity list summaries, ASCII layer render, key/macro/combo detail |
| `src/lib/repl/complete.ts` | Tab-completion candidates |
| `src/lib/repl/dispatch.ts` | Command dispatch → output text / flash / quit; usage hints, did-you-mean |
| `src/lib/repl/*.test.ts` | Vitest tests alongside each module |
| `scripts/repl.ts` | Shell: load config, readline loop, one-shot mode, spawn flash |
| `package.json` | Add `"repl": "tsx scripts/repl.ts"` script |

Existing code reused (do not modify): `src/types/schema.ts` (types + `KeyboardConfigSchema`), `src/lib/layout-map.ts` (`GLOVE80_GRID`, `GLOVE80_KEY_NAMES`), `src/lib/labels.ts` (`behaviorLabel`, `holdTapSecondaryLabel`, `keyCodeDisplayLabel`), `src/lib/keycodes.ts` (`isModifiedKeyCode`, `parseModifiedKeyCode`), `src/lib/migrations.ts` (`migrateConfig`).

Useful facts for all tasks:
- `GLOVE80_KEY_NAMES` index ↔ name: `LM1`=34, `RM4`=43, `LN1`=10, `LT1`=22.
- Binding strings in config look like `&kp BSPC`, `&kp LG(C)`, `&tog 14`; macro step `bindings` arrays sometimes split behavior and param into separate entries (`["&kp", "LG(C)"]`).
- Layers in the layer array are addressed by index; `Key` = `{ tap: Behavior, hold: Behavior | null }`.

---

### Task 1: Test fixture + layer/position resolution (`query.ts` part 1)

**Files:**
- Create: `src/lib/repl/test-fixtures.ts`
- Create: `src/lib/repl/query.ts`
- Test: `src/lib/repl/query.test.ts`

- [ ] **Step 1: Write the fixture**

```ts
// src/lib/repl/test-fixtures.ts
import type { Key, KeyboardConfig } from "../../types/schema";

function noneKey(): Key {
  return { tap: { type: "none" }, hold: null };
}

function emptyKeys(): Key[] {
  return Array.from({ length: 80 }, noneKey);
}

/**
 * Minimal config for REPL tests. Notable bindings:
 * - default layer pos 0 (LC1): trans
 * - default layer pos 10 (LN1): kp F5, hold mo 1
 * - default layer pos 20 (RN5): kp C
 * - default layer pos 34 (LM1): hold_tap hml_lgui(LGUI, A)
 * - default layer pos 43 (RM4): kp LG(C)
 * Three layers so the prefix "sy" is ambiguous (symbols, system).
 */
export function makeConfig(): KeyboardConfig {
  const keys = emptyKeys();
  keys[0] = { tap: { type: "trans" }, hold: null };
  keys[10] = { tap: { type: "kp", keyCode: "F5" }, hold: { type: "mo", layerIndex: 1 } };
  keys[20] = { tap: { type: "kp", keyCode: "C" }, hold: null };
  keys[34] = { tap: { type: "hold_tap", name: "hml_lgui", param1: "LGUI", param2: "A" }, hold: null };
  keys[43] = { tap: { type: "kp", keyCode: "LG(C)" }, hold: null };
  return {
    name: "test",
    version: 1,
    layers: [
      { id: "00000000-0000-0000-0000-000000000001", name: "default", keys },
      { id: "00000000-0000-0000-0000-000000000002", name: "symbols", keys: emptyKeys() },
      { id: "00000000-0000-0000-0000-000000000003", name: "system", keys: emptyKeys() },
    ],
    macros: [
      {
        id: "00000000-0000-0000-0000-000000000004",
        name: "copy_url",
        label: "CopyURL",
        steps: [
          { directive: "tap", bindings: ["&kp LG(L)"] },
          { directive: "tap", bindings: ["&kp", "LG(C)"] },
        ],
      },
    ],
    combos: [
      {
        id: "00000000-0000-0000-0000-000000000005",
        name: "esc_combo",
        keyPositions: [22, 23],
        binding: "&kp ESC",
      },
    ],
    modMorphs: [
      {
        id: "00000000-0000-0000-0000-000000000006",
        name: "mm_bspc_shift_del",
        defaultBinding: "&kp BSPC",
        morphBinding: "&kp DEL",
        mods: ["MOD_LSFT"],
      },
    ],
    holdTaps: [
      {
        id: "00000000-0000-0000-0000-000000000007",
        name: "hml_lgui",
        flavor: "balanced",
        tappingTermMs: 280,
        holdBinding: "&kp",
        tapBinding: "&kp",
      },
    ],
    conditionalLayers: [
      {
        id: "00000000-0000-0000-0000-000000000008",
        name: "tri_layer",
        ifLayers: [1, 2],
        thenLayer: 2,
      },
    ],
  };
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// src/lib/repl/query.test.ts
import { describe, it, expect } from "vitest";
import { resolveLayer, resolvePosition } from "./query";
import { makeConfig } from "./test-fixtures";

describe("resolveLayer", () => {
  const config = makeConfig();

  it("resolves by index", () => {
    const r = resolveLayer(config, "1");
    expect(r).toMatchObject({ ok: true, value: { index: 1 } });
  });

  it("rejects out-of-range index", () => {
    const r = resolveLayer(config, "3");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("out of range");
  });

  it("resolves exact name case-insensitively", () => {
    const r = resolveLayer(config, "SYMBOLS");
    expect(r).toMatchObject({ ok: true, value: { index: 1 } });
  });

  it("resolves a unique prefix", () => {
    const r = resolveLayer(config, "def");
    expect(r).toMatchObject({ ok: true, value: { index: 0 } });
  });

  it("errors on ambiguous prefix, listing the matches", () => {
    const r = resolveLayer(config, "sy");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("symbols");
      expect(r.error).toContain("system");
    }
  });

  it("errors on unknown name, listing valid layers", () => {
    const r = resolveLayer(config, "nope");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("default");
  });
});

describe("resolvePosition", () => {
  it("accepts a numeric position", () => {
    expect(resolvePosition("43")).toEqual({ ok: true, value: 43 });
  });

  it("rejects positions above 79", () => {
    const r = resolvePosition("80");
    expect(r.ok).toBe(false);
  });

  it("resolves key names case-insensitively", () => {
    expect(resolvePosition("lm1")).toEqual({ ok: true, value: 34 });
    expect(resolvePosition("RM4")).toEqual({ ok: true, value: 43 });
  });

  it("errors on unknown key name with a hint", () => {
    const r = resolvePosition("XX9");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("LM3");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/repl/query.test.ts`
Expected: FAIL — cannot resolve `./query`.

- [ ] **Step 4: Implement resolution in `query.ts`**

```ts
// src/lib/repl/query.ts
import type { KeyboardConfig, Layer } from "../../types/schema";
import { GLOVE80_KEY_NAMES } from "../layout-map";

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function resolveLayer(
  config: KeyboardConfig,
  ref: string,
): Result<{ index: number; layer: Layer }> {
  if (/^\d+$/.test(ref)) {
    const index = Number(ref);
    if (index >= config.layers.length) {
      return {
        ok: false,
        error: `Layer index ${index} out of range (0-${config.layers.length - 1})`,
      };
    }
    return { ok: true, value: { index, layer: config.layers[index] } };
  }
  const lower = ref.toLowerCase();
  const exact = config.layers.findIndex((l) => l.name.toLowerCase() === lower);
  if (exact !== -1) return { ok: true, value: { index: exact, layer: config.layers[exact] } };
  const matches = config.layers
    .map((layer, index) => ({ layer, index }))
    .filter(({ layer }) => layer.name.toLowerCase().startsWith(lower));
  if (matches.length === 1) return { ok: true, value: matches[0] };
  if (matches.length > 1) {
    return {
      ok: false,
      error: `Ambiguous layer "${ref}": ${matches.map((m) => m.layer.name).join(", ")}`,
    };
  }
  return {
    ok: false,
    error: `Unknown layer "${ref}". Layers: ${config.layers.map((l) => l.name).join(", ")}`,
  };
}

export function resolvePosition(ref: string): Result<number> {
  if (/^\d+$/.test(ref)) {
    const pos = Number(ref);
    if (pos > 79) return { ok: false, error: `Position ${pos} out of range (0-79)` };
    return { ok: true, value: pos };
  }
  const idx = GLOVE80_KEY_NAMES.indexOf(ref.toUpperCase());
  if (idx === -1) {
    return {
      ok: false,
      error: `Unknown key name "${ref}" — expected 0-79 or a name like LM3, RH1`,
    };
  }
  return { ok: true, value: idx };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/repl/query.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/repl/test-fixtures.ts src/lib/repl/query.ts src/lib/repl/query.test.ts
git commit -m "feat(repl): layer and position resolution"
```

---

### Task 2: Find-query parsing + reverse lookup (`query.ts` part 2)

**Files:**
- Modify: `src/lib/repl/query.ts` (append)
- Test: `src/lib/repl/query.test.ts` (append)

- [ ] **Step 1: Append failing tests**

```ts
// append to src/lib/repl/query.test.ts — add imports:
// import { parseFindQuery, findBindings } from "./query";

describe("parseFindQuery", () => {
  it("parses Cmd+C", () => {
    expect(parseFindQuery("Cmd+C")).toEqual({ mods: ["LG"], key: "C" });
  });

  it("parses ZMK form LG(C)", () => {
    expect(parseFindQuery("LG(C)")).toEqual({ mods: ["LG"], key: "C" });
  });

  it("parses Mac symbol form ⌘C", () => {
    expect(parseFindQuery("⌘C")).toEqual({ mods: ["LG"], key: "C" });
  });

  it("parses a bare keycode", () => {
    expect(parseFindQuery("f5")).toEqual({ mods: [], key: "F5" });
  });

  it("sorts multiple modifiers", () => {
    expect(parseFindQuery("Shift+Cmd+C")).toEqual({ mods: ["LG", "LS"], key: "C" });
  });

  it("returns null for empty or unknown-modifier input", () => {
    expect(parseFindQuery("")).toBeNull();
    expect(parseFindQuery("foo+c")).toBeNull();
  });
});

describe("findBindings", () => {
  const config = makeConfig();

  it("finds an explicit modified binding on a layer key", () => {
    const results = findBindings(config, { mods: ["LG"], key: "C" });
    const locations = results.map((r) => r.location);
    expect(locations).toContain("layer default · RM4 (pos 43) · tap");
  });

  it("explicit query does not match the bare keycode", () => {
    const results = findBindings(config, { mods: ["LG"], key: "C" });
    expect(results.every((r) => !r.location.includes("pos 20"))).toBe(true);
  });

  it("bare query matches bare and modified bindings, noting modifiers", () => {
    const results = findBindings(config, { mods: [], key: "C" });
    const bare = results.find((r) => r.location.includes("pos 20"));
    const modified = results.find((r) => r.location.includes("pos 43"));
    expect(bare?.note).toBeUndefined();
    expect(modified?.note).toContain("LG");
  });

  it("finds keycodes in macro steps, including split bindings", () => {
    const results = findBindings(config, { mods: ["LG"], key: "C" });
    expect(results.some((r) => r.location === "macro copy_url · step 2 (tap)")).toBe(true);
  });

  it("finds hold-tap params", () => {
    const results = findBindings(config, { mods: [], key: "LGUI" });
    expect(results.some((r) => r.location.includes("pos 34"))).toBe(true);
  });

  it("finds keycodes in mod-morph definitions", () => {
    const results = findBindings(config, { mods: [], key: "DEL" });
    expect(results.some((r) => r.location === "mod-morph mm_bspc_shift_del · morph")).toBe(true);
  });

  it("finds keycodes in combo bindings", () => {
    const results = findBindings(config, { mods: [], key: "ESC" });
    expect(results.some((r) => r.location === "combo esc_combo")).toBe(true);
  });

  it("finds plain keycode bindings with the tap slot in the location", () => {
    const results = findBindings(config, { mods: [], key: "F5" });
    expect(results.some((r) => r.location === "layer default · LN1 (pos 10) · tap")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/lib/repl/query.test.ts`
Expected: FAIL — `parseFindQuery` not exported.

- [ ] **Step 3: Append implementation to `query.ts`**

```ts
// append to src/lib/repl/query.ts — add to the existing imports:
// import type { Behavior, KeyboardConfig, Layer } from "../../types/schema";
// import { isModifiedKeyCode, parseModifiedKeyCode } from "../keycodes";

export interface FindQuery {
  mods: string[]; // sorted ZMK wrappers, e.g. ["LG", "LS"]
  key: string; // uppercase keycode
}

const MOD_WORDS: Record<string, string> = {
  cmd: "LG", command: "LG", gui: "LG", win: "LG", lg: "LG",
  rcmd: "RG", rgui: "RG", rg: "RG",
  ctrl: "LC", control: "LC", lc: "LC",
  rctrl: "RC", rc: "RC",
  alt: "LA", opt: "LA", option: "LA", la: "LA",
  ralt: "RA", ropt: "RA", ra: "RA",
  shift: "LS", ls: "LS",
  rshift: "RS", rs: "RS",
};

const SYMBOL_MODS: Record<string, string> = { "⌘": "LG", "⌥": "LA", "⌃": "LC", "⇧": "LS" };

export function parseFindQuery(input: string): FindQuery | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (isModifiedKeyCode(upper)) {
    const parsed = parseModifiedKeyCode(upper);
    return { mods: [...parsed.mods].sort(), key: parsed.key };
  }
  const mods: string[] = [];
  let rest = trimmed;
  while (rest.length > 0 && SYMBOL_MODS[rest[0]]) {
    mods.push(SYMBOL_MODS[rest[0]]);
    rest = rest.slice(1);
  }
  const tokens = rest.split("+").map((t) => t.trim()).filter((t) => t.length > 0);
  if (tokens.length === 0) return null;
  for (const token of tokens.slice(0, -1)) {
    const mod = MOD_WORDS[token.toLowerCase()];
    if (!mod) return null;
    mods.push(mod);
  }
  return { mods: mods.sort(), key: tokens[tokens.length - 1].toUpperCase() };
}

export interface FindMatch {
  location: string;
  binding: string;
  note?: string;
}

/** Extract keycodes from binding strings like "&kp LG(C)" or "&kp ESC &kp B". */
export function extractKpCodes(binding: string): string[] {
  return [...binding.matchAll(/&kp\s+(\S+)/g)].map((m) => m[1]);
}

function matchCode(code: string, q: FindQuery): { match: boolean; note?: string } {
  let mods: string[] = [];
  let key = code;
  if (isModifiedKeyCode(code)) {
    const parsed = parseModifiedKeyCode(code);
    mods = [...parsed.mods].sort();
    key = parsed.key;
  }
  if (key !== q.key) return { match: false };
  if (q.mods.length === 0) {
    return { match: true, note: mods.length ? `with ${mods.join("+")}` : undefined };
  }
  return { match: mods.join(",") === q.mods.join(",") };
}

function behaviorKeyCodes(behavior: Behavior, config: KeyboardConfig): string[] {
  switch (behavior.type) {
    case "kp":
      return [behavior.keyCode];
    case "hold_tap":
      return [behavior.param1, behavior.param2];
    case "mod_morph": {
      const def = (config.modMorphs ?? []).find((m) => m.name === behavior.name);
      if (!def) return [];
      return [...extractKpCodes(def.defaultBinding), ...extractKpCodes(def.morphBinding)];
    }
    default:
      return [];
  }
}

export function findBindings(config: KeyboardConfig, q: FindQuery): FindMatch[] {
  const results: FindMatch[] = [];
  const add = (location: string, code: string) => {
    const m = matchCode(code, q);
    if (m.match) results.push({ location, binding: code, note: m.note });
  };

  for (const layer of config.layers) {
    layer.keys.forEach((key, pos) => {
      const posName = `${GLOVE80_KEY_NAMES[pos]} (pos ${pos})`;
      const slots: Array<["tap" | "hold", Behavior | null]> = [
        ["tap", key.tap],
        ["hold", key.hold],
      ];
      for (const [slot, behavior] of slots) {
        if (!behavior) continue;
        for (const code of behaviorKeyCodes(behavior, config)) {
          add(`layer ${layer.name} · ${posName} · ${slot}`, code);
        }
      }
    });
  }
  for (const macro of config.macros ?? []) {
    macro.steps.forEach((step, i) => {
      if (!("bindings" in step)) return;
      for (const code of extractKpCodes(step.bindings.join(" "))) {
        add(`macro ${macro.name} · step ${i + 1} (${step.directive})`, code);
      }
    });
  }
  for (const combo of config.combos ?? []) {
    for (const code of extractKpCodes(combo.binding)) add(`combo ${combo.name}`, code);
  }
  for (const mm of config.modMorphs ?? []) {
    for (const code of extractKpCodes(mm.defaultBinding)) add(`mod-morph ${mm.name} · default`, code);
    for (const code of extractKpCodes(mm.morphBinding)) add(`mod-morph ${mm.name} · morph`, code);
  }
  for (const ht of config.holdTaps ?? []) {
    for (const code of extractKpCodes(`${ht.tapBinding} ${ht.holdBinding}`)) {
      add(`hold-tap ${ht.name} · binding`, code);
    }
  }
  return results;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/repl/query.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/repl/query.ts src/lib/repl/query.test.ts
git commit -m "feat(repl): find-query parsing and reverse binding lookup"
```

---

### Task 3: Entity list summaries (`render.ts` part 1)

**Files:**
- Create: `src/lib/repl/render.ts`
- Test: `src/lib/repl/render.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/repl/render.test.ts
import { describe, it, expect } from "vitest";
import {
  listLayers, listMacros, listCombos, listHoldTaps, listModMorphs, listCondLayers,
} from "./render";
import { makeConfig } from "./test-fixtures";

const config = makeConfig();

describe("list summaries", () => {
  it("lists layers with index, name, and bound-key count", () => {
    const lines = listLayers(config);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("default");
    expect(lines[0]).toContain("4 keys bound"); // pos 10, 20, 34, 43 (trans/none not counted)
  });

  it("lists macros with step count and label", () => {
    expect(listMacros(config)[0]).toBe("copy_url — 2 steps (CopyURL)");
  });

  it("lists combos with key names and binding", () => {
    expect(listCombos(config)[0]).toBe("esc_combo: LT1+LT2 → &kp ESC");
  });

  it("lists hold-taps with flavor and timing", () => {
    expect(listHoldTaps(config)[0]).toContain("hml_lgui");
    expect(listHoldTaps(config)[0]).toContain("balanced");
    expect(listHoldTaps(config)[0]).toContain("280ms");
  });

  it("lists mod-morphs with both bindings and mods", () => {
    expect(listModMorphs(config)[0]).toBe(
      "mm_bspc_shift_del: &kp BSPC / MOD_LSFT → &kp DEL",
    );
  });

  it("lists conditional layers with layer names", () => {
    expect(listCondLayers(config)[0]).toBe("tri_layer: symbols + system → system");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/repl/render.test.ts`
Expected: FAIL — cannot resolve `./render`.

- [ ] **Step 3: Implement the list functions**

```ts
// src/lib/repl/render.ts
import type { KeyboardConfig } from "../../types/schema";
import { GLOVE80_KEY_NAMES } from "../layout-map";

export function listLayers(config: KeyboardConfig): string[] {
  return config.layers.map((layer, i) => {
    const bound = layer.keys.filter(
      (k) => k.tap.type !== "none" && k.tap.type !== "trans",
    ).length;
    return `${String(i).padStart(2)}: ${layer.name} (${bound} keys bound)`;
  });
}

export function listMacros(config: KeyboardConfig): string[] {
  return (config.macros ?? []).map((m) => {
    const steps = `${m.steps.length} step${m.steps.length === 1 ? "" : "s"}`;
    return `${m.name} — ${steps}${m.label ? ` (${m.label})` : ""}`;
  });
}

export function listCombos(config: KeyboardConfig): string[] {
  return (config.combos ?? []).map((c) => {
    const keys = c.keyPositions.map((p) => GLOVE80_KEY_NAMES[p]).join("+");
    return `${c.name}: ${keys} → ${c.binding}`;
  });
}

export function listHoldTaps(config: KeyboardConfig): string[] {
  return (config.holdTaps ?? []).map(
    (h) => `${h.name}: ${h.flavor}, ${h.tappingTermMs}ms, hold ${h.holdBinding}, tap ${h.tapBinding}`,
  );
}

export function listModMorphs(config: KeyboardConfig): string[] {
  return (config.modMorphs ?? []).map(
    (m) => `${m.name}: ${m.defaultBinding} / ${m.mods.join("+")} → ${m.morphBinding}`,
  );
}

export function listCondLayers(config: KeyboardConfig): string[] {
  const name = (i: number) => config.layers[i]?.name ?? String(i);
  return (config.conditionalLayers ?? []).map(
    (c) => `${c.name}: ${c.ifLayers.map(name).join(" + ")} → ${name(c.thenLayer)}`,
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/repl/render.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/repl/render.ts src/lib/repl/render.test.ts
git commit -m "feat(repl): entity list summaries"
```

---

### Task 4: Layer render + key/macro/combo detail (`render.ts` part 2)

**Files:**
- Modify: `src/lib/repl/render.ts` (append)
- Test: `src/lib/repl/render.test.ts` (append)

- [ ] **Step 1: Append failing tests**

```ts
// append to src/lib/repl/render.test.ts — add to imports:
// import { renderLayer, keyDetail, macroDetail, comboDetail } from "./render";

describe("renderLayer", () => {
  it("renders a header and 7 grid rows", () => {
    const text = renderLayer(config, 0);
    const lines = text.split("\n");
    expect(lines[0]).toBe("Layer 0: default");
    expect(lines).toHaveLength(9); // header + blank + 7 rows
  });

  it("shows kp labels, trans dots, and hold-tap tap·hold cells", () => {
    const text = renderLayer(config, 0);
    expect(text).toContain("⌘C"); // pos 43, kp LG(C)
    expect(text).toContain("A·⌘"); // pos 34, hml_lgui(LGUI, A)
    expect(text.split("\n")[2].trimStart().startsWith("·")).toBe(true); // pos 0 trans
  });
});

describe("keyDetail", () => {
  it("describes a plain kp key with its hold behavior", () => {
    const text = keyDetail(config, 0, 10);
    expect(text).toContain("LN1 (pos 10)");
    expect(text).toContain("default");
    expect(text).toContain("kp F5");
    expect(text).toContain("momentary");
    expect(text).toContain("symbols");
  });

  it("expands hold-tap definitions inline", () => {
    const text = keyDetail(config, 0, 34);
    expect(text).toContain("hold-tap hml_lgui(LGUI, A)");
    expect(text).toContain("flavor: balanced");
    expect(text).toContain("&kp LGUI");
    expect(text).toContain("&kp A");
  });

  it("marks empty hold slots", () => {
    const text = keyDetail(config, 0, 20);
    expect(text).toContain("hold: (none)");
  });
});

describe("macroDetail / comboDetail", () => {
  it("renders numbered macro steps", () => {
    const macro = config.macros![0];
    const text = macroDetail(macro);
    expect(text).toContain("macro copy_url (CopyURL)");
    expect(text).toContain("1. tap &kp LG(L)");
    expect(text).toContain("2. tap &kp LG(C)");
  });

  it("renders combo keys with names and binding", () => {
    const text = comboDetail(config, config.combos![0]);
    expect(text).toContain("combo esc_combo");
    expect(text).toContain("LT1 (22) + LT2 (23)");
    expect(text).toContain("&kp ESC");
    expect(text).toContain("layers: all");
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/lib/repl/render.test.ts`
Expected: FAIL — `renderLayer` not exported.

- [ ] **Step 3: Append implementation**

```ts
// append to src/lib/repl/render.ts — change the imports at the top to:
// import type {
//   Behavior, ComboDefinition, Key, KeyboardConfig, MacroDefinition,
// } from "../../types/schema";
// import { GLOVE80_GRID, GLOVE80_KEY_NAMES } from "../layout-map";
// import { behaviorLabel, holdTapSecondaryLabel, keyCodeDisplayLabel } from "../labels";

const CELL_WIDTH = 7; // 6 label chars + 1 space

function cellLabel(key: Key, config: KeyboardConfig): string {
  const names = config.layers.map((l) => l.name);
  const morphs = config.modMorphs ?? [];
  const holdTaps = config.holdTaps ?? [];
  if (key.tap.type === "trans") return "·";
  let label = behaviorLabel(key.tap, names, morphs, holdTaps);
  if (key.tap.type === "hold_tap") {
    label = `${label}·${holdTapSecondaryLabel(key.tap.name, key.tap.param1)}`;
  } else if (key.hold) {
    label = `${label}·${behaviorLabel(key.hold, names, morphs, holdTaps)}`;
  }
  return label;
}

export function renderLayer(config: KeyboardConfig, layerIndex: number): string {
  const layer = config.layers[layerIndex];
  const lines = [`Layer ${layerIndex}: ${layer.name}`, ""];
  for (const row of GLOVE80_GRID) {
    const cells = row.map((idx) => {
      if (idx === null) return " ".repeat(CELL_WIDTH);
      const label = cellLabel(layer.keys[idx], config);
      return label.slice(0, CELL_WIDTH - 1).padEnd(CELL_WIDTH);
    });
    lines.push(cells.join("").trimEnd());
  }
  return lines.join("\n");
}

export function macroDetail(def: MacroDefinition, indent = ""): string {
  const lines = [`${indent}macro ${def.name}${def.label ? ` (${def.label})` : ""}`];
  if (def.waitMs !== undefined || def.tapMs !== undefined) {
    lines.push(`${indent}  wait: ${def.waitMs ?? "default"}ms, tap: ${def.tapMs ?? "default"}ms`);
  }
  def.steps.forEach((step, i) => {
    const detail = "bindings" in step ? `${step.directive} ${step.bindings.join(" ")}` : step.directive;
    lines.push(`${indent}  ${i + 1}. ${detail}`);
  });
  return lines.join("\n");
}

export function comboDetail(config: KeyboardConfig, def: ComboDefinition): string {
  const positions = def.keyPositions.map((p) => `${GLOVE80_KEY_NAMES[p]} (${p})`).join(" + ");
  const layers = def.layers?.length
    ? def.layers.map((i) => config.layers[i]?.name ?? String(i)).join(", ")
    : "all";
  const lines = [
    `combo ${def.name}`,
    `  keys: ${positions}`,
    `  binding: ${def.binding}`,
    `  layers: ${layers}`,
  ];
  if (def.timeoutMs !== undefined) lines.push(`  timeout: ${def.timeoutMs}ms`);
  return lines.join("\n");
}

export function describeBehavior(
  behavior: Behavior,
  config: KeyboardConfig,
  indent = "",
): string {
  const names = config.layers.map((l) => l.name);
  switch (behavior.type) {
    case "kp":
      return `kp ${behavior.keyCode} — ${keyCodeDisplayLabel(behavior.keyCode)}`;
    case "mo":
      return `mo ${behavior.layerIndex} — momentary layer "${names[behavior.layerIndex]}"`;
    case "to":
      return `to ${behavior.layerIndex} — switch to layer "${names[behavior.layerIndex]}"`;
    case "sl":
      return `sl ${behavior.layerIndex} — sticky layer "${names[behavior.layerIndex]}"`;
    case "tog":
      return `tog ${behavior.layerIndex} — toggle layer "${names[behavior.layerIndex]}"`;
    case "trans":
      return "trans — falls through to lower layer";
    case "none":
      return "none";
    case "macro": {
      const def = (config.macros ?? []).find((m) => m.name === behavior.macroName);
      const params = [behavior.param, behavior.param2].filter(Boolean).join(", ");
      const head = `macro ${behavior.macroName}${params ? `(${params})` : ""}`;
      return def ? `${head}\n${macroDetail(def, `${indent}  `)}` : `${head} — definition not found`;
    }
    case "mod_morph": {
      const def = (config.modMorphs ?? []).find((m) => m.name === behavior.name);
      if (!def) return `mod-morph ${behavior.name} — definition not found`;
      return [
        `mod-morph ${behavior.name}`,
        `${indent}  default: ${def.defaultBinding}`,
        `${indent}  with ${def.mods.join("+")}: ${def.morphBinding}`,
      ].join("\n");
    }
    case "hold_tap": {
      const def = (config.holdTaps ?? []).find((h) => h.name === behavior.name);
      const head = `hold-tap ${behavior.name}(${behavior.param1}, ${behavior.param2})`;
      if (!def) return `${head} — definition not found`;
      const hold = ["&kp", "&mo", "&to", "&tog", "&sl"].includes(def.holdBinding)
        ? `${def.holdBinding} ${behavior.param1}`
        : def.holdBinding;
      const tap = def.tapBinding === "&kp" ? `&kp ${behavior.param2}` : def.tapBinding;
      return [
        head,
        `${indent}  hold: ${hold}`,
        `${indent}  tap:  ${tap}`,
        `${indent}  flavor: ${def.flavor}, tapping-term: ${def.tappingTermMs}ms`,
      ].join("\n");
    }
    default: {
      const label = behaviorLabel(behavior, names, config.modMorphs ?? [], config.holdTaps ?? []);
      return `${behavior.type}${label ? ` — ${label}` : ""}`;
    }
  }
}

export function keyDetail(config: KeyboardConfig, layerIndex: number, pos: number): string {
  const layer = config.layers[layerIndex];
  const key = layer.keys[pos];
  return [
    `${GLOVE80_KEY_NAMES[pos]} (pos ${pos}) on layer ${layerIndex} "${layer.name}"`,
    `  tap:  ${describeBehavior(key.tap, config, "  ")}`,
    `  hold: ${key.hold ? describeBehavior(key.hold, config, "  ") : "(none)"}`,
  ].join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/repl/render.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/repl/render.ts src/lib/repl/render.test.ts
git commit -m "feat(repl): ASCII layer render and key/macro/combo detail"
```

---

### Task 5: Tab completion (`complete.ts`)

**Files:**
- Create: `src/lib/repl/complete.ts`
- Test: `src/lib/repl/complete.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/repl/complete.test.ts
import { describe, it, expect } from "vitest";
import { complete, COMMANDS } from "./complete";
import { makeConfig } from "./test-fixtures";

const config = makeConfig();

describe("complete", () => {
  it("completes command names on the first token", () => {
    expect(complete(config, "")).toEqual([COMMANDS, ""]);
    expect(complete(config, "la")[0]).toEqual(["layers", "layer"]);
  });

  it("completes layer names after `layer`", () => {
    expect(complete(config, "layer sy")[0]).toEqual(["symbols", "system"]);
    expect(complete(config, "layer ")[0]).toEqual(["default", "symbols", "system"]);
  });

  it("completes layer names then key names for `key`", () => {
    expect(complete(config, "key def")[0]).toEqual(["default"]);
    expect(complete(config, "key default LM")[0]).toEqual([
      "LM1", "LM2", "LM3", "LM4", "LM5", "LM6",
    ]);
  });

  it("completes macro and combo names", () => {
    expect(complete(config, "macro co")[0]).toEqual(["copy_url"]);
    expect(complete(config, "combo e")[0]).toEqual(["esc_combo"]);
  });

  it("completes flash flags", () => {
    expect(complete(config, "flash --l")[0]).toEqual(["--local"]);
  });

  it("completes command names after `help`", () => {
    expect(complete(config, "help fi")[0]).toEqual(["find"]);
  });

  it("returns no candidates where completion makes no sense", () => {
    expect(complete(config, "find Cmd")[0]).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/repl/complete.test.ts`
Expected: FAIL — cannot resolve `./complete`.

- [ ] **Step 3: Implement `complete.ts`**

```ts
// src/lib/repl/complete.ts
import type { KeyboardConfig } from "../../types/schema";
import { GLOVE80_KEY_NAMES } from "../layout-map";

export const COMMANDS = [
  "layers", "layer", "key", "macros", "macro", "combos", "combo",
  "holdtaps", "morphs", "condlayers", "find", "flash", "help", "quit", "exit",
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
  if (parts.length <= 1) return pick(COMMANDS);
  const cmd = parts[0].toLowerCase();
  const layerNames = config.layers.map((l) => l.name);
  if (cmd === "layer" && parts.length === 2) return pick(layerNames);
  if (cmd === "key" && parts.length === 2) return pick(layerNames);
  if (cmd === "key" && parts.length === 3) return pick(GLOVE80_KEY_NAMES);
  if (cmd === "macro" && parts.length === 2) return pick((config.macros ?? []).map((m) => m.name));
  if (cmd === "combo" && parts.length === 2) return pick((config.combos ?? []).map((c) => c.name));
  if (cmd === "flash") return pick(FLASH_FLAGS);
  if (cmd === "help" && parts.length === 2) return pick(COMMANDS);
  return [[], last];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/repl/complete.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/repl/complete.ts src/lib/repl/complete.test.ts
git commit -m "feat(repl): contextual tab completion"
```

---

### Task 6: Command dispatch with hints (`dispatch.ts`)

**Files:**
- Create: `src/lib/repl/dispatch.ts`
- Test: `src/lib/repl/dispatch.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/repl/dispatch.test.ts
import { describe, it, expect } from "vitest";
import { dispatch } from "./dispatch";
import { makeConfig } from "./test-fixtures";

const config = makeConfig();

function outputOf(line: string): string {
  const r = dispatch(config, line);
  if (r.kind !== "output") throw new Error(`expected output, got ${r.kind}`);
  return r.text;
}

describe("dispatch", () => {
  it("quits on quit/exit", () => {
    expect(dispatch(config, "quit")).toEqual({ kind: "quit" });
    expect(dispatch(config, "exit")).toEqual({ kind: "quit" });
  });

  it("returns empty output for a blank line", () => {
    expect(dispatch(config, "  ")).toEqual({ kind: "output", text: "" });
  });

  it("suggests the closest command for typos", () => {
    expect(outputOf("lyer default")).toContain("Did you mean `layer`?");
  });

  it("prints usage when args are missing", () => {
    expect(outputOf("layer")).toContain("layer <name|index>");
    expect(outputOf("key default")).toContain("key <layer> <pos>");
  });

  it("surfaces resolution errors", () => {
    expect(outputOf("layer nope")).toContain("Unknown layer");
  });

  it("runs list, render, and detail commands", () => {
    expect(outputOf("layers")).toContain("default");
    expect(outputOf("layer default")).toContain("Layer 0: default");
    expect(outputOf("key default RM4")).toContain("kp LG(C)");
    expect(outputOf("macro copy_url")).toContain("1. tap");
    expect(outputOf("combo esc_combo")).toContain("LT1 (22)");
  });

  it("errors on unknown macro with valid names listed", () => {
    expect(outputOf("macro nope")).toContain("copy_url");
  });

  it("runs find and formats results", () => {
    const text = outputOf("find Cmd+C");
    expect(text).toContain("layer default · RM4 (pos 43) · tap → LG(C)");
  });

  it("reports unparseable and no-match find queries", () => {
    expect(outputOf("find foo+c")).toContain("Could not parse");
    expect(outputOf("find F24")).toContain("No bindings found");
  });

  it("returns a flash action for valid flags and usage for bad ones", () => {
    expect(dispatch(config, "flash --remote --full")).toEqual({
      kind: "flash",
      args: ["--remote", "--full"],
    });
    expect(outputOf("flash --bogus")).toContain("--local|--remote");
  });

  it("prints help and per-command help", () => {
    expect(outputOf("help")).toContain("find <query>");
    expect(outputOf("help find")).toContain("reverse lookup");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/repl/dispatch.test.ts`
Expected: FAIL — cannot resolve `./dispatch`.

- [ ] **Step 3: Implement `dispatch.ts`**

```ts
// src/lib/repl/dispatch.ts
import type { KeyboardConfig } from "../../types/schema";
import { findBindings, parseFindQuery, resolveLayer, resolvePosition } from "./query";
import {
  comboDetail, keyDetail, listCombos, listCondLayers, listHoldTaps,
  listLayers, listMacros, listModMorphs, macroDetail, renderLayer,
} from "./render";
import { FLASH_FLAGS } from "./complete";

export type DispatchResult =
  | { kind: "output"; text: string }
  | { kind: "flash"; args: string[] }
  | { kind: "quit" };

const USAGE: Record<string, string> = {
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
};

export const HELP = Object.values(USAGE).join("\n");

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => {
    const row = new Array<number>(b.length + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
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
  const [cmd, ...args] = tokens;
  switch (cmd.toLowerCase()) {
    case "quit":
    case "exit":
      return { kind: "quit" };
    case "help": {
      const topic = args[0]?.toLowerCase();
      if (topic && USAGE[topic]) return out(USAGE[topic]);
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
      const r = resolveLayer(config, args[0]);
      return out(r.ok ? renderLayer(config, r.value.index) : r.error);
    }
    case "key": {
      if (args.length !== 2) return out(USAGE.key);
      const lr = resolveLayer(config, args[0]);
      if (!lr.ok) return out(lr.error);
      const pr = resolvePosition(args[1]);
      if (!pr.ok) return out(pr.error);
      return out(keyDetail(config, lr.value.index, pr.value));
    }
    case "macro": {
      if (args.length !== 1) return out(USAGE.macro);
      const def = (config.macros ?? []).find((m) => m.name === args[0]);
      if (def) return out(macroDetail(def));
      const names = (config.macros ?? []).map((m) => m.name).join(", ");
      return out(`Unknown macro "${args[0]}". Macros: ${names}`);
    }
    case "combo": {
      if (args.length !== 1) return out(USAGE.combo);
      const def = (config.combos ?? []).find((c) => c.name === args[0]);
      if (def) return out(comboDetail(config, def));
      const names = (config.combos ?? []).map((c) => c.name).join(", ");
      return out(`Unknown combo "${args[0]}". Combos: ${names}`);
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/repl/dispatch.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole repl test suite**

Run: `npx vitest run src/lib/repl`
Expected: PASS, all files.

- [ ] **Step 6: Commit**

```bash
git add src/lib/repl/dispatch.ts src/lib/repl/dispatch.test.ts
git commit -m "feat(repl): command dispatch with usage hints and did-you-mean"
```

---

### Task 7: Shell script + npm script + smoke test

**Files:**
- Create: `scripts/repl.ts`
- Modify: `package.json` (scripts block)

- [ ] **Step 1: Write `scripts/repl.ts`**

```ts
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
    if (r.status !== 0) console.log(`flash exited with code ${r.status}`);
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
```

- [ ] **Step 2: Add the npm script**

In `package.json`, after the `"generate-firmware"` entry, add:

```json
    "repl": "tsx scripts/repl.ts",
```

- [ ] **Step 3: Smoke-test one-shot mode against the real config.json**

Run each and eyeball the output:

```bash
npm run repl -- layers        # 18 layers listed, names match config.json
npm run repl -- layer default # ASCII grid with ⌘/⌥-style labels
npm run repl -- key default LM1  # hold-tap detail with flavor + tapping-term
npm run repl -- find Cmd+C    # at least the copy_url macro should match
npm run repl -- lyer          # prints: Did you mean `layer`?
```

Expected: each prints sensible output and exits 0; no stack traces.

- [ ] **Step 4: Smoke-test the interactive loop**

```bash
printf 'layers\nlayer sym\nquit\n' | npm run repl
```

Expected: banner, layer list, rendered symbols layer (resolved from the unique... note: `sym` is ambiguous in the real config only if another layer starts with "sym" — if so it prints the ambiguity message, which is also fine), clean exit 0.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — no existing tests broken.

- [ ] **Step 6: Commit**

```bash
git add scripts/repl.ts package.json
git commit -m "feat(repl): npm run repl shell with one-shot mode and flash passthrough"
```

---

## Verification checklist (after all tasks)

- `npm test` passes.
- `npm run repl -- help` lists all commands from the spec.
- Tab completion works interactively for `layer <Tab>`, `key default <Tab>`, `macro <Tab>`, `flash <Tab>`.
- `flash` is NOT smoke-tested automatically (it builds firmware and waits for the keyboard); verify manually only if desired.
