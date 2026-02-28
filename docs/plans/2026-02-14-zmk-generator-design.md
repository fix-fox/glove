# ZMK Generator Design — Glove80 Configurator

## Context

Phase 2: a pure function that converts `KeyboardConfig` JSON into a complete
ZMK `.keymap` file (Devicetree format). No .keymap parsing — one-way generation only.

## API

```ts
// lib/generator.ts

type GeneratorResult =
  | { ok: true; keymap: string }
  | { ok: false; errors: ValidationError[] };

type ValidationError = {
  path: string;      // e.g., "layers[1].keys[42].tap"
  message: string;   // e.g., "layerIndex 5 out of bounds (max 2)"
};

function generateKeymap(config: KeyboardConfig): GeneratorResult;
```

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Output scope | Full .keymap file (includes, keymap node, behaviors block) | Self-contained output, no external template needed |
| Generation approach | Template literals + behaviorToString helper | Simple, testable, no dependencies |
| Tap/hold inference | hold=layer → `&lt`, hold=kp → `&mt` | User never picks &lt/&mt directly; generator infers from types |
| Validation | Semantic validation before generation | Zod checks structure; generator checks semantics (bounds, combos) |
| Layout formatting | GLOVE80_ROW_LENGTHS constant for physical row grouping | Output looks like a keyboard in diffs |

## Semantic Validation

Runs before generation. Collects all errors (does not bail on first):

| Check | Example error |
|---|---|
| layerIndex in bounds | `layers[1].keys[42].tap: layerIndex 5 out of bounds (max 2)` |
| BT_SEL has profileIndex | `layers[0].keys[79].tap: BT_SEL requires profileIndex` |
| hold type is valid | `layers[0].keys[10]: hold must be kp or layer behavior, got "bootloader"` |
| &mt hold is a modifier | `layers[0].keys[10].hold: mod-tap requires modifier keyCode, got "A"` |

Valid ZMK modifiers for &mt: LSHIFT, RSHIFT, LCTRL, RCTRL, LALT, RALT, LGUI, RGUI.

## Behavior-to-String Mapping

| Key state | ZMK output | Rule |
|---|---|---|
| tap: kp("A"), hold: null | `&kp A` | Simple keypress |
| tap: mo(1), hold: null | `&mo 1` | Momentary layer |
| tap: to(2), hold: null | `&to 2` | Toggle layer |
| tap: sl(1), hold: null | `&sl 1` | Sticky layer |
| tap: trans, hold: null | `&trans` | Transparent |
| tap: none, hold: null | `&none` | Disabled |
| tap: bootloader, hold: null | `&bootloader` | Enter bootloader |
| tap: sys_reset, hold: null | `&sys_reset` | Reset |
| tap: bt(BT_SEL, 2), hold: null | `&bt BT_SEL 2` | BT profile select |
| tap: bt(BT_CLR), hold: null | `&bt BT_CLR` | BT clear |
| tap: kp("SPACE"), hold: mo(1) | `&lt 1 SPACE` | Layer-tap: hold=layer → &lt |
| tap: kp("A"), hold: kp("LSHIFT") | `&mt LSHIFT A` | Mod-tap: hold=kp → &mt |

## Output Structure

```dts
#include <behaviors.dtsi>
#include <dt-bindings/zmk/keys.h>
#include <dt-bindings/zmk/bt.h>

/ {
    keymap {
        compatible = "zmk,keymap";

        base {
            bindings = <
                &kp A  &kp B  &kp C  ...   // formatted in physical rows
            >;
        };
    };
};
```

### Layer name sanitization

1. Lowercase
2. Replace non-alphanumeric with `_`
3. Collapse consecutive underscores
4. Prefix with `layer_` if starts with digit

Example: `"2nd Layer!"` → `layer_2nd_layer`

### Physical row formatting

A `GLOVE80_ROW_LENGTHS` constant chunks the 80 bindings into rows matching
the physical keyboard layout. Output is human-readable in diffs and GitHub.

## File Layout

- `lib/generator.ts` — generator function, validation, helpers
- `lib/generator.test.ts` — unit tests

## Test Cases

- Each behavior type generates correct string
- Tap+hold infers &lt / &mt correctly
- Semantic validation: out-of-bounds layerIndex
- Semantic validation: BT_SEL without profileIndex
- Semantic validation: invalid hold (e.g., hold = bootloader)
- Semantic validation: &mt with non-modifier keyCode
- Full config → valid .keymap string
- Layer name sanitization (spaces, digits, special chars)
