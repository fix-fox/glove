import type { KeyboardConfig, Layer } from "../../types/schema";
import { GLOVE80_KEY_NAMES } from "../layout-map";

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function resolveLayer(
  config: KeyboardConfig,
  ref: string,
): Result<{ index: number; layer: Layer }> {
  if (/^\d+$/.test(ref)) {
    const index = Number(ref);
    if (index >= config.layers.length) {
      return {
        ok: false,
        error: `Layer index ${index} out of range (0-${config.layers.length - 1})`,
      };
    }
    return { ok: true, value: { index, layer: config.layers[index]! } };
  }
  const lower = ref.toLowerCase();
  const exact = config.layers.findIndex((l) => l.name.toLowerCase() === lower);
  if (exact !== -1) return { ok: true, value: { index: exact, layer: config.layers[exact]! } };
  const matches = config.layers
    .map((layer, index) => ({ layer, index }))
    .filter(({ layer }) => layer.name.toLowerCase().startsWith(lower));
  if (matches.length === 1) return { ok: true, value: matches[0]! };
  if (matches.length > 1) {
    return {
      ok: false,
      error: `Ambiguous layer "${ref}": ${matches.map((m) => m.layer.name).join(", ")}`,
    };
  }
  return {
    ok: false,
    error: `Unknown layer "${ref}". Layers: ${config.layers.map((l) => l.name).join(", ")}`,
  };
}

export function resolvePosition(ref: string): Result<number> {
  if (/^\d+$/.test(ref)) {
    const pos = Number(ref);
    if (pos > 79) return { ok: false, error: `Position ${pos} out of range (0-79)` };
    return { ok: true, value: pos };
  }
  const idx = GLOVE80_KEY_NAMES.indexOf(ref.toUpperCase());
  if (idx === -1) {
    return {
      ok: false,
      error: `Unknown key name "${ref}" — expected 0-79 or a name like LM3, RH1`,
    };
  }
  return { ok: true, value: idx };
}
