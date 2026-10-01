// =============================================================================
// Mod-morph chain decoding
// =============================================================================

import type { Behavior, ModMorphDefinition } from "../types/keymap";

export interface ModMorphEntry {
  mod: "shift" | "ctrl" | "alt" | "gui";
  keyCode: string;
}

export interface UnpackedKey {
  baseKeyCode: string;
  morphs: ModMorphEntry[];
}

/** ZMK MOD_L/RSFT flags → abstract modifier name. */
const MOD_FLAG_TO_ABSTRACT: Record<string, ModMorphEntry["mod"]> = {
  MOD_LSFT: "shift", MOD_RSFT: "shift",
  MOD_LCTL: "ctrl",  MOD_RCTL: "ctrl",
  MOD_LALT: "alt",   MOD_RALT: "alt",
  MOD_LGUI: "gui",   MOD_RGUI: "gui",
};

function inferMod(mods: string[]): ModMorphEntry["mod"] | null {
  for (const m of mods) {
    const abstract = MOD_FLAG_TO_ABSTRACT[m];
    if (abstract) return abstract;
  }
  return null;
}

/** Parse a simple binding like "&kp QMARK" → "QMARK", or "&mm_name" → the name. */
function parseBinding(binding: string): { type: "kp"; keyCode: string } | { type: "ref"; name: string } | null {
  const kpMatch = binding.match(/^&kp\s+(\S+)$/);
  if (kpMatch) return { type: "kp", keyCode: kpMatch[1]! };
  const refMatch = binding.match(/^&(\S+)$/);
  if (refMatch) return { type: "ref", name: refMatch[1]! };
  return null;
}

/**
 * Walk a mod-morph definition chain to extract the base keycode and all morphs.
 * Returns null if the behavior isn't a mod_morph or the chain is malformed.
 */
export function unpackModMorphChain(
  behavior: Behavior,
  modMorphs: ModMorphDefinition[],
): UnpackedKey | null {
  if (behavior.type !== "mod_morph") return null;

  const morphs: ModMorphEntry[] = [];
  let currentName = behavior.name;

  for (let depth = 0; depth < 10; depth++) {
    const def = modMorphs.find((m) => m.name === currentName);
    if (!def) return null;

    // Extract the morph (modified) binding
    const morphParsed = parseBinding(def.morphBinding);
    if (!morphParsed || morphParsed.type !== "kp") return null;

    const mod = inferMod(def.mods);
    if (!mod) return null;

    morphs.push({ mod, keyCode: morphParsed.keyCode });

    // Check the default (base) binding
    const defaultParsed = parseBinding(def.defaultBinding);
    if (!defaultParsed) return null;

    if (defaultParsed.type === "kp") {
      // Terminal: this is the base key
      return { baseKeyCode: defaultParsed.keyCode, morphs: morphs.reverse() };
    }

    // Chain: default references another mod-morph
    currentName = defaultParsed.name;
  }

  return null; // Too deep
}
