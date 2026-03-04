"use client";

import { useState, useRef, useEffect } from "react";
import { editorStore, useEditorStore } from "@/lib/store";
import { isModActiveLayer } from "@/lib/mod-active";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function LayerTabs() {
  const layers = useEditorStore((s) => s.config.layers);
  const activeIndex = useEditorStore((s) => s.activeLayerIndex);
  const [renameIdx, setRenameIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter out the auto-managed mod_active layer
  const visibleLayers = layers
    .map((layer, idx) => ({ layer, idx }))
    .filter(({ layer }) => !isModActiveLayer(layer));

  function openRename(idx: number) {
    setDraft(layers[idx]!.name);
    setRenameIdx(idx);
  }

  function commit() {
    if (renameIdx === null) return;
    const trimmed = draft.trim();
    if (trimmed && trimmed !== layers[renameIdx]!.name) {
      editorStore.getState().renameLayer(renameIdx, trimmed);
    }
    setRenameIdx(null);
  }

  useEffect(() => {
    if (renameIdx !== null) {
      // Wait for dialog to render, then focus
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [renameIdx]);

  return (
    <>
      <div data-testid="layer-tabs" className="flex items-center gap-2 flex-wrap">
        {visibleLayers.map(({ layer, idx }) => (
          <Button
            key={layer.id}
            variant={idx === activeIndex ? "default" : "outline"}
            size="sm"
            onClick={() => editorStore.getState().setActiveLayer(idx)}
            onDoubleClick={() => openRename(idx)}
          >
            {layer.name}
          </Button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => editorStore.getState().addLayer(`Layer ${layers.length}`)}
        >
          +
        </Button>
      </div>

      <Dialog open={renameIdx !== null} onOpenChange={(open) => { if (!open) setRenameIdx(null); }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Rename Layer</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); commit(); }}>
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="mb-4 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setRenameIdx(null)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!draft.trim()}>
                Rename
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
