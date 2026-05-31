// One-directional transform: adapt config.json from Windows to macOS conventions.
// See docs/superpowers/specs/2026-05-31-macos-migration-design.md
// Run from anywhere: `node scripts/macos-migrate.mjs`
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'config.json');
const raw = readFileSync(file, 'utf8');
const cfg = JSON.parse(raw);

const counts = { hrm: 0, lcToLg: 0, special: 0, macros: 0 };

// 4.1 CAGS: swap GUI<->CTRL on home-row hold-tap modifiers (exact match only,
// so LA(LGUI)/RA(RGUI) and Shift/Alt mods are left untouched).
const param1Swap = { LGUI: 'LCTRL', LCTRL: 'LGUI', RGUI: 'RCTRL', RCTRL: 'RGUI' };

// 4.2 generic Windows-Ctrl-shortcut -> Mac-Cmd
function lcToLg(code) {
  const m = /^LC\((.+)\)$/.exec(code);
  return m ? `LG(${m[1]})` : code;
}

// 4.3 special exact remaps, scoped per layer
const specials = {
  cursor: { 'LA(F4)': 'LG(Q)', 'LA(LC(V))': 'LA(LS(V))' },
  default: {
    'LG(L)': 'LC(LG(Q))',        // Win+L lock -> Ctrl+Cmd+Q
    'LG(SEMI)': 'LC(LG(SPACE))',  // Win+; emoji -> Ctrl+Cmd+Space
    'PSCRN': 'LG(LS(N5))',        // Print Screen -> Cmd+Shift+5
    'LC(SPACE)': 'LA(SPACE)',     // launcher thumb -> Option+Space (swap-immune)
  },
  system: { 'PRINTSCREEN': 'LG(LS(N5))' },
};

for (const layer of cfg.layers) {
  for (const key of layer.keys || []) {
    const tap = key.tap;
    if (!tap) continue;

    // 1. HRM CAGS swap (all layers)
    if (tap.type === 'hold_tap' && tap.param1 in param1Swap) {
      tap.param1 = param1Swap[tap.param1];
      counts.hrm++;
    }

    // 2. specials (exact) -- before generic LC->LG
    const sp = specials[layer.name];
    if (sp) {
      if (tap.keyCode && sp[tap.keyCode]) { tap.keyCode = sp[tap.keyCode]; counts.special++; }
      if (tap.param2 && sp[tap.param2]) { tap.param2 = sp[tap.param2]; counts.special++; }
    }

    // 3. cursor/mouse generic LC(x) -> LG(x)
    if (layer.name === 'cursor' || layer.name === 'mouse') {
      if (tap.keyCode) { const n = lcToLg(tap.keyCode); if (n !== tap.keyCode) { tap.keyCode = n; counts.lcToLg++; } }
      if (tap.param2) { const n = lcToLg(tap.param2); if (n !== tap.param2) { tap.param2 = n; counts.lcToLg++; } }
    }
  }
}

// 4.5 macros -- full-replace steps for these:
const macroSteps = {
  lang_toggle: [
    { directive: 'tap', bindings: ['&kp CAPS'] },
    { directive: 'tap', bindings: ['&tog 3'] },
  ],
  delete_to_bol: [
    { directive: 'press', bindings: ['&kp LGUI'] },
    { directive: 'tap', bindings: ['&kp BSPC'] },
    { directive: 'release', bindings: ['&kp LGUI'] },
  ],
  delete_to_eol: [
    { directive: 'press', bindings: ['&kp LCTRL'] },
    { directive: 'tap', bindings: ['&kp K'] },
    { directive: 'release', bindings: ['&kp LCTRL'] },
  ],
  select_line: [
    { directive: 'press', bindings: ['&kp LGUI'] },
    { directive: 'tap', bindings: ['&kp LEFT'] },
    { directive: 'release', bindings: ['&kp LGUI'] },
    { directive: 'press', bindings: ['&kp LSHFT'] },
    { directive: 'press', bindings: ['&kp LGUI'] },
    { directive: 'tap', bindings: ['&kp RIGHT'] },
    { directive: 'release', bindings: ['&kp LGUI'] },
    { directive: 'release', bindings: ['&kp LSHFT'] },
  ],
  clipboard_history: [
    { directive: 'press', bindings: ['&kp LALT'] },
    { directive: 'press', bindings: ['&kp LSHFT'] },
    { directive: 'tap', bindings: ['&kp V'] },
    { directive: 'release', bindings: ['&kp LSHFT'] },
    { directive: 'release', bindings: ['&kp LALT'] },
  ],
};
// modifier string-swap for these (preserve the rest of the macro):
const macroStrSwap = {
  gemini_tab: { '&kp LCTRL': '&kp LGUI' },
  flow_bookmark: { '&kp LCTRL': '&kp LALT' },
  v_space_ctrl_t: { '&kp LCTRL': '&kp LGUI' },
};
for (const macro of cfg.macros || []) {
  if (macroSteps[macro.name]) {
    macro.steps = macroSteps[macro.name];
    counts.macros++;
  } else if (macroStrSwap[macro.name]) {
    const map = macroStrSwap[macro.name];
    for (const step of macro.steps) step.bindings = step.bindings.map((b) => map[b] || b);
    counts.macros++;
  }
}

// Serialize preserving the file's stored style: 2-space indent, and every
// non-ASCII char (code > 127) written as a \uXXXX escape. Uses only ASCII
// source (numeric codes) to avoid any literal high-codepoint chars here.
function serialize(o) {
  const s = JSON.stringify(o, null, 2) + '\n';
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    out += code > 127 ? '\\u' + code.toString(16).padStart(4, '0') : s[i];
  }
  return out;
}
writeFileSync(file, serialize(cfg));
console.log('config.json written. Transform counts:', counts);
