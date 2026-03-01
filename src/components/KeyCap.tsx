"use client";

import { memo } from "react";
import { editorStore, useEditorStore } from "@/lib/store";
import { behaviorLabel, holdTapSecondaryLabel } from "@/lib/labels";
import { isMagicPosition } from "@/lib/magic";
import { useShallow } from "zustand/shallow";

export type DragHighlight = "source-move" | "source-swap" | "target" | null;

interface KeyCapProps {
  index: number;
  dragHighlight?: DragHighlight;
  previewTapLabel?: string | null;
  previewHoldLabel?: string | null;
  onDragStart?: (index: number) => void;
  onDragEnd?: () => void;
}

export const KeyCap = memo(function KeyCap({
  index,
  dragHighlight,
  previewTapLabel,
  previewHoldLabel,
  onDragStart,
  onDragEnd,
}: KeyCapProps) {
  const key = useEditorStore((s) => {
    const layer = s.config.layers[s.activeLayerIndex];
    return layer?.keys[index];
  });
  const isSelected = useEditorStore((s) => s.selectedKeyIndex === index);
  const layerNames = useEditorStore(useShallow((s) => s.config.layers.map((l) => l.name)));
  const modMorphs = useEditorStore((s) => s.config.modMorphs ?? []);
  const holdTaps = useEditorStore((s) => s.config.holdTaps ?? []);

  const activeLayerIndex = useEditorStore((s) => s.activeLayerIndex);

  if (activeLayerIndex === 0 && isMagicPosition(index)) {
    return (
      <div
        className="
          relative flex flex-col items-center justify-center
          rounded-md border p-0.5
          text-[11px] leading-tight h-full
          select-none
          border-gray-300 bg-gray-100 dark:border-gray-700 dark:bg-gray-800
          text-muted-foreground
        "
      >
        Magic
      </div>
    );
  }

  const tapLabel = key ? behaviorLabel(key.tap, layerNames, modMorphs, holdTaps) : "";

  // Secondary label: explicit hold behavior, or hold-side of a hold_tap tap behavior
  let holdLabel = key?.hold ? behaviorLabel(key.hold, layerNames) : "";
  if (!holdLabel && key?.tap.type === "hold_tap") {
    holdLabel = holdTapSecondaryLabel(key.tap.name, key.tap.param1);
  }

  const displayTap = previewTapLabel ?? tapLabel;
  const displayHold = previewHoldLabel ?? holdLabel;

  const isNone = key?.tap.type === "none";
  const isTrans = key?.tap.type === "trans";
  const hasMorph = key?.tap.type === "mod_morph" ||
    (key?.tap.type === "hold_tap" && key.tap.name.includes("_mm_"));

  const highlightClass =
    dragHighlight === "source-move"
      ? "ring-2 ring-red-500/60"
      : dragHighlight === "source-swap"
        ? "ring-2 ring-blue-500/60"
        : dragHighlight === "target"
          ? "ring-2 ring-blue-500/60"
          : "";

  return (
    <button
      type="button"
      draggable
      onClick={(e) => {
        e.stopPropagation();
        const store = editorStore.getState();
        store.selectKey(store.selectedKeyIndex === index ? null : index);
      }}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "all";
        e.dataTransfer.setData("text/plain", String(index));
        // Defer so browser captures ghost image before highlight renders
        requestAnimationFrame(() => onDragStart?.(index));
      }}
      onDragEnd={() => {
        onDragEnd?.();
      }}
      className={`
        relative
        flex flex-col items-center justify-center
        rounded-md border p-0.5
        text-[11px] leading-tight
        w-full h-full
        cursor-pointer select-none
        transition-colors
        ${isSelected
          ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/30 dark:bg-blue-950"
          : isTrans
            ? "border-gray-400/40 bg-card hover:bg-accent dark:border-gray-500/40"
            : isNone
              ? "border-gray-300 bg-gray-100 hover:bg-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
              : "border-gray-400 bg-card hover:bg-accent dark:border-gray-600"
        }
        ${highlightClass}
      `}
    >
      <span className="font-medium overflow-hidden whitespace-nowrap max-w-full">{displayTap}</span>
      {displayHold && (
        <span className="text-[9px] text-muted-foreground overflow-hidden whitespace-nowrap max-w-full">{displayHold}</span>
      )}
      {hasMorph && (
        <span className="absolute bottom-0 right-0.5 text-[10px] text-muted-foreground leading-none">*</span>
      )}
    </button>
  );
});
