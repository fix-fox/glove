"use client";

import { useState } from "react";
import type { ConditionalLayerDefinition } from "@/types/schema";
import { editorStore, useEditorStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function newConditionalLayer(): ConditionalLayerDefinition {
  return {
    id: crypto.randomUUID(),
    name: "tri_layer",
    ifLayers: [1, 2],
    thenLayer: 3,
  };
}

export function ConditionalLayerEditor({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const cls = useEditorStore((s) => s.config.conditionalLayers) ?? [];
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = editingId ? cls.find((c) => c.id === editingId) ?? null : null;

  const update = (newList: ConditionalLayerDefinition[]) => {
    editorStore.getState().patchConfig({ conditionalLayers: newList });
  };

  const add = () => {
    const cl = newConditionalLayer();
    update([...cls, cl]);
    setEditingId(cl.id);
  };

  const remove = (id: string) => {
    update(cls.filter((c) => c.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const save = (updated: ConditionalLayerDefinition) => {
    update(cls.map((c) => (c.id === updated.id ? updated : c)));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Conditional Layers</DialogTitle>
        </DialogHeader>

        {!editing ? (
          <div className="flex flex-col gap-2">
            {cls.map((cl) => (
              <div key={cl.id} className="flex items-center gap-2 border rounded p-2">
                <span className="flex-1 text-sm font-mono">{cl.name}</span>
                <Button size="sm" variant="outline" onClick={() => setEditingId(cl.id)}>Edit</Button>
                <Button size="sm" variant="destructive" onClick={() => remove(cl.id)}>Delete</Button>
              </div>
            ))}
            <Button onClick={add}>Add Conditional Layer</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="self-start">
              Back
            </Button>
            <label className="text-sm font-medium">
              Name
              <input type="text" className="w-full border rounded px-2 py-1 text-sm font-mono mt-1"
                value={editing.name} onChange={(e) => save({ ...editing, name: e.target.value })} />
            </label>
            <label className="text-sm font-medium">
              If Layers (space-separated indices)
              <input type="text" className="w-full border rounded px-2 py-1 text-sm font-mono mt-1"
                value={editing.ifLayers.join(" ")}
                onChange={(e) => {
                  const layers = e.target.value.split(/\s+/).filter(Boolean).map(Number);
                  if (layers.length >= 2) save({ ...editing, ifLayers: layers });
                }} />
            </label>
            <label className="text-sm font-medium">
              Then Layer (index)
              <input type="number" className="w-full border rounded px-2 py-1 text-sm mt-1"
                value={editing.thenLayer}
                onChange={(e) => save({ ...editing, thenLayer: Number(e.target.value) })} />
            </label>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
