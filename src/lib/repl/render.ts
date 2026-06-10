import type { KeyboardConfig } from "../../types/schema";
import { GLOVE80_KEY_NAMES } from "../layout-map";

export function listLayers(config: KeyboardConfig): string[] {
  return config.layers.map((layer, i) => {
    const bound = layer.keys.filter(
      (k) => k.tap.type !== "none" && k.tap.type !== "trans",
    ).length;
    return `${String(i).padStart(2)}: ${layer.name} (${bound} keys bound)`;
  });
}

export function listMacros(config: KeyboardConfig): string[] {
  return (config.macros ?? []).map((m) => {
    const steps = `${m.steps.length} step${m.steps.length === 1 ? "" : "s"}`;
    return `${m.name} — ${steps}${m.label ? ` (${m.label})` : ""}`;
  });
}

export function listCombos(config: KeyboardConfig): string[] {
  return (config.combos ?? []).map((c) => {
    const keys = c.keyPositions.map((p) => GLOVE80_KEY_NAMES[p] ?? String(p)).join("+");
    return `${c.name}: ${keys} → ${c.binding}`;
  });
}

export function listHoldTaps(config: KeyboardConfig): string[] {
  return (config.holdTaps ?? []).map(
    (h) => `${h.name}: ${h.flavor}, ${h.tappingTermMs}ms, hold ${h.holdBinding}, tap ${h.tapBinding}`,
  );
}

export function listModMorphs(config: KeyboardConfig): string[] {
  return (config.modMorphs ?? []).map(
    (m) => `${m.name}: ${m.defaultBinding} / ${m.mods.join("+")} → ${m.morphBinding}`,
  );
}

export function listCondLayers(config: KeyboardConfig): string[] {
  const name = (i: number) => config.layers[i]?.name ?? String(i);
  return (config.conditionalLayers ?? []).map(
    (c) => `${c.name}: ${c.ifLayers.map(name).join(" + ")} → ${name(c.thenLayer)}`,
  );
}
