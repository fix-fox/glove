# Domain Model Design — Glove80 Configurator

## Context

Phase 1 domain modeling for a ZMK visual editor. JSON-first: app state is JSON,
ZMK Devicetree is only generated as a final export string. No .keymap parsing.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Behavior modeling | Discriminated union (z.literal per type) | Type-safe, idiomatic Zod, clean error messages |
| Phase 1 behaviors | kp, mo, to, sl, trans, none, bootloader, sys_reset, bt | Minimal viable set + safety (bootloader/reset) + layer switching (to/sl) + BT profiles |
| Key model | `{ tap, hold }` | Forward-compatible with &mt/&lt even though hold is null in Phase 1 |
| Key count | `.length(80)` on array | Enforces Glove80 layout. Avoids z.tuple perf trap with 80 elements |
| Key position | Index-based (0-79) | Physical layout is fixed; separate layout map handles rendering |
| Layer ID | UUID | Stable React keys for list rendering |
| Key codes | Unvalidated string | Enum validation deferred to key picker UI phase |
| Schema version | Literal `1` | Enables future migrations |

## Schema Structure

```
KeyboardConfig
  ├── name: string
  ├── version: 1
  └── layers: Layer[]  (min 1)
        ├── id: uuid
        ├── name: string
        └── keys: Key[80]
              ├── tap: Behavior
              └── hold: Behavior | null
                    └── discriminatedUnion("type"):
                          kp       { keyCode: string }
                          mo       { layerIndex: int >= 0 }
                          to       { layerIndex: int >= 0 }
                          sl       { layerIndex: int >= 0 }
                          trans    {}
                          none     {}
                          bootloader {}
                          sys_reset  {}
                          bt       { action: BT_SEL|BT_CLR|BT_NXT|BT_PRV, profileIndex?: 0-4 }
```

## Known Risks

### Layer index invalidation

`layerIndex` in mo/to/sl behaviors is a positional index into the `layers` array.
Deleting or reordering layers will silently break these references.

**Phase 1 mitigation:** None — users must manually fix references after layer operations.

**Future fix:** Replace `layerIndex: number` with `layerId: string` (UUID reference).
The ZMK generator would resolve UUIDs to positional indices at export time.
This is a schema v2 migration.
