# Key Display Names Design

## Overview
Improve keycap labels in the keyboard layout UI: use symbols instead of abbreviations, show punctuation characters instead of ZMK codes, make keys square.

## Changes

### Key Shape
Add `aspect-ratio: 1` to KeyCap — perfect squares instead of rectangles.

### `none` behavior
Empty string (like `trans`), light gray background to distinguish from `trans`.

### Key press (`kp`) — use `label` from keycodes.ts
Build a code→label lookup map from `ZMK_KEYCODES`. Examples: N0→0, SEMI→;, DOT→., COMMA→,, FSLH→/, BSLH→\\.

### Arrow keys
UP→▲, DOWN→▼, LEFT→◀, RIGHT→▶

### Control keys
Backspace→⌫, Delete→⌦, Enter→⏎, Space→␣. Keep as words: Tab, Esc, Caps. Abbreviate: PgUp, PgDn, Ins, PrtSc, ScrLk.

### Layer behaviors — symbol + space + layer name
- `mo` → `◇ Base`
- `to` → `⇨ Base`
- `tog` → `⇄ Base`
- `sl` → `◆ Base`

`behaviorLabel()` needs access to layer names from config.

### Modifier keys (Mac-style symbols)
Standalone: LSHIFT→⇧, RSHIFT→⇧R, LCTRL→⌃, RCTRL→⌃R, LALT→⌥, RALT→⌥R, LGUI→⌘, RGUI→⌘R.

Modified key combos: LC(S)→⌃S, LS(FSLH)→⇧/, LA(LC(DEL))→⌥⌃⌦. Modifier wrappers map: LC/RC→⌃, LS/RS→⇧, LA/RA→⌥, LG/RG→⌘.

### Unchanged (for now)
BT, mouse move/scroll/click, RGB, output, boot, reset, caps_word — keep current display.

## Files Changed
- `src/lib/labels.ts` — display logic overhaul
- `src/components/KeyCap.tsx` — aspect-ratio, gray style for `none`
