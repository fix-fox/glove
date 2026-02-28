# Manual Testing Checklist

## Import / Export
- [ ] Import .keymap — import actual glove80.keymap, verify all 15 layers appear with correct names
- [ ] Import JSON — export as JSON, then re-import it, verify nothing changes
- [ ] Export .keymap — open the export dialog, verify the generated keymap looks correct
- [ ] Download Repo (.zip) — verify it contains build.yaml, config/west.yml, config/glove80.keymap, .github/workflows/build.yml
- [ ] Export JSON — download and inspect the JSON

## Behavior Types (Phase 7)
- [ ] Assign tog to a key, verify it appears in export as &tog N
- [ ] Assign caps_word, rgb_ug, out, mmv, msc, mkp — verify each works in the picker and exports correctly
- [ ] Verify glove80.conf with CONFIG_ZMK_POINTING=y appears in the repo zip only when mouse behaviors are present

## Modified Key Codes (Phase 8)
- [ ] Select a kp behavior, toggle modifier buttons (LC, LA, LS, LG, etc.)
- [ ] Verify key code displays as LC(A), LA(LC(V)) etc.
- [ ] Verify toggling a modifier off unwraps correctly

## Editors (Phases 9-11)
- [ ] Macros — open dialog, add/edit/delete a macro, add steps with different directives
- [ ] Behaviors — open dialog, add a mod-morph and a hold-tap, fill in all fields
- [ ] Combos — open dialog, add a combo with key positions and binding
- [ ] Cond. Layers — open dialog, add a conditional layer rule
- [ ] After importing keymap: verify imported definitions (22 macros, 2 mod-morphs, 14 hold-taps, 4 combos, 2 conditional layers)

## SSR Bug Fix
- [ ] Page loads without console errors (no infinite loop / getServerSnapshot error)
- [ ] Open each editor dialog without triggering crash

## Round-trip
- [ ] Import .keymap → Export .keymap → compare output semantically against original
