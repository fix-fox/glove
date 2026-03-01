"use client";

import { useState } from "react";
import type { ComboDefinition } from "@/types/schema";
import { editorStore, useEditorStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function newCombo(): ComboDefinition {
  return {
    id: crypto.randomUUID(),
    name: "my_combo",
    keyPositions: [0, 1],
    binding: "&none",
    timeoutMs: 50,
  };
}

export function ComboEditorContent() {
  const combos = useEditorStore((s) => s.config.combos) ?? [];
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = editingId ? combos.find((c) => c.id === editingId) ?? null : null;

  const update = (newList: ComboDefinition[]) => {
    editorStore.getState().patchConfig({ combos: newList });
  };

  const add = () => {
    const c = newCombo();
    update([...combos, c]);
    setEditingId(c.id);
  };

  const remove = (id: string) => {
    update(combos.filter((c) => c.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const save = (updated: ComboDefinition) => {
    update(combos.map((c) => (c.id === updated.id ? updated : c)));
  };

  return !editing ? (
    <div className="flex flex-col gap-2">
      {combos.map((c) => (
        <div key={c.id} className="flex items-center gap-2 border rounded p-2">
          <span className="flex-1 text-sm font-mono">{c.name}</span>
          <Button size="sm" variant="outline" onClick={() => setEditingId(c.id)}>Edit</Button>
          <Button size="sm" variant="destructive" onClick={() => remove(c.id)}>Delete</Button>
        </div>
      ))}
      <Button onClick={add}>Add Combo</Button>
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
        Key Positions (space-separated indices)
        <input type="text" className="w-full border rounded px-2 py-1 text-sm font-mono mt-1"
          value={editing.keyPositions.join(" ")}
          onChange={(e) => {
            const positions = e.target.value.split(/\s+/).filter(Boolean).map(Number);
            if (positions.length >= 2) save({ ...editing, keyPositions: positions });
          }} />
      </label>
      <label className="text-sm font-medium">
        Binding
        <input type="text" className="w-full border rounded px-2 py-1 text-sm font-mono mt-1"
          value={editing.binding} onChange={(e) => save({ ...editing, binding: e.target.value })} />
      </label>
      <label className="text-sm font-medium">
        Timeout (ms)
        <input type="number" className="w-full border rounded px-2 py-1 text-sm mt-1"
          value={editing.timeoutMs ?? ""} onChange={(e) => save({ ...editing, timeoutMs: e.target.value ? Number(e.target.value) : undefined })} />
      </label>
      <label className="text-sm font-medium">
        Prior Idle (ms)
        <input type="number" className="w-full border rounded px-2 py-1 text-sm mt-1"
          value={editing.requirePriorIdleMs ?? ""} onChange={(e) => save({ ...editing, requirePriorIdleMs: e.target.value ? Number(e.target.value) : undefined })} />
      </label>
      <label className="text-sm font-medium">
        Layers (space-separated, blank = all)
        <input type="text" className="w-full border rounded px-2 py-1 text-sm font-mono mt-1"
          value={(editing.layers ?? []).join(" ")}
          onChange={(e) => {
            const layers = e.target.value.split(/\s+/).filter(Boolean).map(Number);
            save({ ...editing, layers: layers.length > 0 ? layers : undefined });
          }} />
      </label>
    </div>
  );
}

export function ComboEditor({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Combos</DialogTitle>
        </DialogHeader>
        <ComboEditorContent />
      </DialogContent>
    </Dialog>
  );
}
