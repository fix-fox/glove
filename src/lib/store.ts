import { createStore, useStore } from "zustand";
import { immer } from "zustand/middleware/immer";
import { temporal } from "zundo";
import type { Behavior, KeyboardConfig, MouseSettings } from "../types/schema";
import { DEFAULT_KEY, GLOVE80_KEY_COUNT, KeyboardConfigSchema } from "../types/schema";
import { migrateConfig } from "./migrations";

export interface EditorState {
  config: KeyboardConfig;
  activeLayerIndex: number;
  selectedKeyIndex: number | null;
  isDirty: boolean;
}

export interface EditorActions {
  setActiveLayer: (index: number) => void;
  selectKey: (index: number | null) => void;
  setKeyBehavior: (layerIndex: number, keyIndex: number, tap: Behavior, hold: Behavior | null) => void;
  addLayer: (name: string) => void;
  removeLayer: (index: number) => void;
  renameLayer: (index: number, name: string) => void;
  loadConfig: (json: unknown) => void;
  patchConfig: (patch: Partial<Pick<KeyboardConfig, "macros" | "modMorphs" | "holdTaps" | "combos" | "conditionalLayers" | "hrmSettings" | "ltSettings" | "mouseSettings" | "layers">>) => void;
  markClean: () => void;
}

export type EditorStore = EditorState & EditorActions;

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
        isDirty: false,

        setActiveLayer: (index) => set((state) => { state.activeLayerIndex = index; }),
        selectKey: (index) => set((state) => { state.selectedKeyIndex = index; }),
        setKeyBehavior: (layerIndex, keyIndex, tap, hold) => set((state) => {
          state.config.layers[layerIndex]!.keys[keyIndex] = { tap, hold };
          state.isDirty = true;
        }),
        addLayer: (name) => set((state) => {
          state.config.layers.push({
            id: crypto.randomUUID(),
            name,
            keys: Array.from({ length: GLOVE80_KEY_COUNT }, () => ({ ...DEFAULT_KEY })),
          });
          state.isDirty = true;
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
          state.isDirty = true;
        }),
        renameLayer: (index, name) => set((state) => { state.config.layers[index]!.name = name; state.isDirty = true; }),
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
          migrateConfig(data);
          set((state) => {
            state.config = data;
            state.activeLayerIndex = 0;
            state.selectedKeyIndex = null;
            state.isDirty = false;
          });
        },
        patchConfig: (patch) => set((state) => {
          Object.assign(state.config, patch);
          state.isDirty = true;
        }),
        markClean: () => set((state) => { state.isDirty = false; }),
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
