"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Behavior, Key, KeyboardConfig, ModMorphDefinition } from "@/types/schema";
import { editorStore, useEditorStore } from "@/lib/store";
import { validateConfig } from "@/lib/generator";
import { GLOVE80_KEY_NAMES } from "@/lib/layout-map";
import { isHRMName } from "@/lib/labels";
import {
  SUFFIX_TO_MOD,
  inferModSide,
  modSuffix,
} from "@/lib/hrm";
import { composeModifiedKeyCode, parseModifiedKeyCode } from "@/lib/keycodes";
import type { ModifierWrapper } from "@/lib/keycodes";
import { unpackModMorphChain, packModMorphChain } from "@/lib/mod-morph-utils";
import type { ModMorphEntry } from "@/lib/mod-morph-utils";
import { ensureModActiveLayer, ensureModActivateMacro, ensureHRMDef, ensureLtDef, ensureLayerTapDef } from "@/lib/mod-active";
import { isMagicPosition } from "@/lib/magic";
import { BehaviorPicker, KeycodeCombobox, ModifierToggles, LayerCombobox } from "./BehaviorPicker";
import { Hint } from "./Hint";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// =============================================================================
// Constants
// =============================================================================

const MOD_MORPH_SYMBOLS: Record<ModMorphEntry["mod"], string> = {
  shift: "\u21E7",
  ctrl: "\u2303",
  alt: "\u2325",
  gui: "\u2318",
};

const HOLD_MOD_TYPES = ["shift", "ctrl", "alt", "gui"] as const;
type HoldModType = (typeof HOLD_MOD_TYPES)[number];

const HOLD_MOD_SYMBOLS: Record<HoldModType, string> = {
  shift: "\u21E7",
  ctrl: "\u2303",
  alt: "\u2325",
  gui: "\u2318",
};

type HoldType = "none" | "modifier" | "mo" | "to" | "sl" | "tog";

// =============================================================================
// HRM name parsing
// =============================================================================

/** Derive abstract hold modifier types from the HRM param1 keycode. */
function hrmParam1ToMods(param1: string): HoldModType[] {
  return [...parseHoldModsFromKeyCode(param1)];
}

// =============================================================================
// Multi-modifier keycode composition
// =============================================================================

/** Map modifier keycode → modifier wrapper prefix (for composing modified keycodes). */
const MOD_CODE_TO_WRAPPER: Record<string, ModifierWrapper> = {
  LSHIFT: "LS", RSHIFT: "RS",
  LCTRL: "LC", RCTRL: "RC",
  LALT: "LA", RALT: "RA",
  LGUI: "LG", RGUI: "RG",
};

/** Map modifier wrapper → abstract hold mod type. */
const WRAPPER_TO_ABSTRACT: Record<string, HoldModType> = {
  LS: "shift", RS: "shift",
  LC: "ctrl", RC: "ctrl",
  LA: "alt", RA: "alt",
  LG: "gui", RG: "gui",
};

/** Map modifier keycode → abstract hold mod type. */
const MOD_CODE_TO_ABSTRACT: Record<string, HoldModType> = {
  LSHIFT: "shift", RSHIFT: "shift",
  LCTRL: "ctrl", RCTRL: "ctrl",
  LALT: "alt", RALT: "alt",
  LGUI: "gui", RGUI: "gui",
};

/**
 * Compose multiple modifier codes into a single keycode.
 * ["LSHIFT"] → "LSHIFT"
 * ["LSHIFT", "LCTRL"] → "LC(LSHIFT)"
 */
function composeModCodes(modCodes: string[]): string {
  if (modCodes.length === 0) return "LSHIFT";
  if (modCodes.length === 1) return modCodes[0]!;
  // First code is the base key, rest become wrappers
  const base = modCodes[0]!;
  const wrappers = modCodes.slice(1).map((c) => MOD_CODE_TO_WRAPPER[c]).filter((w): w is ModifierWrapper => w !== undefined);
  return composeModifiedKeyCode({ key: base, mods: wrappers });
}

/**
 * Parse a (possibly modified) modifier keycode back to abstract hold mod types.
 * "LSHIFT" → Set(["shift"])
 * "LC(LSHIFT)" → Set(["shift", "ctrl"])
 */
function parseHoldModsFromKeyCode(keyCode: string): Set<HoldModType> {
  const mods = new Set<HoldModType>();
  const parsed = parseModifiedKeyCode(keyCode);
  // Base key
  const baseAbstract = MOD_CODE_TO_ABSTRACT[parsed.key];
  if (baseAbstract) mods.add(baseAbstract);
  // Wrappers
  for (const w of parsed.mods) {
    const abstract = WRAPPER_TO_ABSTRACT[w];
    if (abstract) mods.add(abstract);
  }
  return mods;
}

// =============================================================================
// Derived state from a key
// =============================================================================

interface DerivedKeyState {
  /** The tap behavior type for BehaviorPicker display. */
  tapBehavior: Behavior;
  /** Base keycode when tap is kp, mod_morph, or HRM hold_tap. Null otherwise. */
  baseKeyCode: string | null;
  /** Unpacked mod-morph entries. */
  morphs: ModMorphEntry[];
  /** Hold type selector value. */
  holdType: HoldType;
  /** Active abstract modifiers. */
  holdMods: Set<HoldModType>;
  /** Whether HRM is active. */
  isHRM: boolean;
  /** Layer index for layer-type holds. */
  holdLayerIndex: number;
}

function deriveKeyState(
  key: Key,
  modMorphs: ModMorphDefinition[],
  holdTaps: import("@/types/schema").HoldTapDefinition[],
): DerivedKeyState {
  let tapBehavior = key.tap;
  let baseKeyCode: string | null = null;
  let morphs: ModMorphEntry[] = [];
  let holdType: HoldType = "none";
  let holdMods = new Set<HoldModType>();
  let isHRM = false;
  let holdLayerIndex = 0;

  // Detect HRM: tap is hold_tap with hml_/hmr_ name
  const hrmActive = key.tap.type === "hold_tap" && isHRMName(key.tap.name);

  if (hrmActive) {
    const ht = key.tap as Extract<Behavior, { type: "hold_tap" }>;
    isHRM = true;
    holdType = "modifier";
    holdMods = new Set(hrmParam1ToMods(ht.param1));

    // Look up the hold-tap definition to check if tapBinding references a mod-morph
    const htDef = holdTaps.find((d) => d.name === ht.name);
    if (htDef && htDef.tapBinding !== "&kp") {
      // tapBinding is e.g. "&mm_q_shift_qmark" — unpack the mod-morph chain
      const mmName = htDef.tapBinding.replace(/^&/, "");
      const unpacked = unpackModMorphChain({ type: "mod_morph", name: mmName }, modMorphs);
      if (unpacked) {
        baseKeyCode = unpacked.baseKeyCode;
        morphs = unpacked.morphs;
        tapBehavior = { type: "kp", keyCode: unpacked.baseKeyCode };
      } else {
        baseKeyCode = ht.param2;
        tapBehavior = { type: "kp", keyCode: ht.param2 };
      }
    } else {
      baseKeyCode = ht.param2;
      tapBehavior = { type: "kp", keyCode: ht.param2 };
    }
  } else {
    // Normal tap handling
    if (key.tap.type === "kp") {
      baseKeyCode = key.tap.keyCode;
    } else if (key.tap.type === "mod_morph") {
      const unpacked = unpackModMorphChain(key.tap, modMorphs);
      if (unpacked) {
        baseKeyCode = unpacked.baseKeyCode;
        morphs = unpacked.morphs;
        // Present as kp to the tap section
        tapBehavior = { type: "kp", keyCode: unpacked.baseKeyCode };
      }
    }

    // Hold handling
    if (key.hold !== null) {
      if (key.hold.type === "kp") {
        holdType = "modifier";
        holdMods = parseHoldModsFromKeyCode(key.hold.keyCode);
      } else if (
        key.hold.type === "mo" ||
        key.hold.type === "to" ||
        key.hold.type === "sl" ||
        key.hold.type === "tog"
      ) {
        holdType = key.hold.type;
        holdLayerIndex = key.hold.layerIndex;
      }
    }
  }

  return { tapBehavior, baseKeyCode, morphs, holdType, holdMods, isHRM, holdLayerIndex };
}

// =============================================================================
// KeyEditor
// =============================================================================

export function KeyEditor() {
  const selectedKeyIndex = useEditorStore((s) => s.selectedKeyIndex);
  const activeLayerIndex = useEditorStore((s) => s.activeLayerIndex);
  const key = useEditorStore((s) => {
    if (s.selectedKeyIndex === null) return null;
    return s.config.layers[s.activeLayerIndex]?.keys[s.selectedKeyIndex] ?? null;
  });
  const layers = useEditorStore((s) => s.config.layers);
  const layerNames = layers.map((l) => l.name);
  const config = useEditorStore((s) => s.config);
  const macros = config.macros ?? [];
  const modMorphs = config.modMorphs ?? [];

  const [morphDialogOpen, setMorphDialogOpen] = useState(false);
  const [autoOpenKeycode, setAutoOpenKeycode] = useState(false);
  const [autoFocusTap, setAutoOpenTap] = useState(false);
  const [tapDropdownOpen, setTapDropdownOpen] = useState(false);
  const [holdDropdownOpen, setHoldDropdownOpen] = useState(false);
  const [keycodeOpen, setKeycodeOpen] = useState(false);
  const anyDropdownOpenRef = useRef(false);
  useEffect(() => {
    anyDropdownOpenRef.current = tapDropdownOpen || holdDropdownOpen || keycodeOpen || morphDialogOpen;
  }, [tapDropdownOpen, holdDropdownOpen, keycodeOpen, morphDialogOpen]);

  // Snapshot for cancel-on-dismiss
  const snapshotRef = useRef<KeyboardConfig | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const savedTemporalRef = useRef<any[]>([]);

  // Take snapshot when dialog opens; auto-open tap dropdown
  useEffect(() => {
    if (selectedKeyIndex !== null) {
      snapshotRef.current = structuredClone(editorStore.getState().config);
      savedTemporalRef.current = [...editorStore.temporal.getState().pastStates];
      setAutoOpenTap(true);
    } else {
      snapshotRef.current = null;
      setAutoOpenTap(false);
    }
  }, [selectedKeyIndex]);

  const handleOK = useCallback(() => {
    // Commit: clear snapshot and close
    snapshotRef.current = null;
    editorStore.getState().selectKey(null);
  }, []);

  const handleDismiss = useCallback(() => {
    // Revert to snapshot, preserving the active layer and undo history
    if (snapshotRef.current) {
      const layerIdx = editorStore.getState().activeLayerIndex;
      editorStore.temporal.getState().pause();
      editorStore.getState().loadConfig(snapshotRef.current);
      editorStore.getState().setActiveLayer(layerIdx);
      editorStore.temporal.getState().resume();
      // Restore undo history to pre-dialog state (discard intermediate entries)
      editorStore.temporal.setState({
        pastStates: savedTemporalRef.current,
        futureStates: [],
      });
    }
    snapshotRef.current = null;
    editorStore.getState().selectKey(null);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleOK();
        return;
      }

      // Hint keys — suppress when typing in an input/textarea or holding modifiers
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (anyDropdownOpenRef.current) return;

      switch (e.key) {
        case "t":
          e.preventDefault();
          setTapDropdownOpen(true);
          break;
        case "h":
          e.preventDefault();
          setHoldDropdownOpen(true);
          break;
        case "k":
          e.preventDefault();
          setKeycodeOpen(true);
          break;
        case "m":
          e.preventDefault();
          setMorphDialogOpen(true);
          break;
        case "c": {
          e.preventDefault();
          const s = editorStore.getState();
          if (s.selectedKeyIndex === null) break;
          const isDefault = s.activeLayerIndex === 0;
          const tap: Behavior = isDefault ? { type: "none" } : { type: "trans" };
          s.setKeyBehavior(s.activeLayerIndex, s.selectedKeyIndex, tap, null);
          break;
        }
        case "x":
          e.preventDefault();
          handleDismiss();
          break;
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleOK, handleDismiss]);

  if (selectedKeyIndex === null || !key || (activeLayerIndex === 0 && isMagicPosition(selectedKeyIndex))) return null;

  const errors = validateConfig(config).filter((e) =>
    e.path.startsWith(`layers[${activeLayerIndex}].keys[${selectedKeyIndex}]`),
  );

  const holdTaps = config.holdTaps ?? [];
  const derived = deriveKeyState(key, modMorphs, holdTaps);

  // ── Tap handlers ──────────────────────────────────────────────────────

  /** Change the tap behavior type (from BehaviorPicker). */
  const handleTapChange = (tap: Behavior | null, opts?: { fromKeycodeSearch?: boolean }) => {
    if (!tap) return;
    if (tap.type === "kp" && !opts?.fromKeycodeSearch) setAutoOpenKeycode(true);
    if (derived.isHRM) {
      // Switching tap type away from kp while HRM is on:
      // disable HRM, set new tap + keep modifiers as hold
      const modCodes = [...derived.holdMods].map((m) => inferModSide(m, selectedKeyIndex));
      const holdKeyCode = composeModCodes(modCodes);
      const hold: Behavior | null =
        modCodes.length > 0 ? { type: "kp", keyCode: holdKeyCode } : null;
      editorStore.getState().setKeyBehavior(activeLayerIndex, selectedKeyIndex, tap, hold);
    } else {
      editorStore.getState().setKeyBehavior(activeLayerIndex, selectedKeyIndex, tap, key.hold);
    }
  };

  /** Change the base keycode (from KeycodeCombobox). */
  const handleBaseKeyChange = (keyCode: string) => {
    if (derived.isHRM) {
      // Re-apply HRM with new keycode
      reapplyHRM(keyCode, derived.morphs, derived.holdMods, selectedKeyIndex);
    } else if (derived.morphs.length > 0) {
      // Re-pack mod-morph chain with new base key
      const { behavior, newModMorphs } = packModMorphChain(keyCode, derived.morphs, modMorphs);
      const merged = mergeModMorphDefs(modMorphs, newModMorphs);
      editorStore.getState().patchConfig({ modMorphs: merged });
      editorStore.getState().setKeyBehavior(activeLayerIndex, selectedKeyIndex, behavior, key.hold);
    } else {
      editorStore.getState().setKeyBehavior(
        activeLayerIndex, selectedKeyIndex,
        { type: "kp", keyCode }, key.hold,
      );
    }
  };

  const handleAddMorph = (entry: ModMorphEntry) => {
    const base = derived.baseKeyCode ?? "A";
    const newMorphs = [...derived.morphs, entry];
    const { behavior, newModMorphs } = packModMorphChain(base, newMorphs, modMorphs);
    const merged = mergeModMorphDefs(modMorphs, newModMorphs);
    editorStore.getState().patchConfig({ modMorphs: merged });

    if (derived.isHRM) {
      // Re-apply HRM with the new mod-morph as tapBinding
      reapplyHRM(base, newMorphs, derived.holdMods, selectedKeyIndex);
    } else {
      editorStore.getState().setKeyBehavior(activeLayerIndex, selectedKeyIndex, behavior, key.hold);
    }
    setMorphDialogOpen(false);
  };

  const handleRemoveMorph = (index: number) => {
    const base = derived.baseKeyCode ?? "A";
    const newMorphs = derived.morphs.filter((_, i) => i !== index);

    if (newMorphs.length === 0) {
      if (derived.isHRM) {
        reapplyHRM(base, [], derived.holdMods, selectedKeyIndex);
      } else {
        editorStore.getState().setKeyBehavior(
          activeLayerIndex, selectedKeyIndex,
          { type: "kp", keyCode: base }, key.hold,
        );
      }
    } else {
      const { behavior, newModMorphs } = packModMorphChain(base, newMorphs, modMorphs);
      const merged = mergeModMorphDefs(modMorphs, newModMorphs);
      editorStore.getState().patchConfig({ modMorphs: merged });
      if (derived.isHRM) {
        reapplyHRM(base, newMorphs, derived.holdMods, selectedKeyIndex);
      } else {
        editorStore.getState().setKeyBehavior(activeLayerIndex, selectedKeyIndex, behavior, key.hold);
      }
    }
  };

  // ── Hold handlers ─────────────────────────────────────────────────────

  const handleHoldTypeChange = (newType: HoldType) => {
    const currentTap = rebuildTapBehavior(derived);

    if (newType === "none") {
      editorStore.getState().setKeyBehavior(activeLayerIndex, selectedKeyIndex, currentTap, null);
    } else if (newType === "modifier") {
      const modCode = inferModSide("shift", selectedKeyIndex);
      editorStore.getState().setKeyBehavior(
        activeLayerIndex, selectedKeyIndex, currentTap,
        { type: "kp", keyCode: modCode },
      );
    } else {
      // Ensure layer-tap hold-tap definitions exist
      let cfg = ensureLtDef(editorStore.getState().config);
      // For non-kp taps, also create a tap-specific layer-tap def
      if (currentTap.type === "mod_morph") {
        const result = ensureLayerTapDef(cfg, currentTap.name);
        cfg = result.config;
      } else if (currentTap.type === "macro") {
        const result = ensureLayerTapDef(cfg, currentTap.macroName);
        cfg = result.config;
      }
      editorStore.getState().patchConfig({ holdTaps: cfg.holdTaps });
      editorStore.getState().setKeyBehavior(
        activeLayerIndex, selectedKeyIndex, currentTap,
        { type: newType, layerIndex: 0 },
      );
    }
  };

  const handleModToggle = (mod: HoldModType) => {
    const newMods = new Set(derived.holdMods);
    if (newMods.has(mod)) {
      // Prevent deselecting the last modifier
      if (newMods.size <= 1) return;
      newMods.delete(mod);
    } else {
      newMods.add(mod);
    }

    const modCodes = [...newMods].map((m) => inferModSide(m, selectedKeyIndex));

    if (derived.isHRM) {
      reapplyHRM(derived.baseKeyCode ?? "A", derived.morphs, newMods, selectedKeyIndex);
    } else {
      const currentTap = rebuildTapBehavior(derived);
      const holdKeyCode = composeModCodes(modCodes);
      editorStore.getState().setKeyBehavior(
        activeLayerIndex, selectedKeyIndex, currentTap,
        { type: "kp", keyCode: holdKeyCode },
      );
    }
  };

  const handleHRMToggle = (checked: boolean) => {
    if (checked) {
      const modCodes = [...derived.holdMods].map((m) => inferModSide(m, selectedKeyIndex));
      if (modCodes.length === 0) return;
      reapplyHRM(derived.baseKeyCode ?? "A", derived.morphs, derived.holdMods, selectedKeyIndex);
    } else {
      // Disable HRM: convert back to kp tap + kp hold
      const currentTap = rebuildTapBehavior(derived);
      const modCodes = [...derived.holdMods].map((m) => inferModSide(m, selectedKeyIndex));
      const holdKeyCode = composeModCodes(modCodes);
      editorStore.getState().setKeyBehavior(
        activeLayerIndex, selectedKeyIndex,
        currentTap,
        modCodes.length > 0 ? { type: "kp", keyCode: holdKeyCode } : null,
      );
    }
  };

  /** Rebuild the "real" tap behavior from derived state (kp or mod_morph). */
  function rebuildTapBehavior(d: DerivedKeyState): Behavior {
    if (d.baseKeyCode !== null && d.morphs.length > 0) {
      const { behavior } = packModMorphChain(d.baseKeyCode, d.morphs, modMorphs);
      return behavior;
    }
    if (d.baseKeyCode !== null) {
      return { type: "kp", keyCode: d.baseKeyCode };
    }
    return d.tapBehavior;
  }

  /** Apply HRM: create definitions and set key behavior. */
  function reapplyHRM(
    baseKeyCode: string,
    morphs: ModMorphEntry[],
    holdMods: Set<HoldModType>,
    keyIndex: number,
  ) {
    const modCodes = [...holdMods].map((m) => inferModSide(m, keyIndex));
    if (modCodes.length === 0) return;

    let cfg = editorStore.getState().config;

    // 1. Ensure mod_active layer + mod_activate macro
    const layerResult = ensureModActiveLayer(cfg);
    cfg = layerResult.config;
    cfg = ensureModActivateMacro(cfg, layerResult.modActiveLayerIndex);

    // 2. Determine tap binding
    let tapBinding = "&kp";
    if (morphs.length > 0) {
      const { behavior: morphBehavior, newModMorphs } = packModMorphChain(baseKeyCode, morphs, cfg.modMorphs ?? []);
      cfg = { ...cfg, modMorphs: mergeModMorphDefs(cfg.modMorphs ?? [], newModMorphs) };
      if (morphBehavior.type === "mod_morph") {
        tapBinding = `&${morphBehavior.name}`;
      }
    }

    // 4. Ensure HRM hold-tap definition
    const hrmResult = ensureHRMDef(cfg, modCodes, keyIndex, tapBinding);
    cfg = hrmResult.config;

    // 5. Persist config changes
    editorStore.getState().patchConfig({
      macros: cfg.macros,
      holdTaps: cfg.holdTaps,
      modMorphs: cfg.modMorphs,
    });
    if (cfg.layers.length !== config.layers.length) {
      editorStore.getState().loadConfig(cfg);
    }

    // 5. Set key behavior — param1 is the modifier keycode
    const holdKeyCode = composeModCodes(modCodes);
    const param2 = tapBinding === "&kp" ? baseKeyCode : "0";
    editorStore.getState().setKeyBehavior(
      activeLayerIndex, keyIndex,
      {
        type: "hold_tap",
        name: hrmResult.holdTapName,
        param1: holdKeyCode,
        param2,
      },
      null,
    );
  }

  const handleClear = () => {
    const isDefault = activeLayerIndex === 0;
    const tap: Behavior = isDefault ? { type: "none" } : { type: "trans" };
    editorStore.getState().setKeyBehavior(activeLayerIndex, selectedKeyIndex, tap, null);
  };

  // ── Render ────────────────────────────────────────────────────────────

  // Show keycode picker when tap is kp-like (kp, mod_morph, or HRM hold_tap)
  const showKeycodeSection = derived.baseKeyCode !== null;

  return (
    <div
      data-testid="key-editor-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={handleDismiss}
    >
      <div
        className="relative bg-popover border rounded-lg shadow-lg p-6 w-[340px] max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute top-2 right-2 text-muted-foreground hover:text-foreground text-lg leading-none p-1"
          aria-label="Close"
        >
          {"\u00D7"}
        </button>
        <h2 className="text-sm font-semibold mb-4">
          {GLOVE80_KEY_NAMES[selectedKeyIndex]} ({selectedKeyIndex})
        </h2>

        <div className="flex flex-col gap-6">
          {/* ── Tap section ── */}
          <div className="flex flex-col gap-2">
            <BehaviorPicker
              value={derived.tapBehavior}
              onChange={handleTapChange}
              label={<Hint text="Tap" hintKey="t" />}
              layerNames={layerNames}
              macros={macros}
              modMorphs={modMorphs}
              hideParams={showKeycodeSection}
              autoFocus={autoFocusTap}
              typeDropdownOpen={tapDropdownOpen}
              onTypeDropdownOpenChange={setTapDropdownOpen}
            />

            {/* Keycode picker + mod-morphs (shown for kp-like taps) */}
            {showKeycodeSection && (
              <>
                <KeycodeCombobox
                  value={derived.baseKeyCode!}
                  onChange={(code) => { setAutoOpenKeycode(false); handleBaseKeyChange(code); }}
                  modifierOnly={false}
                  autoOpen={autoOpenKeycode}
                  controlledOpen={keycodeOpen}
                  onControlledOpenChange={setKeycodeOpen}
                />
                <ModifierToggles
                  keyCode={derived.baseKeyCode!}
                  onChange={handleBaseKeyChange}
                />

                {derived.morphs.length > 0 && (
                  <div className="flex flex-col gap-1">
                    {derived.morphs.map((morph, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm rounded border px-2 py-1">
                        <span>{MOD_MORPH_SYMBOLS[morph.mod]}</span>
                        <span className="text-muted-foreground">{"\u2192"}</span>
                        <span className="flex-1 font-mono">{morph.keyCode}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 text-xs"
                          onClick={() => handleRemoveMorph(i)}
                        >
                          {"\u00D7"}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => setMorphDialogOpen(true)}
                >
                  + Add <Hint text="Mod Morph" hintKey="m" />
                </Button>
              </>
            )}
          </div>

          {/* ── Hold section ── */}
          <HoldSection
            holdType={derived.holdType}
            holdMods={derived.holdMods}
            isHRM={derived.isHRM}
            layerIndex={derived.holdLayerIndex}
            layerNames={layerNames}
            onHoldTypeChange={handleHoldTypeChange}
            onModToggle={handleModToggle}
            onHRMToggle={handleHRMToggle}
            selectOpen={holdDropdownOpen}
            onSelectOpenChange={setHoldDropdownOpen}
            onLayerChange={(idx) => {
              if (derived.holdType !== "none" && derived.holdType !== "modifier") {
                editorStore.getState().setKeyBehavior(
                  activeLayerIndex, selectedKeyIndex, key.tap,
                  { type: derived.holdType, layerIndex: idx },
                );
              }
            }}
          />

          {errors.length > 0 && (
            <div className="text-xs text-destructive space-y-1">
              {errors.map((e, i) => (
                <p key={i}>{e.message}</p>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={handleClear}>
              <Hint text="Clear" hintKey="c" />
            </Button>
            <Button className="flex-1" onClick={handleOK}>
              OK
            </Button>
          </div>
        </div>

        <ModMorphDialog
          open={morphDialogOpen}
          onOpenChange={setMorphDialogOpen}
          onAdd={handleAddMorph}
          usedMods={new Set(derived.morphs.map((m) => m.mod))}
        />
      </div>
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function mergeModMorphDefs(
  existing: ModMorphDefinition[],
  updated: ModMorphDefinition[],
): ModMorphDefinition[] {
  const result = [...existing];
  for (const def of updated) {
    const idx = result.findIndex((m) => m.name === def.name);
    if (idx !== -1) {
      result[idx] = def;
    } else {
      result.push(def);
    }
  }
  return result;
}

// =============================================================================
// HoldSection
// =============================================================================

const HOLD_TYPE_OPTIONS: { value: HoldType; label: string }[] = [
  { value: "none", label: "None" },
  { value: "modifier", label: "Modifier" },
  { value: "mo", label: "Momentary Layer" },
  { value: "to", label: "To Layer" },
  { value: "sl", label: "Sticky Layer" },
  { value: "tog", label: "Toggle Layer" },
];

function HoldSection({
  holdType,
  holdMods,
  isHRM,
  layerIndex,
  layerNames,
  onHoldTypeChange,
  onModToggle,
  onHRMToggle,
  onLayerChange,
  selectOpen,
  onSelectOpenChange,
}: {
  holdType: HoldType;
  holdMods: Set<HoldModType>;
  isHRM: boolean;
  layerIndex: number;
  layerNames: string[];
  onHoldTypeChange: (type: HoldType) => void;
  onModToggle: (mod: HoldModType) => void;
  onHRMToggle: (checked: boolean) => void;
  onLayerChange: (index: number) => void;
  selectOpen?: boolean;
  onSelectOpenChange?: (open: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium"><Hint text="Hold" hintKey="h" /></span>
      <Select
        value={holdType}
        onValueChange={(v) => onHoldTypeChange(v as HoldType)}
        {...(selectOpen != null ? { open: selectOpen } : {})}
        {...(onSelectOpenChange != null ? { onOpenChange: onSelectOpenChange } : {})}
      >
        <SelectTrigger
          className="w-full"
          onKeyDown={(e) => {
            if ("thkmcx".includes(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
              e.preventDefault();
            }
          }}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {HOLD_TYPE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {holdType === "modifier" && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-1">
            {HOLD_MOD_TYPES.map((mod) => (
              <Button
                key={mod}
                variant={holdMods.has(mod) ? "default" : "outline"}
                size="sm"
                className="flex-1 text-lg"
                onClick={() => onModToggle(mod)}
              >
                {HOLD_MOD_SYMBOLS[mod]}
              </Button>
            ))}
          </div>
          {holdMods.size > 0 && (
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={isHRM}
                onChange={(e) => onHRMToggle(e.target.checked)}
                className="cursor-pointer"
              />
              Home Row Mod (HRM)
            </label>
          )}
        </div>
      )}

      {(holdType === "mo" || holdType === "to" || holdType === "sl" || holdType === "tog") && (
        <LayerCombobox
          value={layerIndex}
          onChange={onLayerChange}
          layerNames={layerNames}
        />
      )}
    </div>
  );
}

// =============================================================================
// ModMorphDialog
// =============================================================================

const MOD_TYPES: ModMorphEntry["mod"][] = ["shift", "ctrl", "alt", "gui"];

function ModMorphDialog({
  open,
  onOpenChange,
  onAdd,
  usedMods,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (entry: ModMorphEntry) => void;
  usedMods: Set<ModMorphEntry["mod"]>;
}) {
  const [selectedMod, setSelectedMod] = useState<ModMorphEntry["mod"]>("shift");
  const [keyCode, setKeyCode] = useState("EXCL");

  useEffect(() => {
    if (open) {
      const available = MOD_TYPES.find((m) => !usedMods.has(m));
      setSelectedMod(available ?? "shift");
      setKeyCode("EXCL");
    }
  }, [open, usedMods]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Add Mod Morph</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">When holding:</span>
            <div className="flex gap-1">
              {MOD_TYPES.map((mod) => (
                <Button
                  key={mod}
                  variant={selectedMod === mod ? "default" : "outline"}
                  size="sm"
                  className="flex-1 text-lg"
                  onClick={() => setSelectedMod(mod)}
                  disabled={usedMods.has(mod)}
                >
                  {MOD_MORPH_SYMBOLS[mod]}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Send:</span>
            <KeycodeCombobox
              value={keyCode}
              onChange={setKeyCode}
              modifierOnly={false}
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => onAdd({ mod: selectedMod, keyCode })}>
              Add
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
