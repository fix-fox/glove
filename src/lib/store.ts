import { createStore, useStore } from "zustand";
import { immer } from "zustand/middleware/immer";
import { temporal } from "zundo";
import type { Behavior, KeyboardConfig, MouseSettings } from "../types/schema";
import { DEFAULT_KEY, DEFAULT_MOUSE_SETTINGS, GLOVE80_KEY_COUNT, KeyboardConfigSchema } from "../types/schema";

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
  patchConfig: (patch: Partial<Pick<KeyboardConfig, "macros" | "modMorphs" | "holdTaps" | "combos" | "conditionalLayers" | "hrmSettings" | "mouseSettings" | "layers">>) => void;
}

export type EditorStore = EditorState & EditorActions;

/**
 * Migrate raw parameterized mmv directions (e.g. "MOVE_Y(-300)") to the
 * structured { direction, precision } form. Returns the extracted speed
 * if any raw values were found, or undefined if no migration was needed.
 */
const RAW_MMV_PATTERN = /^MOVE_([XY])\((-?\d+)\)$/;
const RAW_TO_DIRECTION: Record<string, string> = {
  "Y_neg": "MOVE_UP",
  "Y_pos": "MOVE_DOWN",
  "X_neg": "MOVE_LEFT",
  "X_pos": "MOVE_RIGHT",
};

function migrateRawMmv(config: KeyboardConfig): void {
  let detectedSpeed: number | undefined;
  for (const layer of config.layers) {
    for (const key of layer.keys) {
      for (const side of [key.tap, key.hold] as (Behavior | null)[]) {
        if (!side || side.type !== "mmv") continue;
        const m = RAW_MMV_PATTERN.exec(side.direction);
        if (!m) continue;
        const axis = m[1]!;
        const value = parseInt(m[2]!, 10);
        const sign = value < 0 ? "neg" : "pos";
        const mapped = RAW_TO_DIRECTION[`${axis}_${sign}`];
        if (mapped) {
          side.direction = mapped;
          side.precision = true;
          detectedSpeed = Math.abs(value);
        }
      }
    }
  }
  if (detectedSpeed !== undefined && !config.mouseSettings) {
    config.mouseSettings = {
      normalSpeed: DEFAULT_MOUSE_SETTINGS.normalSpeed,
      precisionSpeed: detectedSpeed,
    };
  }
}

function createDefaultConfig(): KeyboardConfig {
  return {
    name: "My Glove80 Layout",
    version: 1 as const,
    layers: [
      {
        id: crypto.randomUUID(),
        name: "Base",
        keys: Array.from({ length: GLOVE80_KEY_COUNT }, () => ({ ...DEFAULT_KEY })),
      },
    ],
    macros: [],
    modMorphs: [],
    holdTaps: [],
    combos: [],
    conditionalLayers: [],
  };
}

export function createEditorStore() {
  return createStore<EditorStore>()(
    temporal(
      immer((set) => ({
        config: createDefaultConfig(),
        activeLayerIndex: 0,
        selectedKeyIndex: null,

        setActiveLayer: (index) => set((state) => { state.activeLayerIndex = index; }),
        selectKey: (index) => set((state) => { state.selectedKeyIndex = index; }),
        setKeyBehavior: (layerIndex, keyIndex, tap, hold) => set((state) => {
          state.config.layers[layerIndex]!.keys[keyIndex] = { tap, hold };
        }),
        addLayer: (name) => set((state) => {
          state.config.layers.push({
            id: crypto.randomUUID(),
            name,
            keys: Array.from({ length: GLOVE80_KEY_COUNT }, () => ({ ...DEFAULT_KEY })),
          });
        }),
        removeLayer: (index) => set((state) => {
          if (state.config.layers.length <= 1) return;
          state.config.layers.splice(index, 1);
          if (index < state.activeLayerIndex) {
            state.activeLayerIndex--;
          } else if (state.activeLayerIndex >= state.config.layers.length) {
            state.activeLayerIndex = state.config.layers.length - 1;
          }
          state.selectedKeyIndex = null;
        }),
        renameLayer: (index, name) => set((state) => { state.config.layers[index]!.name = name; }),
        loadConfig: (json) => {
          const result = KeyboardConfigSchema.safeParse(json);
          if (!result.success) {
            throw new Error(`Invalid config: ${result.error.message}`);
          }
          const data = result.data;
          // Normalize optional arrays so selectors always get a stable reference
          data.macros ??= [];
          data.modMorphs ??= [];
          data.holdTaps ??= [];
          data.combos ??= [];
          data.conditionalLayers ??= [];
          // Migrate raw parameterized mmv values to precision fields
          migrateRawMmv(data);
          set((state) => {
            state.config = data;
            state.activeLayerIndex = 0;
            state.selectedKeyIndex = null;
          });
        },
        patchConfig: (patch) => set((state) => {
          Object.assign(state.config, patch);
        }),
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

export const editorStore = createEditorStore();

export function useEditorStore<T>(selector: (s: EditorStore) => T): T {
  return useStore(editorStore, selector);
}
