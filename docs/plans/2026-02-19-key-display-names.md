# Key Display Names Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace raw ZMK codes on keycaps with readable symbols and characters, and make keys square.

**Architecture:** Enhance `behaviorLabel()` in `labels.ts` to resolve keycodes to human labels via a lookup map, add layer-name resolution for layer behaviors, and add modifier-symbol rendering for modified keys. Update `KeyCap.tsx` for square aspect ratio and `none` styling.

**Tech Stack:** TypeScript, Vitest, Tailwind CSS, React.

---

### Task 1: Add keycode display label lookup map

**Files:**
- Modify: `src/lib/labels.ts`
- Modify: `src/lib/labels.test.ts`

**Context:** `src/lib/keycodes.ts` exports `ZMK_KEYCODES` — an array of `{ code, label, category }`. Currently `behaviorLabel()` returns `behavior.keyCode` raw. We need a lookup map and a function that resolves codes to display labels, with special handling for modified keys like `LC(S)`.

**Step 1: Write failing tests for keycode label resolution**

Add to `labels.test.ts`:

```typescript
import { keyCodeDisplayLabel } from "./labels";

describe("keyCodeDisplayLabel", () => {
  it("letters pass through", () => {
    expect(keyCodeDisplayLabel("A")).toBe("A");
  });

  it("numbers strip N prefix", () => {
    expect(keyCodeDisplayLabel("N0")).toBe("0");
    expect(keyCodeDisplayLabel("N9")).toBe("9");
  });

  it("punctuation uses symbol", () => {
    expect(keyCodeDisplayLabel("SEMI")).toBe(";");
    expect(keyCodeDisplayLabel("DOT")).toBe(".");
    expect(keyCodeDisplayLabel("COMMA")).toBe(",");
    expect(keyCodeDisplayLabel("FSLH")).toBe("/");
    expect(keyCodeDisplayLabel("BSLH")).toBe("\\");
    expect(keyCodeDisplayLabel("LBKT")).toBe("[");
    expect(keyCodeDisplayLabel("RBKT")).toBe("]");
    expect(keyCodeDisplayLabel("MINUS")).toBe("-");
    expect(keyCodeDisplayLabel("EQUAL")).toBe("=");
    expect(keyCodeDisplayLabel("SQT")).toBe("'");
    expect(keyCodeDisplayLabel("GRAVE")).toBe("`");
    expect(keyCodeDisplayLabel("TILDE")).toBe("~");
  });

  it("arrow keys use triangle symbols", () => {
    expect(keyCodeDisplayLabel("UP")).toBe("▲");
    expect(keyCodeDisplayLabel("DOWN")).toBe("▼");
    expect(keyCodeDisplayLabel("LEFT")).toBe("◀");
    expect(keyCodeDisplayLabel("RIGHT")).toBe("▶");
  });

  it("control keys use symbols or abbreviations", () => {
    expect(keyCodeDisplayLabel("BSPC")).toBe("⌫");
    expect(keyCodeDisplayLabel("DEL")).toBe("⌦");
    expect(keyCodeDisplayLabel("RET")).toBe("⏎");
    expect(keyCodeDisplayLabel("SPACE")).toBe("␣");
    expect(keyCodeDisplayLabel("TAB")).toBe("Tab");
    expect(keyCodeDisplayLabel("ESC")).toBe("Esc");
    expect(keyCodeDisplayLabel("CAPS")).toBe("Caps");
    expect(keyCodeDisplayLabel("PG_UP")).toBe("PgUp");
    expect(keyCodeDisplayLabel("PG_DN")).toBe("PgDn");
    expect(keyCodeDisplayLabel("INS")).toBe("Ins");
    expect(keyCodeDisplayLabel("PSCRN")).toBe("PrtSc");
    expect(keyCodeDisplayLabel("SLCK")).toBe("ScrLk");
    expect(keyCodeDisplayLabel("PAUSE_BREAK")).toBe("Pause");
    expect(keyCodeDisplayLabel("HOME")).toBe("Home");
    expect(keyCodeDisplayLabel("END")).toBe("End");
  });

  it("standalone modifiers use Mac symbols", () => {
    expect(keyCodeDisplayLabel("LSHIFT")).toBe("⇧");
    expect(keyCodeDisplayLabel("RSHIFT")).toBe("⇧R");
    expect(keyCodeDisplayLabel("LCTRL")).toBe("⌃");
    expect(keyCodeDisplayLabel("RCTRL")).toBe("⌃R");
    expect(keyCodeDisplayLabel("LALT")).toBe("⌥");
    expect(keyCodeDisplayLabel("RALT")).toBe("⌥R");
    expect(keyCodeDisplayLabel("LGUI")).toBe("⌘");
    expect(keyCodeDisplayLabel("RGUI")).toBe("⌘R");
  });

  it("modified keys use modifier symbols + resolved base key", () => {
    expect(keyCodeDisplayLabel("LC(S)")).toBe("⌃S");
    expect(keyCodeDisplayLabel("LS(FSLH)")).toBe("⇧/");
    expect(keyCodeDisplayLabel("LA(LC(DEL))")).toBe("⌥⌃⌦");
    expect(keyCodeDisplayLabel("LG(N1)")).toBe("⌘1");
  });

  it("function keys pass through", () => {
    expect(keyCodeDisplayLabel("F1")).toBe("F1");
    expect(keyCodeDisplayLabel("F12")).toBe("F12");
  });

  it("media keys use label", () => {
    expect(keyCodeDisplayLabel("C_VOL_UP")).toBe("Vol Up");
    expect(keyCodeDisplayLabel("C_PP")).toBe("Play/Pause");
  });

  it("unknown codes pass through", () => {
    expect(keyCodeDisplayLabel("UNKNOWN_KEY")).toBe("UNKNOWN_KEY");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/labels.test.ts`
Expected: FAIL — `keyCodeDisplayLabel` is not exported.

**Step 3: Implement keyCodeDisplayLabel**

In `src/lib/labels.ts`, add:

```typescript
import { ZMK_KEYCODES } from "./keycodes";
import { isModifiedKeyCode, parseModifiedKeyCode } from "./keycodes";

/** Override map: ZMK code → display label. Checked before ZMK_KEYCODES lookup. */
const DISPLAY_OVERRIDES: Record<string, string> = {
  // Arrow keys — triangle symbols
  UP: "▲", DOWN: "▼", LEFT: "◀", RIGHT: "▶",
  // Control keys — Unicode symbols
  BSPC: "⌫", DEL: "⌦", RET: "⏎", SPACE: "␣",
  // Control keys — words/abbreviations
  TAB: "Tab", ESC: "Esc", CAPS: "Caps",
  PG_UP: "PgUp", PG_DN: "PgDn", INS: "Ins",
  PSCRN: "PrtSc", SLCK: "ScrLk", PAUSE_BREAK: "Pause",
  HOME: "Home", END: "End",
  // Standalone modifiers — Mac symbols
  LSHIFT: "⇧", RSHIFT: "⇧R",
  LCTRL: "⌃", RCTRL: "⌃R",
  LALT: "⌥", RALT: "⌥R",
  LGUI: "⌘", RGUI: "⌘R",
};

/** Modifier wrapper → Mac symbol */
const MODIFIER_SYMBOLS: Record<string, string> = {
  LC: "⌃", RC: "⌃", LS: "⇧", RS: "⇧",
  LA: "⌥", RA: "⌥", LG: "⌘", RG: "⌘",
};

/** ZMK code → label from ZMK_KEYCODES array */
const KEYCODE_LABEL_MAP: ReadonlyMap<string, string> = new Map(
  ZMK_KEYCODES.map((k) => [k.code, k.label]),
);

export function keyCodeDisplayLabel(code: string): string {
  // Check overrides first
  const override = DISPLAY_OVERRIDES[code];
  if (override !== undefined) return override;

  // Modified keys like LC(S), LA(LC(DEL))
  if (isModifiedKeyCode(code)) {
    const parsed = parseModifiedKeyCode(code);
    const modSymbols = parsed.mods.map((m) => MODIFIER_SYMBOLS[m] ?? m).join("");
    const baseLabel = keyCodeDisplayLabel(parsed.key);
    return `${modSymbols}${baseLabel}`;
  }

  // Lookup in ZMK_KEYCODES label map
  return KEYCODE_LABEL_MAP.get(code) ?? code;
}
```

Then update the `kp` case in `behaviorLabel()`:

```typescript
case "kp":
  return keyCodeDisplayLabel(behavior.keyCode);
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/labels.test.ts`
Expected: All PASS.

**Step 5: Commit**

```
feat: add keycode display label resolution with symbols
```

---

### Task 2: Add layer name resolution to behaviorLabel

**Files:**
- Modify: `src/lib/labels.ts`
- Modify: `src/lib/labels.test.ts`
- Modify: `src/components/KeyCap.tsx`

**Context:** Layer behaviors (mo, to, tog, sl) currently show `MO 1`, `TO 2`, etc. They should show `◇ Base`, `⇨ Nav`, etc. This requires `behaviorLabel()` to accept an optional `layerNames` parameter — an array of layer names indexed by layer number.

**Step 1: Write failing tests for layer name display**

Update existing tests and add new ones in `labels.test.ts`:

```typescript
describe("behaviorLabel with layer names", () => {
  const layerNames = ["Base", "Nav", "Num", "Sym"];

  it("mo shows ◇ + layer name", () => {
    expect(behaviorLabel({ type: "mo", layerIndex: 0 }, layerNames)).toBe("◇ Base");
    expect(behaviorLabel({ type: "mo", layerIndex: 1 }, layerNames)).toBe("◇ Nav");
  });

  it("to shows ⇨ + layer name", () => {
    expect(behaviorLabel({ type: "to", layerIndex: 2 }, layerNames)).toBe("⇨ Num");
  });

  it("tog shows ⇄ + layer name", () => {
    expect(behaviorLabel({ type: "tog", layerIndex: 3 }, layerNames)).toBe("⇄ Sym");
  });

  it("sl shows ◆ + layer name", () => {
    expect(behaviorLabel({ type: "sl", layerIndex: 0 }, layerNames)).toBe("◆ Base");
  });

  it("falls back to index when name not found", () => {
    expect(behaviorLabel({ type: "mo", layerIndex: 99 }, layerNames)).toBe("◇ 99");
  });

  it("falls back to index when no layerNames provided", () => {
    expect(behaviorLabel({ type: "mo", layerIndex: 1 })).toBe("◇ 1");
  });
});
```

Also update existing tests — they no longer pass layerNames, so they should use the fallback (index number). Update them to expect the new symbol format:

```typescript
it("mo returns ◇ + index when no layer names", () => {
  expect(behaviorLabel({ type: "mo", layerIndex: 1 })).toBe("◇ 1");
});

it("to returns ⇨ + index when no layer names", () => {
  expect(behaviorLabel({ type: "to", layerIndex: 2 })).toBe("⇨ 2");
});

it("sl returns ◆ + index when no layer names", () => {
  expect(behaviorLabel({ type: "sl", layerIndex: 0 })).toBe("◆ 0");
});

it("tog returns ⇄ + index when no layer names", () => {
  expect(behaviorLabel({ type: "tog", layerIndex: 3 })).toBe("⇄ 3");
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/labels.test.ts`
Expected: FAIL — signature mismatch and wrong expected values.

**Step 3: Update behaviorLabel signature and layer cases**

In `src/lib/labels.ts`, change the signature and layer cases:

```typescript
export function behaviorLabel(behavior: Behavior, layerNames?: string[]): string {
  switch (behavior.type) {
    case "kp":
      return keyCodeDisplayLabel(behavior.keyCode);
    case "mo":
      return `◇ ${layerNames?.[behavior.layerIndex] ?? behavior.layerIndex}`;
    case "to":
      return `⇨ ${layerNames?.[behavior.layerIndex] ?? behavior.layerIndex}`;
    case "sl":
      return `◆ ${layerNames?.[behavior.layerIndex] ?? behavior.layerIndex}`;
    case "tog":
      return `⇄ ${layerNames?.[behavior.layerIndex] ?? behavior.layerIndex}`;
    case "none":
      return "";
    // ... rest unchanged
  }
}
```

**Step 4: Update KeyCap.tsx to pass layer names**

In `src/components/KeyCap.tsx`, derive `layerNames` from the store and pass to `behaviorLabel`:

```typescript
const layerNames = useEditorStore((s) => s.config.layers.map((l) => l.name));

const tapLabel = key ? behaviorLabel(key.tap, layerNames) : "";
const holdLabel = key?.hold ? behaviorLabel(key.hold, layerNames) : "";
```

Note: `layerNames` selector returns a new array each render. For stable references, either memoize or accept it — at 80 keys the cost is trivial and the array is tiny.

**Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/labels.test.ts`
Expected: All PASS.

**Step 6: Commit**

```
feat: show layer names with symbols for mo/to/tog/sl behaviors
```

---

### Task 3: Update `none` styling and make keys square

**Files:**
- Modify: `src/components/KeyCap.tsx`

**Context:** `none` now returns `""` (empty string). It needs a light gray background to distinguish from `trans` (which is also blank). Keys need `aspect-ratio: 1` to be square.

**Step 1: Determine behavior type for styling**

`KeyCap` needs to know if the tap behavior is `none` to apply gray styling. It already has access to `key.tap.type`.

**Step 2: Update KeyCap component**

```typescript
export function KeyCap({ index }: { index: number }) {
  const key = useEditorStore((s) => {
    const layer = s.config.layers[s.activeLayerIndex];
    return layer?.keys[index];
  });
  const isSelected = useEditorStore((s) => s.selectedKeyIndex === index);
  const layerNames = useEditorStore((s) => s.config.layers.map((l) => l.name));

  const tapLabel = key ? behaviorLabel(key.tap, layerNames) : "";
  const holdLabel = key?.hold ? behaviorLabel(key.hold, layerNames) : "";
  const isNone = key?.tap.type === "none";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        const store = editorStore.getState();
        store.selectKey(store.selectedKeyIndex === index ? null : index);
      }}
      className={`
        flex flex-col items-center justify-center
        rounded-md border p-0.5
        text-[10px] leading-tight
        aspect-square
        cursor-pointer select-none
        transition-colors
        ${isSelected
          ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/30 dark:bg-blue-950"
          : isNone
            ? "border-gray-300 bg-gray-100 hover:bg-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
            : "border-gray-400 bg-card hover:bg-accent dark:border-gray-600"
        }
      `}
    >
      <span className="font-medium truncate max-w-full">{tapLabel}</span>
      {holdLabel && (
        <span className="text-[8px] text-muted-foreground truncate max-w-full">{holdLabel}</span>
      )}
    </button>
  );
}
```

Key changes:
- Replace `min-h-[40px] min-w-[40px]` with `aspect-square` (Tailwind for `aspect-ratio: 1`)
- Add `isNone` check for gray styling
- Gray palette: `bg-gray-100 border-gray-300` (light), `bg-gray-800 border-gray-700` (dark)

**Step 3: Visual check**

Run: `npx next dev` and inspect the keyboard layout. Verify:
- Keys are square
- `none` keys show blank with gray background
- `trans` keys show blank with normal background
- All labels display correctly with symbols

**Step 4: Commit**

```
feat: make keys square and add gray styling for none behavior
```

---

### Task 4: Update existing test expectations

**Files:**
- Modify: `src/lib/labels.test.ts`

**Context:** Several existing tests will have stale expectations from before the changes. This task ensures the full test suite is green.

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: Some label tests may fail due to updated expectations (e.g., `kp` LSHIFT now returns `⇧` instead of `LSHIFT`, `none` returns `""` instead of `"OFF"`).

**Step 2: Update stale test expectations**

Update these existing tests:

```typescript
// kp test: LSHIFT now resolves to ⇧
it("kp returns display label", () => {
  expect(behaviorLabel({ type: "kp", keyCode: "A" })).toBe("A");
  expect(behaviorLabel({ type: "kp", keyCode: "LSHIFT" })).toBe("⇧");
});

// none test: now returns empty string
it("none returns empty string", () => {
  expect(behaviorLabel({ type: "none" })).toBe("");
});
```

**Step 3: Run full test suite again**

Run: `npx vitest run`
Expected: All 187+ tests PASS.

**Step 4: Commit**

```
test: update label test expectations for new display symbols
```
