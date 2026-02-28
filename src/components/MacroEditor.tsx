"use client";

import { useState } from "react";
import type { MacroDefinition, MacroStep } from "@/types/schema";
import { editorStore, useEditorStore } from "@/lib/store";
import { isModMacro } from "@/lib/mod-active";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function newMacro(): MacroDefinition {
  return {
    id: crypto.randomUUID(),
    name: "my_macro",
    steps: [{ directive: "tap", bindings: ["&kp A"] }],
  };
}

function newStep(): MacroStep {
  return { directive: "tap", bindings: ["&kp A"] };
}

export function MacroEditor({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const allMacros = useEditorStore((s) => s.config.macros) ?? [];
  // Filter out auto-managed mod macros
  const macros = allMacros.filter((m) => !isModMacro(m));
  const [editingId, setEditingId] = useState<string | null>(null);

  const editing = editingId ? macros.find((m) => m.id === editingId) ?? null : null;

  const updateMacros = (newUserMacros: MacroDefinition[]) => {
    // Preserve auto-managed mod macros
    const modMacros = allMacros.filter((m) => isModMacro(m));
    editorStore.getState().patchConfig({ macros: [...modMacros, ...newUserMacros] });
  };

  const addMacro = () => {
    const m = newMacro();
    updateMacros([...macros, m]);
    setEditingId(m.id);
  };

  const removeMacro = (id: string) => {
    updateMacros(macros.filter((m) => m.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const updateMacro = (updated: MacroDefinition) => {
    updateMacros(macros.map((m) => (m.id === updated.id ? updated : m)));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Macros</DialogTitle>
        </DialogHeader>

        {!editing ? (
          <div className="flex flex-col gap-2">
            {macros.map((m) => (
              <div key={m.id} className="flex items-center gap-2 border rounded p-2">
                <span className="flex-1 text-sm font-mono">{m.name}</span>
                <Button size="sm" variant="outline" onClick={() => setEditingId(m.id)}>
                  Edit
                </Button>
                <Button size="sm" variant="destructive" onClick={() => removeMacro(m.id)}>
                  Delete
                </Button>
              </div>
            ))}
            <Button onClick={addMacro}>Add Macro</Button>
          </div>
        ) : (
          <MacroForm
            macro={editing}
            onChange={updateMacro}
            onBack={() => setEditingId(null)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function MacroForm({
  macro,
  onChange,
  onBack,
}: {
  macro: MacroDefinition;
  onChange: (m: MacroDefinition) => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Button size="sm" variant="ghost" onClick={onBack} className="self-start">
        Back
      </Button>

      <label className="text-sm font-medium">
        Name (C identifier)
        <input
          type="text"
          className="w-full border rounded px-2 py-1 text-sm font-mono mt-1"
          value={macro.name}
          onChange={(e) => onChange({ ...macro, name: e.target.value })}
        />
      </label>

      <label className="text-sm font-medium">
        Label (display)
        <input
          type="text"
          className="w-full border rounded px-2 py-1 text-sm mt-1"
          value={macro.label ?? ""}
          onChange={(e) => onChange({ ...macro, label: e.target.value || undefined })}
        />
      </label>

      <div className="flex gap-4">
        <label className="text-sm font-medium flex-1">
          Wait (ms)
          <input
            type="number"
            className="w-full border rounded px-2 py-1 text-sm mt-1"
            value={macro.waitMs ?? ""}
            onChange={(e) => onChange({ ...macro, waitMs: e.target.value ? Number(e.target.value) : undefined })}
          />
        </label>
        <label className="text-sm font-medium flex-1">
          Tap (ms)
          <input
            type="number"
            className="w-full border rounded px-2 py-1 text-sm mt-1"
            value={macro.tapMs ?? ""}
            onChange={(e) => onChange({ ...macro, tapMs: e.target.value ? Number(e.target.value) : undefined })}
          />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Steps</span>
        {macro.steps.map((step, i) => (
          <StepRow
            key={i}
            step={step}
            onChange={(s) => {
              const newSteps = [...macro.steps];
              newSteps[i] = s;
              onChange({ ...macro, steps: newSteps });
            }}
            onRemove={() => {
              if (macro.steps.length <= 1) return;
              onChange({ ...macro, steps: macro.steps.filter((_, j) => j !== i) });
            }}
          />
        ))}
        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange({ ...macro, steps: [...macro.steps, newStep()] })}
        >
          Add Step
        </Button>
      </div>
    </div>
  );
}

const DIRECTIVES = ["tap", "press", "release", "pause_for_release"] as const;

function StepRow({
  step,
  onChange,
  onRemove,
}: {
  step: MacroStep;
  onChange: (s: MacroStep) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex gap-2 items-start border rounded p-2">
      <Select
        value={step.directive}
        onValueChange={(v) => {
          const directive = v as MacroStep["directive"];
          if (directive === "pause_for_release") {
            onChange({ directive: "pause_for_release" });
          } else {
            onChange({
              directive,
              bindings: "bindings" in step ? step.bindings : ["&kp A"],
            });
          }
        }}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DIRECTIVES.map((d) => (
            <SelectItem key={d} value={d}>{d}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {step.directive !== "pause_for_release" && step.directive !== "param_1to1" && (
        <input
          type="text"
          className="flex-1 border rounded px-2 py-1 text-sm font-mono"
          placeholder="&kp A &kp B"
          value={step.bindings.join(" ")}
          onChange={(e) => {
            const bindings = e.target.value.split(/\s+/).filter(Boolean);
            if (bindings.length > 0) {
              onChange({ directive: step.directive, bindings });
            }
          }}
        />
      )}

      <Button size="sm" variant="ghost" onClick={onRemove}>X</Button>
    </div>
  );
}
