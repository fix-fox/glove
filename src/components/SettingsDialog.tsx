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
