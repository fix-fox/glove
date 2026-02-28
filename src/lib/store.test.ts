import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { createEditorStore } from "./store";
import { DEFAULT_KEY } from "../types/schema";

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

  it("all keys default to kp A / null", () => {
    const { config } = store.getState();
    for (const key of config.layers[0]!.keys) {
      expect(key.tap).toEqual(DEFAULT_KEY.tap);
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

describe("setActiveLayer", () => {
  let store: ReturnType<typeof createEditorStore>;
  beforeEach(() => {
    store = createEditorStore();
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
  beforeEach(() => { store = createEditorStore(); });

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
  beforeEach(() => { store = createEditorStore(); });

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

describe("setKeyBehavior", () => {
  let store: ReturnType<typeof createEditorStore>;
  beforeEach(() => { store = createEditorStore(); });

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
    expect(otherKey.tap).toEqual(DEFAULT_KEY.tap);
  });
});

describe("addLayer", () => {
  let store: ReturnType<typeof createEditorStore>;
  beforeEach(() => { store = createEditorStore(); });

  it("appends a new layer", () => {
    store.getState().addLayer("Lower");
    expect(store.getState().config.layers).toHaveLength(2);
    expect(store.getState().config.layers[1]!.name).toBe("Lower");
  });

  it("new layer has 80 default keys", () => {
    store.getState().addLayer("Lower");
    const layer = store.getState().config.layers[1]!;
    expect(layer.keys).toHaveLength(80);
    expect(layer.keys[0]!.tap).toEqual(DEFAULT_KEY.tap);
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
    store.getState().removeLayer(0);
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

describe("loadConfig", () => {
  let store: ReturnType<typeof createEditorStore>;
  beforeEach(() => { store = createEditorStore(); });

  it("loads a valid config", () => {
    const newConfig = {
      name: "Test Layout",
      version: 1,
      layers: [{
        id: randomUUID(),
        name: "Custom",
        keys: Array.from({ length: 80 }, () => ({
          tap: { type: "kp" as const, keyCode: "B" },
          hold: null,
        })),
      }],
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
        keys: Array.from({ length: 80 }, () => ({ tap: { type: "trans" as const }, hold: null })),
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
    try { store.getState().loadConfig({ bad: "data" }); } catch { /* expected */ }
    expect(store.getState().config.layers[0]!.name).toBe(originalName);
  });
});

describe("undo/redo", () => {
  let store: ReturnType<typeof createEditorStore>;

  beforeEach(() => {
    store = createEditorStore();
  });

  it("undoes a key behavior change", () => {
    store.getState().setKeyBehavior(0, 0, { type: "kp", keyCode: "Z" }, null);
    expect(store.getState().config.layers[0]!.keys[0]!.tap).toEqual({ type: "kp", keyCode: "Z" });

    store.temporal.getState().undo();
    expect(store.getState().config.layers[0]!.keys[0]!.tap).toEqual(DEFAULT_KEY.tap);
  });

  it("redoes an undone change", () => {
    store.getState().setKeyBehavior(0, 0, { type: "kp", keyCode: "Z" }, null);
    store.temporal.getState().undo();
    store.temporal.getState().redo();
    expect(store.getState().config.layers[0]!.keys[0]!.tap).toEqual({ type: "kp", keyCode: "Z" });
  });

  it("does not track UI-only state changes", () => {
    // Make a config change first
    store.getState().setKeyBehavior(0, 0, { type: "kp", keyCode: "Z" }, null);

    // Make UI-only changes (should not create undo entries)
    store.getState().selectKey(42);
    store.getState().setActiveLayer(0);

    // Undo should undo the key behavior change, not the UI changes
    store.temporal.getState().undo();
    expect(store.getState().config.layers[0]!.keys[0]!.tap).toEqual(DEFAULT_KEY.tap);
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
