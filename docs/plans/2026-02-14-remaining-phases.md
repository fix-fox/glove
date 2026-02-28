# Remaining Phases — Glove80 Configurator

## Completed

- **Phase 1: Domain Model** — `types/schema.ts` with Zod schemas (Behavior, Key, Layer, KeyboardConfig)
- **Phase 2: ZMK Generator** — `lib/generator.ts` with `generateKeymap()`, semantic validation, 41 tests

## Phase 3: Zustand Store

**Goal:** App state management for the keyboard config with undo/redo.

**Tech:** Zustand with immer middleware for immutable updates, `temporal` middleware for undo/redo.

**File:** `lib/store.ts`

**State shape:**
```ts
{
  config: KeyboardConfig,       // the root config
  activeLayerIndex: number,     // which layer is being edited
  selectedKeyIndex: number | null,  // which key is selected (null = none)
}
```

**Actions:**
- `setKeyBehavior(layerIndex, keyIndex, tap, hold)` — update a key's bindings
- `addLayer(name)` — append a new layer (80 DEFAULT_KEYs)
- `removeLayer(index)` — delete a layer (warn about index invalidation)
- `renameLayer(index, name)` — change layer name
- `setActiveLayer(index)` — switch the visible layer
- `selectKey(index | null)` — select/deselect a key
- `loadConfig(json)` — parse and load a JSON config
- `undo()` / `redo()` — temporal middleware

**Init:** Create a default config with one "Base" layer of 80 `DEFAULT_KEY`s.

**Tests:** Vitest, test each action in isolation.

**Dependencies:** `npm install zustand immer zundo`

---

## Phase 4: UI — Keyboard Layout

**Goal:** Render the Glove80's 80 keys visually in the browser, reflecting the physical split layout.

**Tech:** Next.js app router, Tailwind CSS, ShadCN components.

**Scaffold:** `npx create-next-app@latest` with TypeScript, Tailwind, App Router. Move existing `types/` and `lib/` into the Next.js structure.

**Key files:**
- `app/page.tsx` — main editor page
- `components/KeyboardLayout.tsx` — renders the 80-key grid
- `components/KeyCap.tsx` — single key visual (shows behavior label, highlights on select)
- `lib/layout-map.ts` — maps key index (0-79) to `{x, y, rotation}` coordinates for CSS positioning

**Layout map:**
Use the physical layout from the Glove80 (6 rows, split halves, thumb clusters). Each key gets absolute CSS positioning based on the layout map. The layout map is a static constant — it never changes.

```ts
// layout-map.ts
export const GLOVE80_LAYOUT: { x: number; y: number; r?: number; w?: number; h?: number }[] = [
  // 80 entries mapping index to physical position
  // Derived from the official Glove80 layout editor data
];
```

**KeyCap rendering:**
- Show abbreviated behavior label (e.g., "A", "MO 1", "BT", "BOOT")
- Highlight selected key (border color change)
- Click to select (`store.selectKey(index)`)
- Show hold behavior as small sub-label if present

**Layer tabs:**
- Tab bar above the layout showing layer names
- Click to switch active layer
- Add/remove layer buttons

---

## Phase 5: UI — Key Editor

**Goal:** Panel to edit the selected key's tap and hold behaviors.

**Tech:** ShadCN form components (Select, Input, Dialog).

**Key files:**
- `components/KeyEditor.tsx` — the editor panel (sidebar or bottom drawer)
- `components/BehaviorPicker.tsx` — dropdown/picker to choose behavior type + params

**BehaviorPicker flow:**
1. Select behavior type from dropdown: kp, mo, to, sl, trans, none, bootloader, sys_reset, bt
2. Based on type, show param inputs:
   - `kp` → key code search/select (text input with autocomplete from ZMK key codes)
   - `mo/to/sl` → layer index dropdown (populated from current layers)
   - `bt` → action dropdown (BT_SEL, BT_CLR, BT_NXT, BT_PRV) + optional profile index
   - `trans/none/bootloader/sys_reset` → no params
3. Optional: hold behavior picker (same component, shown below tap)

**Key code list:**
- `lib/keycodes.ts` — export a `ZMK_KEYCODES` array of `{ code: string, label: string, category: string }`
- Categories: Letters, Numbers, Modifiers, Navigation, Function, Media, Symbols
- Used for autocomplete/search in the key code picker

**Validation:**
- Run `validateConfig` on every change
- Show validation errors inline (red border on affected keys, tooltip with error message)
- Disable "Export" button when errors exist

---

## Phase 6: Save/Load & Export

**Goal:** Persist configs, import/export JSON, export .keymap.

**Key files:**
- `components/ExportDialog.tsx` — dialog showing generated .keymap with copy button
- `lib/storage.ts` — localStorage persistence for the config

**Features:**
- **Auto-save:** Debounced save to localStorage on every store change
- **Export .keymap:** Button opens dialog, runs `generateKeymap()`, shows result with syntax highlighting and copy-to-clipboard
- **Export JSON:** Download the `KeyboardConfig` as a `.json` file
- **Import JSON:** File picker to load a `.json` config (validates with Zod schema before loading)
- **New config:** Reset to default config

**No GitHub integration in this phase** — that's a future phase requiring OAuth, repo selection, and commit workflows. For now, users copy the .keymap output and manually commit it to their `glove80-zmk-config` repo.

---

## Implementation Order & Dependencies

```
Phase 3 (Store) ← no UI dependency, can test in isolation
Phase 4 (Layout UI) ← needs Phase 3 for state
Phase 5 (Key Editor) ← needs Phase 4 for key selection
Phase 6 (Save/Load) ← needs Phase 3 for store, Phase 2 for export
```

Phases 3 and 6 (store logic) could be developed in parallel with Phase 4 (visual layout), but Phase 5 depends on both.

## Tech Setup Notes

- Phase 4 requires scaffolding with Next.js. This will restructure the project.
- Current `types/schema.ts` and `lib/generator.ts` move into the Next.js `src/` directory.
- Vitest config needs adjustment after Next.js scaffold (may switch to vitest with next.js plugin or keep separate).
- ShadCN init: `npx shadcn-ui@latest init` after Next.js is set up.
