/**
 * Concept → keycode-query aliases for `find`.
 * Mac-specific chords are seeded from docs/MAC_SETUP.md §7 (special keys) —
 * keep this table in sync when that doc changes.
 */
export interface FindAlias {
  queries: string[]; // each must be parseFindQuery-compatible
  hint: string; // shown to the user when the alias expands
}

export const FIND_ALIASES: Record<string, FindAlias> = {
  screenshot: {
    queries: ["LG(LS(N5))", "LG(LS(N4))", "LG(LS(N3))", "PSCRN"],
    hint: "⌘⇧5 menu / ⌘⇧4 region / ⌘⇧3 full / PrtSc",
  },
  lock: { queries: ["LC(LG(Q))"], hint: "⌃⌘Q" },
  emoji: { queries: ["LC(LG(SPACE))"], hint: "⌃⌘Space" },
  launcher: { queries: ["LA(SPACE)"], hint: "⌥Space" },
  clipboard: { queries: ["LA(LS(V))"], hint: "⌥⇧V (Maccy)" },
  alttab: { queries: ["LA(TAB)"], hint: "⌥Tab" },
  lang: { queries: ["LC(SPACE)"], hint: "⌃Space input-source switch" },
  copy: { queries: ["LG(C)"], hint: "⌘C" },
  paste: { queries: ["LG(V)"], hint: "⌘V" },
  cut: { queries: ["LG(X)"], hint: "⌘X" },
  undo: { queries: ["LG(Z)"], hint: "⌘Z" },
  redo: { queries: ["LS(LG(Z))"], hint: "⌘⇧Z" },
  save: { queries: ["LG(S)"], hint: "⌘S" },
  newtab: { queries: ["LG(T)"], hint: "⌘T" },
  close: { queries: ["LG(W)"], hint: "⌘W" },
};

export function lookupAlias(query: string): FindAlias | undefined {
  return FIND_ALIASES[query.trim().toLowerCase()];
}
