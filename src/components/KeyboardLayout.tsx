"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { GLOVE80_GRID, GRID_COLS } from "@/lib/layout-map";
import { editorStore, useEditorStore } from "@/lib/store";
import { behaviorLabel, holdTapSecondaryLabel } from "@/lib/labels";
import { isMagicPosition } from "@/lib/magic";
import { KeyCap } from "./KeyCap";
import type { DragHighlight } from "./KeyCap";
import { useShallow } from "zustand/shallow";

type DragMode = "move" | "copy" | "swap";

interface DragState {
  sourceIndex: number;
  targetIndex: number | null;
  mode: DragMode;
}

function modeFromEvent(e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): DragMode {
  if (e.shiftKey) return "swap";
  if (e.ctrlKey || e.metaKey) return "copy";
  return "move";
}

export function KeyboardLayout() {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const dragStateRef = useRef<DragState | null>(null);

  // Keep ref in sync for event handlers that capture stale closures
  dragStateRef.current = dragState;

  const layerNames = useEditorStore(useShallow((s) => s.config.layers.map((l) => l.name)));
  const modMorphs = useEditorStore((s) => s.config.modMorphs ?? []);
  const holdTaps = useEditorStore((s) => s.config.holdTaps ?? []);
  const activeLayerIndex = useEditorStore((s) => s.activeLayerIndex);
  const keys = useEditorStore((s) => s.config.layers[s.activeLayerIndex]?.keys);

  // ── Handlers ──────────────────────────────────────────────────────────

  const handleDragStart = useCallback((index: number) => {
    // Close key editor (commits current edits)
    editorStore.getState().selectKey(null);
    setDragState({ sourceIndex: index, targetIndex: null, mode: "move" });
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragState(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, targetIndex: number) => {
    // Skip magic positions on layer 0
    if (editorStore.getState().activeLayerIndex === 0 && isMagicPosition(targetIndex)) return;

    e.preventDefault();

    const mode = modeFromEvent(e);
    e.dataTransfer.dropEffect = mode === "copy" ? "copy" : mode === "swap" ? "link" : "move";

    setDragState((prev) => {
      if (!prev) return prev;
      if (prev.sourceIndex === targetIndex) {
        // Hovering source — clear target
        if (prev.targetIndex === null && prev.mode === mode) return prev;
        return { ...prev, targetIndex: null, mode };
      }
      if (prev.targetIndex === targetIndex && prev.mode === mode) return prev;
      return { ...prev, targetIndex: targetIndex, mode };
    });
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const ds = dragStateRef.current;
    if (!ds) return;
    if (ds.sourceIndex === targetIndex) return;
    if (editorStore.getState().activeLayerIndex === 0 && isMagicPosition(targetIndex)) return;

    const mode = modeFromEvent(e);
    const store = editorStore.getState();
    store.applyDragDrop(store.activeLayerIndex, ds.sourceIndex, targetIndex, mode);
    setDragState(null);
  }, []);

  // ── Modifier tracking during drag ─────────────────────────────────────

  useEffect(() => {
    if (!dragState) return;

    const updateMode = (e: KeyboardEvent) => {
      const mode = modeFromEvent(e);
      setDragState((prev) => {
        if (!prev || prev.mode === mode) return prev;
        return { ...prev, mode };
      });
    };

    document.addEventListener("keydown", updateMode);
    document.addEventListener("keyup", updateMode);
    return () => {
      document.removeEventListener("keydown", updateMode);
      document.removeEventListener("keyup", updateMode);
    };
  }, [dragState !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Preview labels ────────────────────────────────────────────────────

  function getLabels(keyIndex: number): { tap: string; hold: string } {
    const key = keys?.[keyIndex];
    if (!key) return { tap: "", hold: "" };
    const tap = behaviorLabel(key.tap, layerNames, modMorphs, holdTaps);
    let hold = key.hold ? behaviorLabel(key.hold, layerNames) : "";
    if (!hold && key.tap.type === "hold_tap") {
      hold = holdTapSecondaryLabel(key.tap.name, key.tap.param1);
    }
    return { tap, hold };
  }

  // Compute per-key overrides
  type PreviewEntry = { dragHighlight: DragHighlight; previewTap: string | null; previewHold: string | null };

  const previews = new Map<number, PreviewEntry>();
  if (dragState) {
    const src = dragState.sourceIndex;
    const tgt = dragState.targetIndex;
    const mode = dragState.mode;

    const srcLabels = getLabels(src);
    const tgtLabels = tgt !== null ? getLabels(tgt) : null;

    if (mode === "move") {
      previews.set(src, {
        dragHighlight: "source-move",
        previewTap: tgt !== null ? "" : null,
        previewHold: tgt !== null ? "" : null,
      });
      if (tgt !== null && tgtLabels) {
        previews.set(tgt, {
          dragHighlight: "target",
          previewTap: srcLabels.tap,
          previewHold: srcLabels.hold,
        });
      }
    } else if (mode === "copy") {
      // Source has no highlight change during copy — it stays in place
      previews.set(src, { dragHighlight: "source-move", previewTap: null, previewHold: null });
      if (tgt !== null && tgtLabels) {
        previews.set(tgt, {
          dragHighlight: "target",
          previewTap: srcLabels.tap,
          previewHold: srcLabels.hold,
        });
      }
    } else {
      // swap
      previews.set(src, {
        dragHighlight: "source-swap",
        previewTap: tgt !== null && tgtLabels ? tgtLabels.tap : null,
        previewHold: tgt !== null && tgtLabels ? tgtLabels.hold : null,
      });
      if (tgt !== null && tgtLabels) {
        previews.set(tgt, {
          dragHighlight: "target",
          previewTap: srcLabels.tap,
          previewHold: srcLabels.hold,
        });
      }
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div
      className="grid gap-1 w-full max-w-5xl mx-auto"
      style={{
        gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
        gridAutoRows: "minmax(48px, auto)",
      }}
    >
      {GLOVE80_GRID.flatMap((row, rowIdx) =>
        row.map((keyIndex, colIdx) => {
          if (keyIndex === null) {
            return <div key={`empty-${rowIdx}-${colIdx}`} />;
          }

          const preview = previews.get(keyIndex);

          return (
            <div
              key={keyIndex}
              onDragOver={(e) => handleDragOver(e, keyIndex)}
              onDrop={(e) => handleDrop(e, keyIndex)}
            >
              <KeyCap
                index={keyIndex}
                dragHighlight={preview?.dragHighlight ?? null}
                previewTapLabel={preview?.previewTap ?? null}
                previewHoldLabel={preview?.previewHold ?? null}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              />
            </div>
          );
        })
      )}
    </div>
  );
}
