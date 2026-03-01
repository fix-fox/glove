"use client";

import { useState, useEffect } from "react";
import type { Behavior, MacroDefinition } from "@/types/schema";
import { BEHAVIOR_TYPE_LABELS, defaultBehaviorForType } from "@/lib/behavior-defaults";
import {
  ZMK_KEYCODES,
  ZMK_MODIFIER_CODES,
  MODIFIER_WRAPPERS,
  parseModifiedKeyCode,
  composeModifiedKeyCode,
} from "@/lib/keycodes";
import type { ModifierWrapper } from "@/lib/keycodes";
import { isModMacro } from "@/lib/mod-active";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";

// =============================================================================
// Types
// =============================================================================

interface BehaviorPickerProps {
  value: Behavior | null;
  onChange: (behavior: Behavior | null) => void;
  label: string;
  layerNames: string[];
  restrictToHold?: boolean;
  macros?: MacroDefinition[];
  modMorphs?: unknown[];
  holdTaps?: unknown[];
  onHRMEnable?: (modCode: string) => void;
  /** When true, only show the type selector — skip the parameter widgets. */
  hideParams?: boolean;
}

interface TypeGroup {
  heading?: string;
  items: { value: string; label: string }[];
}

// =============================================================================
// Type groups
// =============================================================================

const TAP_TYPE_GROUPS: TypeGroup[] = [
  { items: [{ value: "kp", label: "Key Press" }] },
  {
    heading: "Layers",
    items: [
      { value: "mo", label: "Momentary Layer" },
      { value: "to", label: "To Layer" },
      { value: "sl", label: "Sticky Layer" },
      { value: "tog", label: "Toggle Layer" },
    ],
  },
  {
    heading: "Mouse",
    items: [
      { value: "mmv", label: "Mouse Move" },
      { value: "msc", label: "Mouse Scroll" },
      { value: "mkp", label: "Mouse Click" },
    ],
  },
  {
    heading: "Special",
    items: [
      { value: "trans", label: "Transparent" },
      { value: "none", label: "None" },
      { value: "caps_word", label: "Caps Word" },
      { value: "bootloader", label: "Bootloader" },
      { value: "sys_reset", label: "System Reset" },
      { value: "bt", label: "Bluetooth" },
      { value: "out", label: "Output Selection" },
      { value: "rgb_ug", label: "RGB Underglow" },
    ],
  },
];

const HOLD_TYPE_GROUPS: TypeGroup[] = [
  { items: [{ value: "disabled", label: "None" }] },
  { items: [{ value: "kp", label: "Key Press" }] },
  {
    heading: "Layers",
    items: [
      { value: "mo", label: "Momentary Layer" },
      { value: "to", label: "To Layer" },
      { value: "sl", label: "Sticky Layer" },
      { value: "tog", label: "Toggle Layer" },
    ],
  },
];

function getDisplayLabel(
  typeValue: string,
  macros: MacroDefinition[],
): string {
  if (typeValue === "disabled") return "None";
  if (typeValue.startsWith("macro:")) {
    const name = typeValue.slice(6);
    const m = macros.find((m) => m.name === name);
    return m?.label ?? name;
  }
  return BEHAVIOR_TYPE_LABELS[typeValue as Behavior["type"]];
}

// =============================================================================
// BehaviorPicker
// =============================================================================

export function BehaviorPicker({
  value,
  onChange,
  label,
  layerNames,
  restrictToHold,
  macros = [],
  hideParams,
}: BehaviorPickerProps) {
  // Build a unique type key for custom behaviors
  const typeValue = value
    ? value.type === "macro"
      ? `macro:${value.macroName}`
      : value.type
    : "disabled";

  const baseGroups = restrictToHold ? HOLD_TYPE_GROUPS : TAP_TYPE_GROUPS;

  // Filter out mod_* macros (auto-managed)
  const userMacros = macros.filter((m) => !isModMacro(m));
  const customGroups: TypeGroup[] = [];
  if (userMacros.length > 0) {
    customGroups.push({
      heading: "Macros",
      items: userMacros.map((m) => ({ value: `macro:${m.name}`, label: m.label ?? m.name })),
    });
  }
  const groups = [...baseGroups, ...customGroups];

  const displayLabel = getDisplayLabel(typeValue, macros);

  const handleTypeChange = (newType: string) => {
    if (newType === "disabled") {
      onChange(null);
      return;
    }
    if (newType.startsWith("macro:")) {
      onChange({ type: "macro", macroName: newType.slice(6) });
      return;
    }
    const bt = newType as Behavior["type"];
    if (restrictToHold && bt === "kp") {
      onChange({ type: "kp", keyCode: "LSHIFT" });
    } else {
      onChange(defaultBehaviorForType(bt));
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <BehaviorTypeCombobox
        value={typeValue}
        onValueChange={handleTypeChange}
        groups={groups}
        displayLabel={displayLabel}
      />
      {value && !hideParams && (
        <BehaviorParams
          value={value}
          onChange={onChange}
          layerNames={layerNames}
          restrictToHold={restrictToHold ?? false}
        />
      )}
    </div>
  );
}

// =============================================================================
// BehaviorTypeCombobox
// =============================================================================

function BehaviorTypeCombobox({
  value,
  onValueChange,
  groups,
  displayLabel,
}: {
  value: string;
  onValueChange: (type: string) => void;
  groups: TypeGroup[];
  displayLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start">
          {displayLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search..." />
          <CommandList>
            <CommandEmpty>No match.</CommandEmpty>
            {groups.map((group, i) => (
              <CommandGroup key={i} heading={group.heading}>
                {group.items.map((item) => (
                  <CommandItem
                    key={item.value}
                    value={item.label}
                    onSelect={() => {
                      onValueChange(item.value);
                      setOpen(false);
                    }}
                  >
                    {item.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// =============================================================================
// BehaviorParams
// =============================================================================

function BehaviorParams({
  value,
  onChange,
  layerNames,
  restrictToHold,
}: {
  value: Behavior;
  onChange: (behavior: Behavior | null) => void;
  layerNames: string[];
  restrictToHold: boolean;
}) {
  switch (value.type) {
    case "kp":
      return (
        <div className="flex flex-col gap-2">
          <KeycodeCombobox
            value={value.keyCode}
            onChange={(keyCode) => onChange({ type: "kp", keyCode })}
            modifierOnly={restrictToHold}
          />
          {!restrictToHold && (
            <ModifierToggles
              keyCode={value.keyCode}
              onChange={(keyCode) => onChange({ type: "kp", keyCode })}
            />
          )}
        </div>
      );
    case "mo":
    case "to":
    case "sl":
    case "tog":
      return (
        <LayerCombobox
          value={value.layerIndex}
          onChange={(layerIndex) => onChange({ ...value, layerIndex })}
          layerNames={layerNames}
        />
      );
    case "bt":
      return (
        <BtParams
          action={value.action}
          profileIndex={value.profileIndex}
          onChange={onChange}
        />
      );
    case "rgb_ug":
      return (
        <StringParamSelect
          value={value.action}
          onChange={(action) => onChange({ type: "rgb_ug", action })}
          options={RGB_ACTIONS}
          label="Action"
        />
      );
    case "out":
      return (
        <StringParamSelect
          value={value.action}
          onChange={(action) => onChange({ type: "out", action: action as "OUT_BLE" | "OUT_USB" })}
          options={OUT_ACTIONS}
          label="Output"
        />
      );
    case "mmv":
      return (
        <div className="flex flex-col gap-2">
          <StringParamSelect
            value={value.direction}
            onChange={(direction) => onChange({ ...value, direction })}
            options={MMV_DIRECTIONS}
            label="Direction"
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.precision ?? false}
              onChange={(e) => onChange({ ...value, precision: e.target.checked || undefined })}
            />
            Precision
          </label>
        </div>
      );
    case "msc":
      return (
        <StringParamSelect
          value={value.direction}
          onChange={(direction) => onChange({ type: "msc", direction })}
          options={MSC_DIRECTIONS}
          label="Direction"
        />
      );
    case "mkp":
      return (
        <StringParamSelect
          value={value.button}
          onChange={(button) => onChange({ type: "mkp", button })}
          options={MKP_BUTTONS}
          label="Button"
        />
      );
    default:
      return null;
  }
}

// =============================================================================
// KeycodeCombobox (exported for use in KeyEditor)
// =============================================================================

export function KeycodeCombobox({
  value,
  onChange,
  modifierOnly,
  autoOpen,
}: {
  value: string;
  onChange: (code: string) => void;
  modifierOnly: boolean;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  const keycodes = modifierOnly
    ? ZMK_KEYCODES.filter((k) => ZMK_MODIFIER_CODES.has(k.code))
    : ZMK_KEYCODES;

  // Parse out modifier wrappers so we display and select the base key
  const parsed = parseModifiedKeyCode(value);
  const baseKey = parsed.key;
  const currentLabel =
    ZMK_KEYCODES.find((k) => k.code === baseKey)?.label ?? value;

  const grouped = new Map<string, typeof keycodes>();
  for (const kc of keycodes) {
    const group = grouped.get(kc.category);
    if (group) {
      group.push(kc);
    } else {
      grouped.set(kc.category, [kc]);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          {currentLabel}
          <span className="text-muted-foreground text-xs">{value}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search keycodes..." />
          <CommandList>
            <CommandEmpty>No keycode found.</CommandEmpty>
            {[...grouped.entries()].map(([category, codes]) => (
              <CommandGroup key={category} heading={category}>
                {codes.map((kc) => (
                  <CommandItem
                    key={kc.code}
                    value={`${kc.code} ${kc.label}`}
                    onSelect={() => {
                      // Preserve any active modifier wrappers when selecting a new base key
                      const newCode = parsed.mods.length > 0
                        ? composeModifiedKeyCode({ key: kc.code, mods: parsed.mods })
                        : kc.code;
                      onChange(newCode);
                      setOpen(false);
                    }}
                  >
                    <span>{kc.label}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {kc.code}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// =============================================================================
// LayerSelect
// =============================================================================

export function LayerCombobox({
  value,
  onChange,
  layerNames,
}: {
  value: number;
  onChange: (index: number) => void;
  layerNames: string[];
}) {
  const [open, setOpen] = useState(false);
  const currentLabel = `${value}: ${layerNames[value] ?? value}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start">
          {currentLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search layers..." />
          <CommandList>
            <CommandEmpty>No layer found.</CommandEmpty>
            <CommandGroup>
              {layerNames.map((name, idx) => (
                <CommandItem
                  key={idx}
                  value={`${idx} ${name}`}
                  onSelect={() => {
                    onChange(idx);
                    setOpen(false);
                  }}
                >
                  {idx}: {name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// =============================================================================
// BtParams
// =============================================================================

const RGB_ACTIONS = [
  "RGB_TOG", "RGB_BRI", "RGB_BRD", "RGB_HUI", "RGB_HUD",
  "RGB_SAI", "RGB_SAD", "RGB_EFF", "RGB_EFR", "RGB_SPI", "RGB_SPD",
];
const OUT_ACTIONS = ["OUT_BLE", "OUT_USB"];
const MMV_DIRECTIONS = ["MOVE_UP", "MOVE_DOWN", "MOVE_LEFT", "MOVE_RIGHT"];
const MSC_DIRECTIONS = ["SCRL_UP", "SCRL_DOWN", "SCRL_LEFT", "SCRL_RIGHT"];
const MKP_BUTTONS = ["LCLK", "RCLK", "MCLK"];

const BT_ACTIONS = ["BT_CLR", "BT_CLR_ALL", "BT_NXT", "BT_PRV", "BT_SEL", "BT_DISC"] as const;
const BT_ACTION_LABELS: Record<(typeof BT_ACTIONS)[number], string> = {
  BT_CLR: "Clear",
  BT_CLR_ALL: "Clear All",
  BT_NXT: "Next",
  BT_PRV: "Previous",
  BT_SEL: "Select Profile",
  BT_DISC: "Disconnect",
};

type BtAction = (typeof BT_ACTIONS)[number];
const BT_ACTIONS_WITH_PROFILE = new Set<BtAction>(["BT_SEL", "BT_DISC"]);

function BtParams({
  action,
  profileIndex,
  onChange,
}: {
  action: BtAction;
  profileIndex: number | undefined;
  onChange: (behavior: Behavior | null) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Select
        value={action}
        onValueChange={(v) => {
          const newAction = v as BtAction;
          if (BT_ACTIONS_WITH_PROFILE.has(newAction)) {
            onChange({ type: "bt", action: newAction, profileIndex: 0 });
          } else {
            onChange({ type: "bt", action: newAction });
          }
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {BT_ACTIONS.map((a) => (
            <SelectItem key={a} value={a}>
              {BT_ACTION_LABELS[a]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {BT_ACTIONS_WITH_PROFILE.has(action) && (
        <Select
          value={String(profileIndex ?? 0)}
          onValueChange={(v) =>
            onChange({ type: "bt", action, profileIndex: Number(v) })
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Profile</SelectLabel>
              {[0, 1, 2, 3, 4].map((i) => (
                <SelectItem key={i} value={String(i)}>
                  Profile {i}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

// =============================================================================
// ModifierToggles — wrap/unwrap key codes with LC, LA, etc.
// =============================================================================

/** Modifier wrappers shown in the UI, in display order. */
const DISPLAYED_WRAPPERS: { wrapper: ModifierWrapper; label: string }[] = [
  { wrapper: "LC", label: "Ctrl" },
  { wrapper: "LA", label: "Alt" },
  { wrapper: "LS", label: "Shift" },
  { wrapper: "LG", label: "GUI" },
  { wrapper: "RA", label: "RAlt" },
];

export function ModifierToggles({
  keyCode,
  onChange,
}: {
  keyCode: string;
  onChange: (code: string) => void;
}) {
  const parsed = parseModifiedKeyCode(keyCode);
  const activeMods = new Set(parsed.mods);

  const toggle = (mod: ModifierWrapper) => {
    const newMods = activeMods.has(mod)
      ? parsed.mods.filter((m) => m !== mod)
      : [...parsed.mods, mod];
    onChange(composeModifiedKeyCode({ key: parsed.key, mods: newMods }));
  };

  return (
    <div className="flex flex-wrap gap-1">
      {DISPLAYED_WRAPPERS.map(({ wrapper, label }) => (
        <Button
          key={wrapper}
          variant={activeMods.has(wrapper) ? "default" : "outline"}
          size="sm"
          className="text-xs h-7 px-2"
          onClick={() => toggle(wrapper)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}

// =============================================================================
// StringParamSelect — reusable select for simple string params
// =============================================================================

function StringParamSelect({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>{label}</SelectLabel>
          {options.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
