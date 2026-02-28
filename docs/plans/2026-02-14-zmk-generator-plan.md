# ZMK Generator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a pure function that converts `KeyboardConfig` JSON into a complete ZMK `.keymap` file string.

**Architecture:** Single module `lib/generator.ts` with a `generateKeymap()` entry point. Semantic validation runs first, collecting all errors. If valid, template literals assemble the Devicetree output with `behaviorToString()` mapping each key. A `GLOVE80_ROW_LENGTHS` constant formats output into physical keyboard rows.

**Tech Stack:** TypeScript, Zod types from `types/schema.ts`, Vitest for testing.

---

### Task 1: Set up Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

**Step 1: Install vitest**

Run: `npm install --save-dev vitest`

**Step 2: Create vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
  },
});
```

**Step 3: Update package.json test script**

Change the `"test"` script in `package.json` to:

```json
"test": "vitest run"
```

**Step 4: Verify vitest runs**

Run: `npx vitest run`
Expected: "No test files found" (no error)

**Step 5: Commit**

```
feat: add vitest test runner
```

---

### Task 2: behaviorToString — simple behaviors (tap only, hold null)

**Files:**
- Create: `lib/generator.ts`
- Create: `lib/generator.test.ts`

**Step 1: Write failing tests for simple behaviors**

Create `lib/generator.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { behaviorToString } from "./generator";
import type { Key } from "../types/schema";

describe("behaviorToString", () => {
  it("generates &kp for key press", () => {
    const key: Key = { tap: { type: "kp", keyCode: "A" }, hold: null };
    expect(behaviorToString(key)).toBe("&kp A");
  });

  it("generates &kp for modifier key", () => {
    const key: Key = { tap: { type: "kp", keyCode: "LSHIFT" }, hold: null };
    expect(behaviorToString(key)).toBe("&kp LSHIFT");
  });

  it("generates &mo for momentary layer", () => {
    const key: Key = { tap: { type: "mo", layerIndex: 1 }, hold: null };
    expect(behaviorToString(key)).toBe("&mo 1");
  });

  it("generates &to for toggle layer", () => {
    const key: Key = { tap: { type: "to", layerIndex: 2 }, hold: null };
    expect(behaviorToString(key)).toBe("&to 2");
  });

  it("generates &sl for sticky layer", () => {
    const key: Key = { tap: { type: "sl", layerIndex: 1 }, hold: null };
    expect(behaviorToString(key)).toBe("&sl 1");
  });

  it("generates &trans", () => {
    const key: Key = { tap: { type: "trans" }, hold: null };
    expect(behaviorToString(key)).toBe("&trans");
  });

  it("generates &none", () => {
    const key: Key = { tap: { type: "none" }, hold: null };
    expect(behaviorToString(key)).toBe("&none");
  });

  it("generates &bootloader", () => {
    const key: Key = { tap: { type: "bootloader" }, hold: null };
    expect(behaviorToString(key)).toBe("&bootloader");
  });

  it("generates &sys_reset", () => {
    const key: Key = { tap: { type: "sys_reset" }, hold: null };
    expect(behaviorToString(key)).toBe("&sys_reset");
  });

  it("generates &bt BT_SEL with profile", () => {
    const key: Key = { tap: { type: "bt", action: "BT_SEL", profileIndex: 2 }, hold: null };
    expect(behaviorToString(key)).toBe("&bt BT_SEL 2");
  });

  it("generates &bt BT_CLR without profile", () => {
    const key: Key = { tap: { type: "bt", action: "BT_CLR" }, hold: null };
    expect(behaviorToString(key)).toBe("&bt BT_CLR");
  });

  it("generates &bt BT_NXT", () => {
    const key: Key = { tap: { type: "bt", action: "BT_NXT" }, hold: null };
    expect(behaviorToString(key)).toBe("&bt BT_NXT");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/generator.test.ts`
Expected: FAIL — `behaviorToString` not found

**Step 3: Implement behaviorToString**

Create `lib/generator.ts`:

```ts
import type { Behavior, Key } from "../types/schema";

function tapBehaviorToString(behavior: Behavior): string {
  switch (behavior.type) {
    case "kp":
      return `&kp ${behavior.keyCode}`;
    case "mo":
      return `&mo ${behavior.layerIndex}`;
    case "to":
      return `&to ${behavior.layerIndex}`;
    case "sl":
      return `&sl ${behavior.layerIndex}`;
    case "trans":
      return "&trans";
    case "none":
      return "&none";
    case "bootloader":
      return "&bootloader";
    case "sys_reset":
      return "&sys_reset";
    case "bt": {
      const parts = ["&bt", behavior.action];
      if (behavior.profileIndex !== undefined) {
        parts.push(String(behavior.profileIndex));
      }
      return parts.join(" ");
    }
  }
}

export function behaviorToString(key: Key): string {
  if (key.hold === null) {
    return tapBehaviorToString(key.tap);
  }
  // hold logic added in Task 3
  return tapBehaviorToString(key.tap);
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/generator.test.ts`
Expected: All 12 tests PASS

**Step 5: Commit**

```
feat: add behaviorToString for simple tap behaviors
```

---

### Task 3: behaviorToString — tap+hold (&lt and &mt inference)

**Files:**
- Modify: `lib/generator.test.ts`
- Modify: `lib/generator.ts`

**Step 1: Write failing tests for tap+hold**

Append to `lib/generator.test.ts` inside the `describe("behaviorToString")` block:

```ts
  it("generates &lt for layer-tap (hold=mo)", () => {
    const key: Key = {
      tap: { type: "kp", keyCode: "SPACE" },
      hold: { type: "mo", layerIndex: 1 },
    };
    expect(behaviorToString(key)).toBe("&lt 1 SPACE");
  });

  it("generates &lt for layer-tap (hold=to)", () => {
    const key: Key = {
      tap: { type: "kp", keyCode: "TAB" },
      hold: { type: "to", layerIndex: 2 },
    };
    expect(behaviorToString(key)).toBe("&lt 2 TAB");
  });

  it("generates &lt for layer-tap (hold=sl)", () => {
    const key: Key = {
      tap: { type: "kp", keyCode: "ESC" },
      hold: { type: "sl", layerIndex: 0 },
    };
    expect(behaviorToString(key)).toBe("&lt 0 ESC");
  });

  it("generates &mt for mod-tap (hold=kp modifier)", () => {
    const key: Key = {
      tap: { type: "kp", keyCode: "A" },
      hold: { type: "kp", keyCode: "LSHIFT" },
    };
    expect(behaviorToString(key)).toBe("&mt LSHIFT A");
  });

  it("generates &mt for RCTRL mod-tap", () => {
    const key: Key = {
      tap: { type: "kp", keyCode: "Z" },
      hold: { type: "kp", keyCode: "RCTRL" },
    };
    expect(behaviorToString(key)).toBe("&mt RCTRL Z");
  });
```

**Step 2: Run tests to verify new tests fail**

Run: `npx vitest run lib/generator.test.ts`
Expected: 5 new tests FAIL (tap+hold returns tap-only string)

**Step 3: Implement hold logic in behaviorToString**

Replace the `behaviorToString` function in `lib/generator.ts`:

```ts
export function behaviorToString(key: Key): string {
  if (key.hold === null) {
    return tapBehaviorToString(key.tap);
  }

  // Layer-tap: hold is a layer behavior → &lt <layerIndex> <tapKeyCode>
  if (
    (key.hold.type === "mo" || key.hold.type === "to" || key.hold.type === "sl") &&
    key.tap.type === "kp"
  ) {
    return `&lt ${key.hold.layerIndex} ${key.tap.keyCode}`;
  }

  // Mod-tap: hold is kp (modifier) → &mt <holdKeyCode> <tapKeyCode>
  if (key.hold.type === "kp" && key.tap.type === "kp") {
    return `&mt ${key.hold.keyCode} ${key.tap.keyCode}`;
  }

  // Unsupported combination — validation should catch this before we get here
  return tapBehaviorToString(key.tap);
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/generator.test.ts`
Expected: All 17 tests PASS

**Step 5: Commit**

```
feat: add &lt and &mt inference for tap+hold keys
```

---

### Task 4: Semantic validation

**Files:**
- Modify: `lib/generator.test.ts`
- Modify: `lib/generator.ts`

**Step 1: Write failing tests for validation**

Add a new `describe("validateConfig")` block in `lib/generator.test.ts`:

```ts
import { validateConfig } from "./generator";
import type { KeyboardConfig, Key, Layer } from "../types/schema";
import { randomUUID } from "crypto";

function makeKey(tap: Key["tap"], hold: Key["hold"] = null): Key {
  return { tap, hold };
}

function makeLayer(name: string, keys: Key[] = []): Layer {
  const padded = keys.concat(
    Array.from({ length: 80 - keys.length }, () => makeKey({ type: "trans" }))
  );
  return { id: randomUUID(), name, keys: padded };
}

function makeConfig(layers: Layer[]): KeyboardConfig {
  return { name: "Test", version: 1, layers };
}

describe("validateConfig", () => {
  it("returns no errors for valid config", () => {
    const config = makeConfig([
      makeLayer("Base", [makeKey({ type: "kp", keyCode: "A" })]),
    ]);
    expect(validateConfig(config)).toEqual([]);
  });

  it("detects out-of-bounds layerIndex in tap", () => {
    const config = makeConfig([
      makeLayer("Base", [makeKey({ type: "mo", layerIndex: 5 })]),
    ]);
    const errors = validateConfig(config);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.path).toBe("layers[0].keys[0].tap");
    expect(errors[0]!.message).toContain("out of bounds");
  });

  it("detects out-of-bounds layerIndex in hold", () => {
    const config = makeConfig([
      makeLayer("Base", [
        makeKey({ type: "kp", keyCode: "A" }, { type: "mo", layerIndex: 3 }),
      ]),
    ]);
    const errors = validateConfig(config);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.path).toBe("layers[0].keys[0].hold");
  });

  it("detects BT_SEL without profileIndex", () => {
    const config = makeConfig([
      makeLayer("Base", [
        makeKey({ type: "bt", action: "BT_SEL" }),
      ]),
    ]);
    const errors = validateConfig(config);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("BT_SEL requires profileIndex");
  });

  it("allows BT_CLR without profileIndex", () => {
    const config = makeConfig([
      makeLayer("Base", [
        makeKey({ type: "bt", action: "BT_CLR" }),
      ]),
    ]);
    expect(validateConfig(config)).toEqual([]);
  });

  it("detects invalid hold behavior (bootloader)", () => {
    const config = makeConfig([
      makeLayer("Base", [
        makeKey({ type: "kp", keyCode: "A" }, { type: "bootloader" }),
      ]),
    ]);
    const errors = validateConfig(config);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("hold must be kp or layer behavior");
  });

  it("detects &mt with non-modifier keyCode", () => {
    const config = makeConfig([
      makeLayer("Base", [
        makeKey({ type: "kp", keyCode: "A" }, { type: "kp", keyCode: "B" }),
      ]),
    ]);
    const errors = validateConfig(config);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("mod-tap requires modifier keyCode");
  });

  it("allows &mt with valid modifier", () => {
    const config = makeConfig([
      makeLayer("Base", [
        makeKey({ type: "kp", keyCode: "A" }, { type: "kp", keyCode: "LGUI" }),
      ]),
    ]);
    expect(validateConfig(config)).toEqual([]);
  });

  it("collects multiple errors", () => {
    const config = makeConfig([
      makeLayer("Base", [
        makeKey({ type: "mo", layerIndex: 9 }),
        makeKey({ type: "bt", action: "BT_SEL" }),
      ]),
    ]);
    const errors = validateConfig(config);
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/generator.test.ts`
Expected: FAIL — `validateConfig` not found

**Step 3: Implement validateConfig**

Add to `lib/generator.ts`:

```ts
export type ValidationError = {
  path: string;
  message: string;
};

const ZMK_MODIFIERS = new Set([
  "LSHIFT", "RSHIFT", "LCTRL", "RCTRL", "LALT", "RALT", "LGUI", "RGUI",
]);

const VALID_HOLD_TYPES = new Set(["kp", "mo", "to", "sl"]);

function validateBehavior(
  behavior: Behavior,
  path: string,
  layerCount: number,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (
    (behavior.type === "mo" || behavior.type === "to" || behavior.type === "sl") &&
    behavior.layerIndex >= layerCount
  ) {
    errors.push({
      path,
      message: `layerIndex ${behavior.layerIndex} out of bounds (max ${layerCount - 1})`,
    });
  }

  if (behavior.type === "bt" && behavior.action === "BT_SEL" && behavior.profileIndex === undefined) {
    errors.push({ path, message: "BT_SEL requires profileIndex" });
  }

  return errors;
}

export function validateConfig(config: KeyboardConfig): ValidationError[] {
  const errors: ValidationError[] = [];
  const layerCount = config.layers.length;

  for (let li = 0; li < config.layers.length; li++) {
    const layer = config.layers[li]!;
    for (let ki = 0; ki < layer.keys.length; ki++) {
      const key = layer.keys[ki]!;
      const keyPath = `layers[${li}].keys[${ki}]`;

      errors.push(...validateBehavior(key.tap, `${keyPath}.tap`, layerCount));

      if (key.hold !== null) {
        errors.push(...validateBehavior(key.hold, `${keyPath}.hold`, layerCount));

        if (!VALID_HOLD_TYPES.has(key.hold.type)) {
          errors.push({
            path: keyPath,
            message: `hold must be kp or layer behavior (mo/to/sl), got "${key.hold.type}"`,
          });
        }

        if (key.hold.type === "kp" && !ZMK_MODIFIERS.has(key.hold.keyCode)) {
          errors.push({
            path: `${keyPath}.hold`,
            message: `mod-tap requires modifier keyCode, got "${key.hold.keyCode}"`,
          });
        }
      }
    }
  }

  return errors;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/generator.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```
feat: add semantic validation for keyboard config
```

---

### Task 5: Layer name sanitization

**Files:**
- Modify: `lib/generator.test.ts`
- Modify: `lib/generator.ts`

**Step 1: Write failing tests**

Add a new `describe("sanitizeLayerName")` block:

```ts
import { sanitizeLayerName } from "./generator";

describe("sanitizeLayerName", () => {
  it("lowercases and keeps alphanumeric", () => {
    expect(sanitizeLayerName("Base")).toBe("base");
  });

  it("replaces spaces with underscores", () => {
    expect(sanitizeLayerName("My Layer")).toBe("my_layer");
  });

  it("replaces special characters", () => {
    expect(sanitizeLayerName("Layer!@#$")).toBe("layer_");
  });

  it("collapses consecutive underscores", () => {
    expect(sanitizeLayerName("A  --  B")).toBe("a_b");
  });

  it("prefixes with layer_ if starts with digit", () => {
    expect(sanitizeLayerName("2nd Layer")).toBe("layer_2nd_layer");
  });

  it("handles already clean names", () => {
    expect(sanitizeLayerName("lower")).toBe("lower");
  });

  it("strips trailing underscores", () => {
    expect(sanitizeLayerName("test!")).toBe("test");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/generator.test.ts`
Expected: FAIL — `sanitizeLayerName` not found

**Step 3: Implement sanitizeLayerName**

Add to `lib/generator.ts`:

```ts
export function sanitizeLayerName(name: string): string {
  let sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  if (/^[0-9]/.test(sanitized)) {
    sanitized = `layer_${sanitized}`;
  }

  return sanitized;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/generator.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```
feat: add layer name sanitization for Devicetree
```

---

### Task 6: generateKeymap — full .keymap output

**Files:**
- Modify: `lib/generator.test.ts`
- Modify: `lib/generator.ts`

**Step 1: Write failing test for full generation**

Add a new `describe("generateKeymap")` block:

```ts
import { generateKeymap } from "./generator";

describe("generateKeymap", () => {
  it("returns errors when config is invalid", () => {
    const config = makeConfig([
      makeLayer("Base", [makeKey({ type: "mo", layerIndex: 5 })]),
    ]);
    const result = generateKeymap(config);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("generates valid .keymap for single-layer config", () => {
    const keys = Array.from({ length: 80 }, () =>
      makeKey({ type: "kp", keyCode: "A" })
    );
    const config = makeConfig([{ id: randomUUID(), name: "Base", keys }]);
    const result = generateKeymap(config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.keymap).toContain("#include <behaviors.dtsi>");
      expect(result.keymap).toContain("#include <dt-bindings/zmk/keys.h>");
      expect(result.keymap).toContain("#include <dt-bindings/zmk/bt.h>");
      expect(result.keymap).toContain('compatible = "zmk,keymap"');
      expect(result.keymap).toContain("base {");
      expect(result.keymap).toContain("&kp A");
    }
  });

  it("generates multi-layer .keymap", () => {
    const baseKeys = Array.from({ length: 80 }, () =>
      makeKey({ type: "kp", keyCode: "A" })
    );
    const lowerKeys = Array.from({ length: 80 }, () =>
      makeKey({ type: "trans" })
    );
    const config = makeConfig([
      { id: randomUUID(), name: "Base", keys: baseKeys },
      { id: randomUUID(), name: "Lower", keys: lowerKeys },
    ]);
    const result = generateKeymap(config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.keymap).toContain("base {");
      expect(result.keymap).toContain("lower {");
      expect(result.keymap).toContain("&trans");
    }
  });

  it("sanitizes layer names in output", () => {
    const keys = Array.from({ length: 80 }, () =>
      makeKey({ type: "kp", keyCode: "A" })
    );
    const config = makeConfig([
      { id: randomUUID(), name: "2nd Layer!", keys },
    ]);
    const result = generateKeymap(config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.keymap).toContain("layer_2nd_layer {");
      expect(result.keymap).not.toContain("2nd Layer!");
    }
  });

  it("formats bindings in physical rows", () => {
    const keys = Array.from({ length: 80 }, (_, i) =>
      makeKey({ type: "kp", keyCode: `K${i}` })
    );
    const config = makeConfig([{ id: randomUUID(), name: "Base", keys }]);
    const result = generateKeymap(config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Bindings block should have multiple lines (not one giant line)
      const bindingsMatch = result.keymap.match(/bindings = <([\s\S]*?)>/);
      expect(bindingsMatch).not.toBeNull();
      const bindingsLines = bindingsMatch![1]!.trim().split("\n");
      expect(bindingsLines.length).toBeGreaterThan(1);
    }
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/generator.test.ts`
Expected: FAIL — `generateKeymap` not found

**Step 3: Implement generateKeymap with GLOVE80_ROW_LENGTHS**

Add to `lib/generator.ts`:

```ts
// Glove80 physical row lengths (left half then right half, top to bottom)
// Row grouping matches the physical key layout for readable output
const GLOVE80_ROW_LENGTHS = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 6, 6];

export type GeneratorResult =
  | { ok: true; keymap: string }
  | { ok: false; errors: ValidationError[] };

export function generateKeymap(config: KeyboardConfig): GeneratorResult {
  const errors = validateConfig(config);
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const layerBlocks = config.layers.map((layer) => {
    const bindings = layer.keys.map((key) => behaviorToString(key));

    // Chunk into physical rows
    const rows: string[] = [];
    let offset = 0;
    for (const rowLen of GLOVE80_ROW_LENGTHS) {
      rows.push(bindings.slice(offset, offset + rowLen).join("  "));
      offset += rowLen;
    }

    const bindingsStr = rows.map((r) => `                ${r}`).join("\n");
    const name = sanitizeLayerName(layer.name);

    return `        ${name} {
            bindings = <
${bindingsStr}
            >;
        };`;
  });

  const keymap = `#include <behaviors.dtsi>
#include <dt-bindings/zmk/keys.h>
#include <dt-bindings/zmk/bt.h>

/ {
    keymap {
        compatible = "zmk,keymap";

${layerBlocks.join("\n\n")}
    };
};
`;

  return { ok: true, keymap };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/generator.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```
feat: add generateKeymap with full .keymap output
```

---

### Task 7: Type-check and final verification

**Files:**
- No new files

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

**Step 2: Run type checker**

Run: `npx tsc --noEmit --project tsconfig.json`
Expected: No errors

**Step 3: Commit any fixes if needed, then tag phase 2 complete**

```
chore: phase 2 complete — ZMK generator
```
