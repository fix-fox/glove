"use client";

import { useState, useEffect } from "react";
import type { HrmSettings, HoldTapDefinition, MouseSettings } from "@/types/schema";
import { DEFAULT_MOUSE_SETTINGS } from "@/types/schema";
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

  const currentMouse = config.mouseSettings ?? DEFAULT_MOUSE_SETTINGS;
  const [normalSpeed, setNormalSpeed] = useState(currentMouse.normalSpeed);
  const [precisionSpeed, setPrecisionSpeed] = useState(currentMouse.precisionSpeed);

  // Sync local state when dialog opens
  useEffect(() => {
    if (open) {
      const c = editorStore.getState().config;
      const s = getEffectiveHrmSettings(c);
      setFlavor(s.flavor);
      setTappingTermMs(s.tappingTermMs);
      setQuickTapMs(s.quickTapMs);
      setRequirePriorIdleMs(s.requirePriorIdleMs);
      const ms = c.mouseSettings ?? DEFAULT_MOUSE_SETTINGS;
      setNormalSpeed(ms.normalSpeed);
      setPrecisionSpeed(ms.precisionSpeed);
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

    const newMouseSettings: MouseSettings = { normalSpeed, precisionSpeed };

    editorStore.getState().patchConfig({
      hrmSettings: newSettings,
      holdTaps,
      mouseSettings: newMouseSettings,
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
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-medium">HRM / Layer-tap</h3>
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

          <h3 className="text-sm font-medium mt-2">Mouse Speed</h3>

          <div className="flex flex-col gap-1.5">
            <Label>Normal Speed</Label>
            <input
              type="number"
              min={1}
              value={normalSpeed}
              onChange={(e) => setNormalSpeed(Math.max(1, parseInt(e.target.value) || 1))}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Precision Speed</Label>
            <input
              type="number"
              min={1}
              value={precisionSpeed}
              onChange={(e) => setPrecisionSpeed(Math.max(1, parseInt(e.target.value) || 1))}
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
