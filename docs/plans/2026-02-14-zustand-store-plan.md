# Zustand Store Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** App state management for the Glove80 configurator with undo/redo support.

**Architecture:** Zustand vanilla store with immer middleware for clean nested mutations. zundo temporal middleware for undo/redo, with equality check to only track config changes (UI-only changes like switching tabs or selecting keys don't create undo entries). Factory function `createEditorStore()` returns fresh instances for testing.

**Tech Stack:** zustand, immer, zundo, vitest (existing)

**Key context:**
- `types/schema.ts` — Zod schemas, types (`Behavior`, `Key`, `Layer`, `KeyboardConfig`), constants (`DEFAULT_KEY`, `GLOVE80_KEY_COUNT`)
- `lib/generator.ts` — existing ZMK generator (not modified in this phase)
- `tsconfig.json` has `verbatimModuleSyntax: true` (must use `import type` for type-only imports) and `exactOptionalPropertyTypes: true`
- `moduleResolution: "node10"` — may need adjustment if zustand subpath imports don't resolve

---

### Task 1: Install dependencies and verify imports

**Files:**
- Modify: `package.json`

**Step 1: Install zustand, immer, zundo**

Run: `npm install zustand immer zundo`

**Step 2: Verify imports resolve with tsconfig**

Create a minimal test file that imports from zustand subpaths and run vitest to check resolution:

```bash
npx vitest run --passWithNoTests
```

Expected: PASS

If `zustand/vanilla` or `zustand/middleware/immer` fails to resolve, change `moduleResolution` in `tsconfig.json` from `"node10"` to `"bundler"` and also set `"module"` to `"es2022"` (required for bundler resolution).

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add zustand, immer, zundo dependencies"
```

If tsconfig was changed:
```bash
git add tsconfig.json
git commit -m "Switch moduleResolution to bundler for zustand imports"
```

---

### Task 2: Store skeleton with initial state

**Files:**
- Create: `lib/store.ts`
- Create: `lib/store.test.ts`

**Step 1: Write the failing tests**

```ts
// lib/store.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createEditorStore } from "./store";

describe("createEditorStore", () => {
  let store: ReturnType<typeof createEditorStore>;

  beforeEach(() => {
    store = createEditorStore();
  });

  it("initializes with one Base layer", () => {
    const { config } = store.getState();
    expect(config.layers).toHaveLength(1);
    expect(config.layers[0]!.name).toBe("Base");
  });

  it("Base layer has 80 keys", () => {
    const { config } = store.getState();
    expect(config.layers[0]!.keys).toHaveLength(80);
  });

  it("all keys default to trans/null", () => {
    const { config } = store.getState();
    for (const key of config.layers[0]!.keys) {
      expect(key.tap).toEqual({ type: "trans" });
      expect(key.hold).toBeNull();
    }
  });

  it("initializes with activeLayerIndex 0", () => {
    expect(store.getState().activeLayerIndex).toBe(0);
  });

  it("initializes with selectedKeyIndex null", () => {
    expect(store.getState().selectedKeyIndex).toBeNull();
  });

  it("config has version 1", () => {
    expect(store.getState().config.version).toBe(1);
  });

  it("each layer has a UUID id", () => {
    const { config } = store.getState();
    expect(config.layers[0]!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/store.test.ts`
Expected: FAIL — module `./store` not found

**Step 3: Write minimal implementation**

```ts
// lib/store.ts
import { createStore } from "zustand/vanilla";
import { immer } from "zustand/middleware/immer";
import { randomUUID } from "crypto";
import type { Behavior, KeyboardConfig } from "../types/schema";
import { DEFAULT_KEY, GLOVE80_KEY_COUNT, KeyboardConfigSchema } from "../types/schema";

export interface EditorState {
  config: KeyboardConfig;
  activeLayerIndex: number;
  selectedKeyIndex: number | null;
}

export interface EditorActions {
  setActiveLayer: (index: number) => void;
  selectKey: (index: number | null) => void;
  setKeyBehavior: (layerIndex: number, keyIndex: number, tap: Behavior, hold: Behavior | null) => void;
  addLayer: (name: string) => void;
  removeLayer: (index: number) => void;
  renameLayer: (index: number, name: string) => void;
  loadConfig: (json: unknown) => void;
}

export type EditorStore = EditorState & EditorActions;

function createDefaultConfig(): KeyboardConfig {
  return {
    name: "My Glove80 Layout",
    version: 1 as const,
    layers: [
      {
        id: randomUUID(),
        name: "Base",
        keys: Array.from({ length: GLOVE80_KEY_COUNT }, () => ({ ...DEFAULT_KEY })),
      },
    ],
  };
}

export function createEditorStore() {
  return createStore<EditorStore>()(
    immer((set) => ({
      config: createDefaultConfig(),
      activeLayerIndex: 0,
      selectedKeyIndex: null,

      setActiveLayer: (_index) => {},
      selectKey: (_index) => {},
      setKeyBehavior: (_li, _ki, _tap, _hold) => {},
      addLayer: (_name) => {},
      removeLayer: (_index) => {},
      renameLayer: (_index, _name) => {},
      loadConfig: (_json) => {},
    }))
  );
}
```

Note: Actions are stubs for now. They'll be implemented in subsequent tasks.

Note: `KeyboardConfigSchema` is imported but unused in this task — it will be used by `loadConfig` in Task 6. If the linter complains, remove it and re-add later.

**Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/store.test.ts`
Expected: PASS (7 tests)

**Step 5: Commit**

```bash
git add lib/store.ts lib/store.test.ts
git commit -m "feat: add Zustand store skeleton with initial state"
```

---

### Task 3: UI state actions (setActiveLayer, selectKey, renameLayer)

**Files:**
- Modify: `lib/store.test.ts`
- Modify: `lib/store.ts`

**Step 1: Write the failing tests**

Append to `lib/store.test.ts`:

```ts
describe("setActiveLayer", () => {
  let store: ReturnType<typeof createEditorStore>;

  beforeEach(() => {
    store = createEditorStore();
    // Add a second layer so we can switch
    store.getState().addLayer("Lower");
  });

  it("changes activeLayerIndex", () => {
    store.getState().setActiveLayer(1);
    expect(store.getState().activeLayerIndex).toBe(1);
  });

  it("can switch back to 0", () => {
    store.getState().setActiveLayer(1);
    store.getState().setActiveLayer(0);
    expect(store.getState().activeLayerIndex).toBe(0);
  });
});

describe("selectKey", () => {
  let store: ReturnType<typeof createEditorStore>;

  beforeEach(() => {
    store = createEditorStore();
  });

  it("selects a key by index", () => {
    store.getState().selectKey(42);
    expect(store.getState().selectedKeyIndex).toBe(42);
  });

  it("deselects with null", () => {
    store.getState().selectKey(42);
    store.getState().selectKey(null);
    expect(store.getState().selectedKeyIndex).toBeNull();
  });
});

describe("renameLayer", () => {
  let store: ReturnType<typeof createEditorStore>;

  beforeEach(() => {
    store = createEditorStore();
  });

  it("changes layer name", () => {
    store.getState().renameLayer(0, "QWERTY");
    expect(store.getState().config.layers[0]!.name).toBe("QWERTY");
  });

  it("does not affect other layers", () => {
    store.getState().addLayer("Lower");
    store.getState().renameLayer(1, "Symbols");
    expect(store.getState().config.layers[0]!.name).toBe("Base");
    expect(store.getState().config.layers[1]!.name).toBe("Symbols");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/store.test.ts`
Expected: FAIL — actions are stubs (setActiveLayer does nothing, etc.)

**Step 3: Implement the actions**

In `lib/store.ts`, replace the stubs for these actions:

```ts
setActiveLayer: (index) =>
  set((state) => {
    state.activeLayerIndex = index;
  }),

selectKey: (index) =>
  set((state) => {
    state.selectedKeyIndex = index;
  }),

renameLayer: (index, name) =>
  set((state) => {
    state.config.layers[index]!.name = name;
  }),
```

Also implement `addLayer` (needed by setActiveLayer tests and will be fully tested in Task 5):

```ts
addLayer: (name) =>
  set((state) => {
    state.config.layers.push({
      id: randomUUID(),
      name,
      keys: Array.from({ length: GLOVE80_KEY_COUNT }, () => ({ ...DEFAULT_KEY })),
    });
  }),
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/store.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/store.ts lib/store.test.ts
git commit -m "feat: add setActiveLayer, selectKey, renameLayer actions"
```

---

### Task 4: setKeyBehavior

**Files:**
- Modify: `lib/store.test.ts`
- Modify: `lib/store.ts`

**Step 1: Write the failing tests**

Append to `lib/store.test.ts`:

```ts
describe("setKeyBehavior", () => {
  let store: ReturnType<typeof createEditorStore>;

  beforeEach(() => {
    store = createEditorStore();
  });

  it("updates tap behavior", () => {
    store.getState().setKeyBehavior(0, 5, { type: "kp", keyCode: "A" }, null);
    const key = store.getState().config.layers[0]!.keys[5]!;
    expect(key.tap).toEqual({ type: "kp", keyCode: "A" });
    expect(key.hold).toBeNull();
  });

  it("updates hold behavior", () => {
    store.getState().setKeyBehavior(0, 10, { type: "kp", keyCode: "A" }, { type: "mo", layerIndex: 1 });
    const key = store.getState().config.layers[0]!.keys[10]!;
    expect(key.hold).toEqual({ type: "mo", layerIndex: 1 });
  });

  it("clears hold with null", () => {
    store.getState().setKeyBehavior(0, 0, { type: "kp", keyCode: "A" }, { type: "kp", keyCode: "LSHIFT" });
    store.getState().setKeyBehavior(0, 0, { type: "kp", keyCode: "A" }, null);
    expect(store.getState().config.layers[0]!.keys[0]!.hold).toBeNull();
  });

  it("does not affect other keys", () => {
    store.getState().setKeyBehavior(0, 5, { type: "kp", keyCode: "A" }, null);
    const otherKey = store.getState().config.layers[0]!.keys[6]!;
    expect(otherKey.tap).toEqual({ type: "trans" });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/store.test.ts`
Expected: FAIL — setKeyBehavior is a stub

**Step 3: Implement setKeyBehavior**

In `lib/store.ts`, replace the stub:

```ts
setKeyBehavior: (layerIndex, keyIndex, tap, hold) =>
  set((state) => {
    state.config.layers[layerIndex]!.keys[keyIndex] = { tap, hold };
  }),
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/store.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/store.ts lib/store.test.ts
git commit -m "feat: add setKeyBehavior action"
```

---

### Task 5: addLayer and removeLayer

**Files:**
- Modify: `lib/store.test.ts`
- Modify: `lib/store.ts`

`addLayer` was already implemented in Task 3 (needed as a dependency). This task adds its tests and implements `removeLayer`.

**Step 1: Write the failing tests**

Append to `lib/store.test.ts`:

```ts
describe("addLayer", () => {
  let store: ReturnType<typeof createEditorStore>;

  beforeEach(() => {
    store = createEditorStore();
  });

  it("appends a new layer", () => {
    store.getState().addLayer("Lower");
    expect(store.getState().config.layers).toHaveLength(2);
    expect(store.getState().config.layers[1]!.name).toBe("Lower");
  });

  it("new layer has 80 default keys", () => {
    store.getState().addLayer("Lower");
    const layer = store.getState().config.layers[1]!;
    expect(layer.keys).toHaveLength(80);
    expect(layer.keys[0]!.tap).toEqual({ type: "trans" });
    expect(layer.keys[0]!.hold).toBeNull();
  });

  it("new layer has a UUID id", () => {
    store.getState().addLayer("Lower");
    expect(store.getState().config.layers[1]!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });
});

describe("removeLayer", () => {
  let store: ReturnType<typeof createEditorStore>;

  beforeEach(() => {
    store = createEditorStore();
    store.getState().addLayer("Lower");
    store.getState().addLayer("Raise");
    // 3 layers: Base(0), Lower(1), Raise(2)
  });

  it("removes the layer at index", () => {
    store.getState().removeLayer(1);
    expect(store.getState().config.layers).toHaveLength(2);
    expect(store.getState().config.layers[1]!.name).toBe("Raise");
  });

  it("does not remove the last layer", () => {
    store.getState().removeLayer(2);
    store.getState().removeLayer(1);
    store.getState().removeLayer(0); // no-op: can't remove last layer
    expect(store.getState().config.layers).toHaveLength(1);
  });

  it("adjusts activeLayerIndex when removing before active", () => {
    store.getState().setActiveLayer(2);
    store.getState().removeLayer(0);
    expect(store.getState().activeLayerIndex).toBe(1);
  });

  it("adjusts activeLayerIndex when removing active layer", () => {
    store.getState().setActiveLayer(2);
    store.getState().removeLayer(2);
    expect(store.getState().activeLayerIndex).toBe(1);
  });

  it("does not change activeLayerIndex when removing after active", () => {
    store.getState().setActiveLayer(0);
    store.getState().removeLayer(2);
    expect(store.getState().activeLayerIndex).toBe(0);
  });

  it("resets selectedKeyIndex to null", () => {
    store.getState().selectKey(42);
    store.getState().removeLayer(1);
    expect(store.getState().selectedKeyIndex).toBeNull();
  });
});
```

**Step 2: Run tests to verify removeLayer tests fail**

Run: `npx vitest run lib/store.test.ts`
Expected: addLayer tests PASS (already implemented), removeLayer tests FAIL (stub)

**Step 3: Implement removeLayer**

In `lib/store.ts`, replace the stub:

```ts
removeLayer: (index) =>
  set((state) => {
    if (state.config.layers.length <= 1) return;
    state.config.layers.splice(index, 1);
    if (index < state.activeLayerIndex) {
      state.activeLayerIndex--;
    } else if (state.activeLayerIndex >= state.config.layers.length) {
      state.activeLayerIndex = state.config.layers.length - 1;
    }
    state.selectedKeyIndex = null;
  }),
```

Logic:
- Guard: never remove the last layer (`layers.min(1)` in schema)
- If removing a layer before the active one: decrement `activeLayerIndex` (layers shifted down)
- If active layer is now out of bounds (was last): clamp to new last index
- Otherwise: no change (removing after active, or active slides into the vacated slot)
- Always reset `selectedKeyIndex` to null

**Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/store.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/store.ts lib/store.test.ts
git commit -m "feat: add addLayer and removeLayer with index adjustment"
```

---

### Task 6: loadConfig with Zod validation

**Files:**
- Modify: `lib/store.test.ts`
- Modify: `lib/store.ts`

**Step 1: Write the failing tests**

Append to `lib/store.test.ts`. Add `import { randomUUID } from "crypto";` at the top of the file.

```ts
describe("loadConfig", () => {
  let store: ReturnType<typeof createEditorStore>;

  beforeEach(() => {
    store = createEditorStore();
  });

  it("loads a valid config", () => {
    const newConfig = {
      name: "Test Layout",
      version: 1,
      layers: [
        {
          id: randomUUID(),
          name: "Custom",
          keys: Array.from({ length: 80 }, () => ({
            tap: { type: "kp" as const, keyCode: "B" },
            hold: null,
          })),
        },
      ],
    };
    store.getState().loadConfig(newConfig);
    expect(store.getState().config.layers[0]!.name).toBe("Custom");
    expect(store.getState().config.layers[0]!.keys[0]!.tap).toEqual({ type: "kp", keyCode: "B" });
  });

  it("resets UI state on load", () => {
    store.getState().addLayer("Lower");
    store.getState().setActiveLayer(1);
    store.getState().selectKey(42);

    const newConfig = {
      name: "Test",
      version: 1,
      layers: [{
        id: randomUUID(),
        name: "Fresh",
        keys: Array.from({ length: 80 }, () => ({
          tap: { type: "trans" as const },
          hold: null,
        })),
      }],
    };
    store.getState().loadConfig(newConfig);
    expect(store.getState().activeLayerIndex).toBe(0);
    expect(store.getState().selectedKeyIndex).toBeNull();
  });

  it("throws on invalid config", () => {
    expect(() => store.getState().loadConfig({ bad: "data" })).toThrow();
  });

  it("does not modify state on invalid config", () => {
    const originalName = store.getState().config.layers[0]!.name;
    try {
      store.getState().loadConfig({ bad: "data" });
    } catch {
      // expected
    }
    expect(store.getState().config.layers[0]!.name).toBe(originalName);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/store.test.ts`
Expected: FAIL — loadConfig is a stub

**Step 3: Implement loadConfig**

In `lib/store.ts`, ensure `KeyboardConfigSchema` is imported from `../types/schema`, then replace the stub:

```ts
loadConfig: (json) => {
  const result = KeyboardConfigSchema.safeParse(json);
  if (!result.success) {
    throw new Error(`Invalid config: ${result.error.message}`);
  }
  set((state) => {
    state.config = result.data;
    state.activeLayerIndex = 0;
    state.selectedKeyIndex = null;
  });
},
```

Key design decisions:
- Validates BEFORE calling `set` — if validation fails, state is untouched
- Throws on invalid input (UI will catch errors)
- Resets both `activeLayerIndex` and `selectedKeyIndex` (new config = fresh start)

**Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/store.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/store.ts lib/store.test.ts
git commit -m "feat: add loadConfig with Zod validation"
```

---

### Task 7: Undo/redo with zundo temporal middleware

**Files:**
- Modify: `lib/store.test.ts`
- Modify: `lib/store.ts`

This task wraps the store with zundo's `temporal` middleware. Key design:
- `partialize` extracts all state fields (excluding action functions) for the undo stack
- `equality` compares config references — only config mutations create undo entries
- UI-only changes (switching layers, selecting keys) don't create undo entries
- On undo, the full state snapshot (config + UI state at time of config change) is restored

**Step 1: Write the failing tests**

Append to `lib/store.test.ts`:

```ts
describe("undo/redo", () => {
  let store: ReturnType<typeof createEditorStore>;

  beforeEach(() => {
    store = createEditorStore();
  });

  it("undoes a key behavior change", () => {
    store.getState().setKeyBehavior(0, 0, { type: "kp", keyCode: "A" }, null);
    expect(store.getState().config.layers[0]!.keys[0]!.tap).toEqual({ type: "kp", keyCode: "A" });

    store.temporal.getState().undo();
    expect(store.getState().config.layers[0]!.keys[0]!.tap).toEqual({ type: "trans" });
  });

  it("redoes an undone change", () => {
    store.getState().setKeyBehavior(0, 0, { type: "kp", keyCode: "A" }, null);
    store.temporal.getState().undo();
    store.temporal.getState().redo();
    expect(store.getState().config.layers[0]!.keys[0]!.tap).toEqual({ type: "kp", keyCode: "A" });
  });

  it("does not track UI-only state changes", () => {
    // Make a config change first
    store.getState().setKeyBehavior(0, 0, { type: "kp", keyCode: "A" }, null);

    // Make UI-only changes (should not create undo entries)
    store.getState().selectKey(42);
    store.getState().setActiveLayer(0);

    // Undo should undo the key behavior change, not the UI changes
    store.temporal.getState().undo();
    expect(store.getState().config.layers[0]!.keys[0]!.tap).toEqual({ type: "trans" });
  });

  it("undoes addLayer", () => {
    store.getState().addLayer("Lower");
    expect(store.getState().config.layers).toHaveLength(2);

    store.temporal.getState().undo();
    expect(store.getState().config.layers).toHaveLength(1);
  });

  it("undoes removeLayer", () => {
    store.getState().addLayer("Lower");
    store.getState().removeLayer(1);
    expect(store.getState().config.layers).toHaveLength(1);

    store.temporal.getState().undo();
    expect(store.getState().config.layers).toHaveLength(2);
    expect(store.getState().config.layers[1]!.name).toBe("Lower");
  });

  it("undoes renameLayer", () => {
    store.getState().renameLayer(0, "QWERTY");
    store.temporal.getState().undo();
    expect(store.getState().config.layers[0]!.name).toBe("Base");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/store.test.ts`
Expected: FAIL — `store.temporal` is undefined (temporal middleware not added yet)

**Step 3: Add temporal middleware**

In `lib/store.ts`, add the import and wrap the store:

```ts
import { temporal } from "zundo";
```

Change `createEditorStore`:

```ts
export function createEditorStore() {
  return createStore<EditorStore>()(
    temporal(
      immer((set) => ({
        // ... all existing state + actions unchanged
      })),
      {
        partialize: (state) => {
          const { config, activeLayerIndex, selectedKeyIndex } = state;
          return { config, activeLayerIndex, selectedKeyIndex };
        },
        equality: (pastState, currentState) =>
          pastState.config === currentState.config,
      }
    )
  );
}
```

Explanation of the options:
- `partialize`: Extracts state fields only (excludes action functions from undo stack). This is what gets stored/restored.
- `equality`: Compares config by reference. Since immer only creates a new config reference when config is actually mutated, UI-only changes (same config reference) won't create undo entries. Config mutations (new reference) will.
- On undo: the partialized state (config + activeLayerIndex + selectedKeyIndex) from the snapshot is restored via zustand's `set()` (shallow merge), so it replaces these three fields.

**Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/store.test.ts`
Expected: PASS

**Troubleshooting**: If TypeScript has trouble inferring the middleware composition types, try explicit type annotation:

```ts
export function createEditorStore() {
  return createStore(
    temporal(
      immer<EditorStore>((set) => ({
        // ...
      })),
      {
        partialize: (state: EditorStore) => {
          const { config, activeLayerIndex, selectedKeyIndex } = state;
          return { config, activeLayerIndex, selectedKeyIndex };
        },
        equality: (
          pastState: Pick<EditorState, "config">,
          currentState: Pick<EditorState, "config">
        ) => pastState.config === currentState.config,
      }
    )
  );
}
```

**Step 5: Commit**

```bash
git add lib/store.ts lib/store.test.ts
git commit -m "feat: add undo/redo with zundo temporal middleware"
```

---

### Task 8: Final verification

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: ALL tests pass (store tests + existing generator tests)

**Step 2: Type check**

Run: `npx tsc --noEmit --project tsconfig.json`
Expected: No errors

**Step 3: Review test count**

Verify we have a reasonable number of store tests (expect ~25-30 tests across all describe blocks).

**Step 4: Commit (if any final fixes needed)**

Only if adjustments were made. Otherwise, no commit needed.
