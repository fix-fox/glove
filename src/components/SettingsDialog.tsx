"use client";

import { useState, useEffect } from "react";
import type { HrmSettings, HoldTapDefinition, MouseSettings } from "@/types/schema";
import { DEFAULT_LT_SETTINGS, DEFAULT_MOUSE_SETTINGS } from "@/types/schema";
import { editorStore, useEditorStore } from "@/lib/store";
import { HRM_DEFAULTS } from "@/lib/hrm";
import { getEffectiveHrmSettings, getEffectiveLtSettings, LT_DEF_NAME } from "@/lib/mod-active";
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

function isLtHoldTap(ht: HoldTapDefinition): boolean {
  return ht.name === LT_DEF_NAME || ht.name.startsWith("lt_");
}

const INPUT_CLASS = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm";

function NumberInput({ value, onChange, min = 0 }: { value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <input
      type="number"
      min={min}
      value={value}
      onChange={(e) => onChange(Math.max(min, parseInt(e.target.value) || min))}
      className={INPUT_CLASS}
    />
  );
}

function FlavorSelect({ value, onChange }: { value: HrmSettings["flavor"]; onChange: (v: HrmSettings["flavor"]) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as HrmSettings["flavor"])}>
      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent>
        {FLAVOR_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ── Individual panels ──

export function HrmSettingsPanel() {
  const config = useEditorStore((s) => s.config);
  const currentHrm = getEffectiveHrmSettings(config);

  const [flavor, setFlavor] = useState(currentHrm.flavor);
  const [tappingTermMs, setTappingTermMs] = useState(currentHrm.tappingTermMs);
  const [quickTapMs, setQuickTapMs] = useState(currentHrm.quickTapMs);
  const [priorIdleMs, setPriorIdleMs] = useState(currentHrm.requirePriorIdleMs);

  useEffect(() => {
    const c = editorStore.getState().config;
    const hrm = getEffectiveHrmSettings(c);
    setFlavor(hrm.flavor);
    setTappingTermMs(hrm.tappingTermMs);
    setQuickTapMs(hrm.quickTapMs);
    setPriorIdleMs(hrm.requirePriorIdleMs);
  }, []);

  const handleSave = () => {
    const newHrm: HrmSettings = { flavor, tappingTermMs, quickTapMs, requirePriorIdleMs: priorIdleMs };
    const holdTaps = (editorStore.getState().config.holdTaps ?? []).map((ht) =>
      isHRMName(ht.name) ? { ...ht, ...newHrm } : ht
    );
    editorStore.getState().patchConfig({ hrmSettings: newHrm, holdTaps });
  };

  const handleReset = () => {
    setFlavor(HRM_DEFAULTS.flavor);
    setTappingTermMs(HRM_DEFAULTS.tappingTermMs);
    setQuickTapMs(HRM_DEFAULTS.quickTapMs);
    setPriorIdleMs(HRM_DEFAULTS.requirePriorIdleMs);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label>Flavor</Label>
        <FlavorSelect value={flavor} onChange={setFlavor} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Tapping Term (ms)</Label>
        <NumberInput value={tappingTermMs} onChange={setTappingTermMs} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Quick Tap (ms)</Label>
        <NumberInput value={quickTapMs} onChange={setQuickTapMs} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Prior Idle (ms)</Label>
        <NumberInput value={priorIdleMs} onChange={setPriorIdleMs} />
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={handleReset}>Reset</Button>
        <Button size="sm" onClick={handleSave}>Save</Button>
      </div>
    </div>
  );
}

export function LtSettingsPanel() {
  const config = useEditorStore((s) => s.config);
  const currentLt = getEffectiveLtSettings(config);

  const [flavor, setFlavor] = useState(currentLt.flavor);
  const [tappingTermMs, setTappingTermMs] = useState(currentLt.tappingTermMs);
  const [quickTapMs, setQuickTapMs] = useState(currentLt.quickTapMs);
  const [priorIdleMs, setPriorIdleMs] = useState(currentLt.requirePriorIdleMs);

  useEffect(() => {
    const c = editorStore.getState().config;
    const lt = getEffectiveLtSettings(c);
    setFlavor(lt.flavor);
    setTappingTermMs(lt.tappingTermMs);
    setQuickTapMs(lt.quickTapMs);
    setPriorIdleMs(lt.requirePriorIdleMs);
  }, []);

  const handleSave = () => {
    const newLt: HrmSettings = { flavor, tappingTermMs, quickTapMs, requirePriorIdleMs: priorIdleMs };
    const holdTaps = (editorStore.getState().config.holdTaps ?? []).map((ht) =>
      isLtHoldTap(ht) ? { ...ht, ...newLt } : ht
    );
    editorStore.getState().patchConfig({ ltSettings: newLt, holdTaps });
  };

  const handleReset = () => {
    setFlavor(DEFAULT_LT_SETTINGS.flavor);
    setTappingTermMs(DEFAULT_LT_SETTINGS.tappingTermMs);
    setQuickTapMs(DEFAULT_LT_SETTINGS.quickTapMs);
    setPriorIdleMs(DEFAULT_LT_SETTINGS.requirePriorIdleMs);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label>Flavor</Label>
        <FlavorSelect value={flavor} onChange={setFlavor} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Tapping Term (ms)</Label>
        <NumberInput value={tappingTermMs} onChange={setTappingTermMs} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Quick Tap (ms)</Label>
        <NumberInput value={quickTapMs} onChange={setQuickTapMs} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Prior Idle (ms)</Label>
        <NumberInput value={priorIdleMs} onChange={setPriorIdleMs} />
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={handleReset}>Reset</Button>
        <Button size="sm" onClick={handleSave}>Save</Button>
      </div>
    </div>
  );
}

export function MouseSettingsPanel() {
  const currentMouse = useEditorStore((s) => s.config.mouseSettings) ?? DEFAULT_MOUSE_SETTINGS;

  const [normalSpeed, setNormalSpeed] = useState(currentMouse.normalSpeed);
  const [precisionSpeed, setPrecisionSpeed] = useState(currentMouse.precisionSpeed);

  useEffect(() => {
    const ms = editorStore.getState().config.mouseSettings ?? DEFAULT_MOUSE_SETTINGS;
    setNormalSpeed(ms.normalSpeed);
    setPrecisionSpeed(ms.precisionSpeed);
  }, []);

  const handleSave = () => {
    const newMouseSettings: MouseSettings = { normalSpeed, precisionSpeed };
    editorStore.getState().patchConfig({ mouseSettings: newMouseSettings });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label>Normal Speed</Label>
        <NumberInput value={normalSpeed} onChange={setNormalSpeed} min={1} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Precision Speed</Label>
        <NumberInput value={precisionSpeed} onChange={setPrecisionSpeed} min={1} />
      </div>
      <div className="flex gap-2 justify-end">
        <Button size="sm" onClick={handleSave}>Save</Button>
      </div>
    </div>
  );
}

// ── Dialog wrapper (original export, no behavior change) ──

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const config = useEditorStore((s) => s.config);
  const currentHrm = getEffectiveHrmSettings(config);
  const currentLt = getEffectiveLtSettings(config);

  // HRM state
  const [hrmFlavor, setHrmFlavor] = useState(currentHrm.flavor);
  const [hrmTappingTermMs, setHrmTappingTermMs] = useState(currentHrm.tappingTermMs);
  const [hrmQuickTapMs, setHrmQuickTapMs] = useState(currentHrm.quickTapMs);
  const [hrmPriorIdleMs, setHrmPriorIdleMs] = useState(currentHrm.requirePriorIdleMs);

  // LT state
  const [ltFlavor, setLtFlavor] = useState(currentLt.flavor);
  const [ltTappingTermMs, setLtTappingTermMs] = useState(currentLt.tappingTermMs);
  const [ltQuickTapMs, setLtQuickTapMs] = useState(currentLt.quickTapMs);
  const [ltPriorIdleMs, setLtPriorIdleMs] = useState(currentLt.requirePriorIdleMs);

  // Mouse state
  const currentMouse = config.mouseSettings ?? DEFAULT_MOUSE_SETTINGS;
  const [normalSpeed, setNormalSpeed] = useState(currentMouse.normalSpeed);
  const [precisionSpeed, setPrecisionSpeed] = useState(currentMouse.precisionSpeed);

  // Sync local state when dialog opens
  useEffect(() => {
    if (open) {
      const c = editorStore.getState().config;
      const hrm = getEffectiveHrmSettings(c);
      setHrmFlavor(hrm.flavor);
      setHrmTappingTermMs(hrm.tappingTermMs);
      setHrmQuickTapMs(hrm.quickTapMs);
      setHrmPriorIdleMs(hrm.requirePriorIdleMs);
      const lt = getEffectiveLtSettings(c);
      setLtFlavor(lt.flavor);
      setLtTappingTermMs(lt.tappingTermMs);
      setLtQuickTapMs(lt.quickTapMs);
      setLtPriorIdleMs(lt.requirePriorIdleMs);
      const ms = c.mouseSettings ?? DEFAULT_MOUSE_SETTINGS;
      setNormalSpeed(ms.normalSpeed);
      setPrecisionSpeed(ms.precisionSpeed);
    }
  }, [open]);

  const handleSave = () => {
    const newHrm: HrmSettings = {
      flavor: hrmFlavor,
      tappingTermMs: hrmTappingTermMs,
      quickTapMs: hrmQuickTapMs,
      requirePriorIdleMs: hrmPriorIdleMs,
    };
    const newLt: HrmSettings = {
      flavor: ltFlavor,
      tappingTermMs: ltTappingTermMs,
      quickTapMs: ltQuickTapMs,
      requirePriorIdleMs: ltPriorIdleMs,
    };

    // Apply matching settings to each auto-managed hold-tap definition
    const holdTaps = (editorStore.getState().config.holdTaps ?? []).map((ht) => {
      if (isHRMName(ht.name)) {
        return { ...ht, ...newHrm };
      }
      if (isLtHoldTap(ht)) {
        return { ...ht, ...newLt };
      }
      return ht;
    });

    const newMouseSettings: MouseSettings = { normalSpeed, precisionSpeed };

    editorStore.getState().patchConfig({
      hrmSettings: newHrm,
      ltSettings: newLt,
      holdTaps,
      mouseSettings: newMouseSettings,
    });
    onOpenChange(false);
  };

  const handleResetHrm = () => {
    setHrmFlavor(HRM_DEFAULTS.flavor);
    setHrmTappingTermMs(HRM_DEFAULTS.tappingTermMs);
    setHrmQuickTapMs(HRM_DEFAULTS.quickTapMs);
    setHrmPriorIdleMs(HRM_DEFAULTS.requirePriorIdleMs);
  };

  const handleResetLt = () => {
    setLtFlavor(DEFAULT_LT_SETTINGS.flavor);
    setLtTappingTermMs(DEFAULT_LT_SETTINGS.tappingTermMs);
    setLtQuickTapMs(DEFAULT_LT_SETTINGS.quickTapMs);
    setLtPriorIdleMs(DEFAULT_LT_SETTINGS.requirePriorIdleMs);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* ── HRM ── */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Home Row Mods</h3>
            <Button variant="ghost" size="sm" className="text-xs h-6 px-2" onClick={handleResetHrm}>Reset</Button>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Flavor</Label>
            <FlavorSelect value={hrmFlavor} onChange={setHrmFlavor} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Tapping Term (ms)</Label>
            <NumberInput value={hrmTappingTermMs} onChange={setHrmTappingTermMs} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Quick Tap (ms)</Label>
            <NumberInput value={hrmQuickTapMs} onChange={setHrmQuickTapMs} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Prior Idle (ms)</Label>
            <NumberInput value={hrmPriorIdleMs} onChange={setHrmPriorIdleMs} />
          </div>

          {/* ── Layer-Tap ── */}
          <div className="flex items-center justify-between mt-2">
            <h3 className="text-sm font-medium">Layer-Tap</h3>
            <Button variant="ghost" size="sm" className="text-xs h-6 px-2" onClick={handleResetLt}>Reset</Button>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Flavor</Label>
            <FlavorSelect value={ltFlavor} onChange={setLtFlavor} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Tapping Term (ms)</Label>
            <NumberInput value={ltTappingTermMs} onChange={setLtTappingTermMs} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Quick Tap (ms)</Label>
            <NumberInput value={ltQuickTapMs} onChange={setLtQuickTapMs} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Prior Idle (ms)</Label>
            <NumberInput value={ltPriorIdleMs} onChange={setLtPriorIdleMs} />
          </div>

          {/* ── Mouse Speed ── */}
          <h3 className="text-sm font-medium mt-2">Mouse Speed</h3>

          <div className="flex flex-col gap-1.5">
            <Label>Normal Speed</Label>
            <NumberInput value={normalSpeed} onChange={setNormalSpeed} min={1} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Precision Speed</Label>
            <NumberInput value={precisionSpeed} onChange={setPrecisionSpeed} min={1} />
          </div>

          <div className="flex gap-2 justify-end">
            <Button onClick={handleSave}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
