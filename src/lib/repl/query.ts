import type { KeyboardConfig, Layer, Behavior } from "../../types/schema";
import { GLOVE80_KEY_NAMES } from "../layout-map";
import { isModifiedKeyCode, parseModifiedKeyCode, ZMK_KEYCODES } from "../keycodes";

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

// =============================================================================
// Find-Query Parsing and Reverse Binding Lookup
// =============================================================================

export interface FindQuery {
  mods: string[]; // sorted ZMK wrappers, e.g. ["LG", "LS"]
  key: string; // uppercase keycode
}

const MOD_WORDS: Record<string, string> = {
  cmd: "LG",
  command: "LG",
  gui: "LG",
  win: "LG",
  lg: "LG",
  rcmd: "RG",
  rgui: "RG",
  rg: "RG",
  ctrl: "LC",
  control: "LC",
  lc: "LC",
  rctrl: "RC",
  rc: "RC",
  alt: "LA",
  opt: "LA",
  option: "LA",
  la: "LA",
  ralt: "RA",
  ropt: "RA",
  ra: "RA",
  shift: "LS",
  ls: "LS",
  rshift: "RS",
  rs: "RS",
};

const SYMBOL_MODS: Record<string, string> = {
  "⌘": "LG",
  "⌥": "LA",
  "⌃": "LC",
  "⇧": "LS",
};

export function parseFindQuery(input: string): FindQuery | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const upper = trimmed.toUpperCase();
  if (isModifiedKeyCode(upper)) {
    const parsed = parseModifiedKeyCode(upper);
    return { mods: [...parsed.mods].sort(), key: parsed.key };
  }

  const mods: string[] = [];
  let rest = trimmed;

  // Parse symbol modifiers at the start (e.g., ⌘ in "⌘C")
  while (rest.length > 0) {
    const first = rest[0];
    if (first === undefined || !SYMBOL_MODS[first]) break;
    mods.push(SYMBOL_MODS[first]);
    rest = rest.slice(1);
  }

  const tokens = rest
    .split("+")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (tokens.length === 0) return null;

  // Parse all but the last token as modifier words
  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i];
    if (token === undefined) return null;
    const mod = MOD_WORDS[token.toLowerCase()];
    if (!mod) return null;
    mods.push(mod);
  }

  const lastToken = tokens[tokens.length - 1];
  if (!lastToken) return null;

  return { mods: mods.sort(), key: lastToken.toUpperCase() };
}

export interface FindMatch {
  location: string;
  binding: string;
  note: string | undefined;
}

/** Extract keycodes from binding strings like "&kp LG(C)" or "&kp ESC &kp B". */
export function extractKpCodes(binding: string): string[] {
  return [...binding.matchAll(/&kp\s+(\S+)/g)].map((m) => m[1]!);
}

function matchCode(code: string, q: FindQuery): { match: boolean; note: string | undefined } {
  let mods: string[] = [];
  let key = code;

  if (isModifiedKeyCode(code)) {
    const parsed = parseModifiedKeyCode(code);
    mods = [...parsed.mods].sort();
    key = parsed.key;
  }

  if (key !== q.key) return { match: false, note: undefined };

  if (q.mods.length === 0) {
    const note = mods.length ? `with ${mods.join("+")}` : undefined;
    return { match: true, note };
  }

  return { match: mods.join(",") === q.mods.join(","), note: undefined };
}

function behaviorKeyCodes(behavior: Behavior, config: KeyboardConfig): string[] {
  switch (behavior.type) {
    case "kp":
      return [behavior.keyCode];
    case "hold_tap":
      return [behavior.param1, behavior.param2];
    case "mod_morph": {
      const def = (config.modMorphs ?? []).find((m) => m.name === behavior.name);
      if (!def) return [];
      return [...extractKpCodes(def.defaultBinding), ...extractKpCodes(def.morphBinding)];
    }
    default:
      return [];
  }
}

export function findBindings(config: KeyboardConfig, q: FindQuery): FindMatch[] {
  const results: FindMatch[] = [];

  const add = (location: string, code: string) => {
    const m = matchCode(code, q);
    if (m.match) {
      results.push({ location, binding: code, note: m.note });
    }
  };

  // Search layer keys
  for (const layer of config.layers) {
    layer.keys.forEach((key, pos) => {
      const posName = `${GLOVE80_KEY_NAMES[pos]} (pos ${pos})`;
      const slots: Array<["tap" | "hold", Behavior | null]> = [
        ["tap", key.tap],
        ["hold", key.hold],
      ];
      for (const [slot, behavior] of slots) {
        if (!behavior) continue;
        for (const code of behaviorKeyCodes(behavior, config)) {
          add(`layer ${layer.name} · ${posName} · ${slot}`, code);
        }
      }
    });
  }

  // Search macros
  for (const macro of config.macros ?? []) {
    macro.steps.forEach((step, i) => {
      if (!("bindings" in step)) return;
      for (const code of extractKpCodes((step.bindings ?? []).join(" "))) {
        add(`macro ${macro.name} · step ${i + 1} (${step.directive})`, code);
      }
    });
  }

  // Search combos
  for (const combo of config.combos ?? []) {
    for (const code of extractKpCodes(combo.binding)) {
      add(`combo ${combo.name}`, code);
    }
  }

  // Search mod-morphs
  for (const mm of config.modMorphs ?? []) {
    for (const code of extractKpCodes(mm.defaultBinding)) {
      add(`mod-morph ${mm.name} · default`, code);
    }
    for (const code of extractKpCodes(mm.morphBinding)) {
      add(`mod-morph ${mm.name} · morph`, code);
    }
  }

  // Search hold-taps
  for (const ht of config.holdTaps ?? []) {
    for (const code of extractKpCodes(`${ht.tapBinding} ${ht.holdBinding}`)) {
      add(`hold-tap ${ht.name} · binding`, code);
    }
  }

  return results;
}

// =============================================================================
// Text Search: Fallback for Find Query
// =============================================================================

export interface TextSearchResult {
  entity: string; // e.g. `macro "copy_url" (CopyURL)` or `keycode BSPC "Backspace"`
  matches: FindMatch[]; // bindings (populated for keycode hits; [] for entity hits)
}

/**
 * Fallback for `find`: case-insensitive substring search over entity names,
 * labels, layer names, and ZMK keycode labels (which are then reverse-found).
 * Queries shorter than 2 chars return nothing (too noisy).
 */
export function textSearch(config: KeyboardConfig, query: string): TextSearchResult[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const hit = (s: string | undefined): boolean =>
    s !== undefined && s.toLowerCase().includes(q);
  const results: TextSearchResult[] = [];

  for (const m of config.macros ?? []) {
    if (hit(m.name) || hit(m.label)) {
      results.push({ entity: `macro "${m.name}"${m.label ? ` (${m.label})` : ""}`, matches: [] });
    }
  }
  for (const c of config.combos ?? []) {
    if (hit(c.name)) results.push({ entity: `combo "${c.name}"`, matches: [] });
  }
  for (const mm of config.modMorphs ?? []) {
    if (hit(mm.name) || hit(mm.label)) results.push({ entity: `mod-morph "${mm.name}"`, matches: [] });
  }
  for (const ht of config.holdTaps ?? []) {
    if (hit(ht.name) || hit(ht.label)) results.push({ entity: `hold-tap "${ht.name}"`, matches: [] });
  }
  config.layers.forEach((layer, i) => {
    if (hit(layer.name)) results.push({ entity: `layer ${i} "${layer.name}"`, matches: [] });
  });
  for (const kc of ZMK_KEYCODES) {
    if (kc.label.toLowerCase().includes(q) && kc.label.toLowerCase() !== kc.code.toLowerCase()) {
      const matches = findBindings(config, { mods: [], key: kc.code });
      if (matches.length > 0) {
        results.push({ entity: `keycode ${kc.code} "${kc.label}"`, matches });
      }
    }
  }
  return results;
}
