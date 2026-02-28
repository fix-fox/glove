"use client";

import { useState, useEffect } from "react";
import type { HrmSettings, HoldTapDefinition } from "@/types/schema";
import { editorStore, useEditorStore } from "@/lib/store";
import { HRM_DEFAULTS } from "@/lib/hrm";
import { getEffectiveHrmSettings, LT_DEF_NAME } from "@/lib/mod-active";
import { isHRMName } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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

const FLAVOR_OPTIONS: { value: HrmSettings["flavor"]; label: string }[] = [
  { value: "balanced", label: "Balanced" },
  { value: "tap-preferred", label: "Tap-preferred" },
  { value: "hold-preferred", label: "Hold-preferred" },
];

function isAutoManagedHoldTap(ht: HoldTapDefinition): boolean {
  return isHRMName(ht.name) || ht.name === LT_DEF_NAME;
}

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const config = useEditorStore((s) => s.config);
  const current = getEffectiveHrmSettings(config);

  const [flavor, setFlavor] = useState(current.flavor);
  const [tappingTermMs, setTappingTermMs] = useState(current.tappingTermMs);
  const [quickTapMs, setQuickTapMs] = useState(current.quickTapMs);
  const [requirePriorIdleMs, setRequirePriorIdleMs] = useState(current.requirePriorIdleMs);

  // Sync local state when dialog opens
  useEffect(() => {
    if (open) {
      const s = getEffectiveHrmSettings(editorStore.getState().config);
      setFlavor(s.flavor);
      setTappingTermMs(s.tappingTermMs);
      setQuickTapMs(s.quickTapMs);
      setRequirePriorIdleMs(s.requirePriorIdleMs);
    }
  }, [open]);

  const handleSave = () => {
    const newSettings: HrmSettings = {
      flavor,
      tappingTermMs,
      quickTapMs,
      requirePriorIdleMs,
    };

    // Update all existing auto-managed hold-tap definitions
    const holdTaps = (editorStore.getState().config.holdTaps ?? []).map((ht) => {
      if (!isAutoManagedHoldTap(ht)) return ht;
      return {
        ...ht,
        flavor: newSettings.flavor,
        tappingTermMs: newSettings.tappingTermMs,
        quickTapMs: newSettings.quickTapMs,
        requirePriorIdleMs: newSettings.requirePriorIdleMs,
      };
    });

    editorStore.getState().patchConfig({
      hrmSettings: newSettings,
      holdTaps,
    });
    onOpenChange(false);
  };

  const isDefault =
    flavor === HRM_DEFAULTS.flavor &&
    tappingTermMs === HRM_DEFAULTS.tappingTermMs &&
    quickTapMs === HRM_DEFAULTS.quickTapMs &&
    requirePriorIdleMs === HRM_DEFAULTS.requirePriorIdleMs;

  const handleReset = () => {
    setFlavor(HRM_DEFAULTS.flavor);
    setTappingTermMs(HRM_DEFAULTS.tappingTermMs);
    setQuickTapMs(HRM_DEFAULTS.quickTapMs);
    setRequirePriorIdleMs(HRM_DEFAULTS.requirePriorIdleMs);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>HRM / Layer-tap Settings</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Flavor</Label>
            <Select value={flavor} onValueChange={(v) => setFlavor(v as HrmSettings["flavor"])}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FLAVOR_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Tapping Term (ms)</Label>
            <input
              type="number"
              min={0}
              value={tappingTermMs}
              onChange={(e) => setTappingTermMs(Math.max(0, parseInt(e.target.value) || 0))}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Quick Tap (ms)</Label>
            <input
              type="number"
              min={0}
              value={quickTapMs}
              onChange={(e) => setQuickTapMs(Math.max(0, parseInt(e.target.value) || 0))}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Prior Idle (ms)</Label>
            <input
              type="number"
              min={0}
              value={requirePriorIdleMs}
              onChange={(e) => setRequirePriorIdleMs(Math.max(0, parseInt(e.target.value) || 0))}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={handleReset} disabled={isDefault}>
              Reset
            </Button>
            <Button onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
