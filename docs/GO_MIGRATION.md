# Go migration coverage

The production app uses Go, Bubble Tea v2, Bubbles, and Lip Gloss. Studio with
tiled keys is the only design. The native files in `config/` remain authoritative
and unchanged by this migration. The TypeScript REPL, Node bridge, alternative
prototype layouts, and their build dependencies have been removed.

## Preserved behavior

Before deleting TypeScript, a comparison of both loaders matched the complete
18-layer document: all 1,440 keys, every definition field, source texts, resolved
include paths, and binding byte ranges. A second comparison matched all display
fields for the 1,440 keys and 46 definitions. Its only two differences were the
label and detail for `BT_CLR_ALL`, which now correctly display `BT CLR_ALL`
instead of the old `BT PRV` fallback.

The native tests preserve the old behavior assertions as follows. Test counts
are not used as a substitute for checking accepting and rejecting paths.

| Previous assertions | Native coverage |
| --- | --- |
| Loader acceptance, directives, includes, definitions, numeric and reference validation, diagnostics | `internal/keymap/loader_test.go` |
| Literal edits, shared definitions, comments, stale sources and symlinks, candidate validation, atomic writes | `internal/keymap/edit_test.go` |
| Labels, keycode aliases, Hebrew, nested modifiers, mod-morphs, physical geometry | `internal/keymapview/labels_test.go`, including 744 frozen label cases captured independently from the old implementation |
| Chord parsing, reverse lookup, concept aliases, completion | `internal/keymapview/query_test.go` |
| Commands, valid and invalid arguments, layer context, definition lists and details | `internal/keymapview/dispatch_test.go` |
| Dictation, semantic snapshots, source locations, editability, terminal text sanitization | `internal/keymapview/snapshot_test.go` |
| One-shot and piped CLI, error exit status, startup failure, reload recovery, stale edit rejection, editor and flash dispatch | `cmd/glove/main_test.go` |
| Editor command quoting, literal arguments, environment precedence, invalid commands | `internal/editor/command_test.go` |
| All 12 firmware script scenarios, including validation failure before build and local/remote flows | `internal/firmware/flash_test.go` |
| Prototype input, asynchronous filtering, action confirmation, last valid config | `cmd/glove/model_test.go` |

The parser additionally tests UTF-8 byte offsets, BOMs, Unicode label whitespace,
zero versus absent timing values, malformed candidates, recursion limits, and
numeric boundaries. A 30-second malformed-input fuzz run completed 2,054 cases
without a panic. An independent review checked 67 differential parser fixtures
and atomic edits involving Unicode, file modes, stale includes, and retargeted
symlinks. Its BOM and Unicode label findings were fixed with regressions.

## Replaced contracts

The user approved a new interface, so the old boxed REPL renderer's alignment,
stretching, legend, and color-helper assertions no longer describe the product.
The new frame tests cover every physical key at five terminal sizes, every
layer and keyboard half at three sizes, Unicode cell widths, geometry-based
navigation, scrolling that keeps the selected row visible, and the last line of
long results. Plain CLI layer output checks every key in a full board or half
without truncating labels or hold actions.

The JSON bridge and revision-token protocol no longer exist. Go holds the
loaded document directly. Parser edit tests cover stale content and include
destinations; app tests cover last-valid state and failed reload recovery.
Fractional edit indices are unrepresentable by the Go API's integer arguments.

New launcher tests cover incremental builds, source and binary manifests,
source changes during a build, missing Go, changed or removed source files,
symlink invocation, and propagation of arguments and exit status.

## Run the checks

```sh
make check
go test -race ./...
go test ./internal/keymap -run '^$' -fuzz FuzzLoad -fuzztime 30s
```

Firmware tests use stubbed tools and volumes. They do not flash hardware.
The native reader validates the supported configuration subset; a ZMK build
remains the final check for firmware correctness.
