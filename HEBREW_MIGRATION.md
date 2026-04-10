# Hebrew Layer Migration Plan

Gradual migration of the **hebrew** layer (layer 3, 36% home row) toward
**hebrew-alt** (layer 16, 69% home row) — one swap at a time so muscle memory
adapts incrementally.

26 positions differ. They form two permutation cycles, decomposed into
23 single-key swaps + 1 cleanup, ordered by impact.

Each swap exchanges two keys on the **hebrew** layer (layer 3 in config.json).
Hold behaviors (HRM, layer-tap) stay at their positions — only the tap keycode
changes.

---

## Phase 1 — Home Row Core (steps 1-4)

Move the top-4 frequency letters to home row. After: 53.7% home row.

- [x] **Swap 1: י yod (11.06%) to L-index home**
  Swap pos 38(כ) <-> pos 40(י). Unlocks: י on strongest finger.
  Home row: 36.2% (no net change, but י moves from lt15 to LSHIFT HRM)

- [ ] **Swap 2: ה he (10.87%) to R-index home**
  Swap pos 41(ח) <-> pos 50(ה). Unlocks: הי/יה alternation (3.20% bigram, cross-hand).
  Home row: 44.6% (+8.4%)

- [ ] **Swap 3: ו vav (10.38%) to R-middle home**
  Swap pos 42(ל) <-> pos 29(ו). Unlocks: הו/וה inward roll on right hand (2.29% bigram).
  Home row: 47.6% (+3.0%)

- [ ] **Swap 4: ל lamed (7.39%) to L-middle home**
  Swap pos 37(ג) <-> pos 29(ל). Unlocks: לי outward roll on left hand (0.95% bigram).
  Home row: 53.7% (+6.1%)

---

## Phase 2 — Complete Home Row (steps 5-9)

Fill remaining home row positions. After: 69.0% home row.

- [ ] **Swap 5: א alef (6.34%) to R-ring home**
  Swap pos 43(ך) <-> pos 27(א). Unlocks: וא/או alternation (2.17% bigram).
  Home row: 59.2% (+5.5%)

- [ ] **Swap 6: ר resh (5.61%) to L-ring home**
  Swap pos 36(ד) <-> pos 26(ר). Unlocks: רי roll on left hand.
  Home row: 62.3% (+3.0%)

- [ ] **Swap 7: ב bet (4.74%) to R-inner home**
  Swap pos 40(כ) <-> pos 49(ב). Unlocks: בי cross-hand alternation.
  Home row: 64.3% (+2.0%)

- [ ] **Swap 8: ש shin (4.41%) to R-pinky home**
  Swap pos 44(ף) <-> pos 35(ש). Both on home row, just switching sides.
  Home row: 64.3% (no net change, ש and ף swap sides)

- [ ] **Swap 9: ת tav (5.01%) to L-pinky home**
  Swap pos 35(ף) <-> pos 24(ת). Unlocks: ות cross-hand (2.14% bigram).
  Home row: 69.0% (+4.7%). **Home row complete!**

---

## Phase 3 — Top/Bottom Rows (steps 10-23)

Lower-frequency letters. Can batch 2-3 per session.

*Cycle A (via pos 58 anchor — R-inner bottom, rarely used):*

- [ ] **Swap 10: מ mem (4.59%) to top R-index**
  Swap pos 58(מ) <-> pos 28(ט).

- [ ] **Swap 11: ט to bottom L-middle**
  Swap pos 58(ט) <-> pos 49(כ).

- [ ] **Swap 12: כ kaf (2.70%) to top R-ring**
  Swap pos 58(כ) <-> pos 31(ם).

- [ ] **Swap 13: ם mem-sofit (3.03%) to top L-middle**
  Swap pos 58(ם) <-> pos 25(ק).

- [ ] **Swap 14: ק qof to top L-index**
  Swap pos 58(ק) <-> pos 26(ד).

- [ ] **Swap 15: ד dalet to top R-index**
  Swap pos 58(ד) <-> pos 29(ג).

- [ ] **Swap 16: ג gimel to bottom L-index**
  Swap pos 58(ג) <-> pos 50(ח).

- [ ] **Swap 17: ח het to top L-index + ך final**
  Swap pos 58(ח) <-> pos 27(ך). Both land in final positions.

*Cycle B (via pos 51 then pos 23 anchor — pinky positions):*

- [ ] **Swap 18: נ nun (2.86%) to top L-ring**
  Swap pos 51(נ) <-> pos 24(ף).

- [ ] **Swap 19: ף pe-sofit to bottom L-pinky + ץ final**
  Swap pos 51(ף) <-> pos 23(ץ). ץ lands at final pos 51.

  *(Remaining swaps use pos 23 as anchor)*

- [ ] **Swap 20: ף to bottom L-pinky**
  Swap pos 23(ף) <-> pos 47(ז). ף lands at final pos 47.

- [ ] **Swap 21: ז zayin to top R-middle**
  Swap pos 23(ז) <-> pos 30(ן).

- [ ] **Swap 22: ן nun-sofit to bottom L-ring**
  Swap pos 23(ן) <-> pos 48(ס).

- [ ] **Swap 23: ס samekh + פ pe — final swap**
  Swap pos 23(ס) <-> pos 32(פ). Both land in final positions.

---

## Cleanup

- [ ] **Step 24: Remove duplicate comma**
  Change pos 45 from `APOS`(,) to `trans`.

---

After all 24 steps, the hebrew layer matches hebrew-alt exactly.
At that point, hebrew-alt and its two conditional layers can be removed.
