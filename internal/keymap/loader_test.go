package keymap

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func keymapText(first, header, extra string) string {
	transparent := strings.TrimSpace(strings.Repeat("&trans ", 79))
	return header + "\n/ {\n" + extra + "\nkeymap { compatible = \"zmk,keymap\";\nbase { bindings = <" + first + " " + transparent + ">; };\nnav { bindings = <&none " + transparent + ">; };\n};\n};\n"
}

func writeFile(t testing.TB, path, source string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(source), 0640); err != nil {
		t.Fatal(err)
	}
}

func loadText(t testing.TB, source string) (*Document, error) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "test.keymap")
	writeFile(t, path, source)
	return Load(path)
}

func mustLoad(t testing.TB, source string) *Document {
	t.Helper()
	doc, err := loadText(t, source)
	if err != nil {
		t.Fatal(err)
	}
	return doc
}

func assertError(t testing.TB, err error, fragment string) {
	t.Helper()
	if err == nil || !strings.Contains(err.Error(), fragment) {
		t.Fatalf("expected error containing %q, got %v", fragment, err)
	}
}

func TestCurrentConfigPreservesRemovedKeysLabelsAndSharedTiming(t *testing.T) {
	doc, err := Load("../../config/glove80.keymap")
	if err != nil {
		t.Fatal(err)
	}
	if len(doc.Config.Layers) != 18 {
		t.Fatalf("got %d layers", len(doc.Config.Layers))
	}
	for _, pos := range []int{1, 65, 66, 67, 68, 77, 78} {
		if got := doc.Config.Layers[0].Keys[pos]; !reflect.DeepEqual(got, Key{Tap: Behavior{Type: "none"}}) {
			t.Errorf("position %d: %#v", pos, got)
		}
	}
	if doc.Config.Layers[15].Name != "Apps" {
		t.Errorf("Apps annotation lost")
	}
	var copyLabel string
	for _, macro := range doc.Config.Macros {
		if macro.Name == "copy_url" {
			copyLabel = macro.Label
		}
	}
	if copyLabel != "COPY_URL" {
		t.Errorf("copy_url annotation lost")
	}
	want := Key{Tap: Behavior{Type: "mod_morph", Name: "mm_bspc_shift_del"}, Hold: &Behavior{Type: "mo", LayerIndex: 14}}
	if got := doc.Config.Layers[0].Keys[69]; !reflect.DeepEqual(got, want) {
		t.Errorf("layer-tap morph: got %#v", got)
	}
	var left, tmux HoldTapDefinition
	for _, definition := range doc.Config.HoldTaps {
		if definition.Name == "hml" {
			left = definition
		}
		if definition.Name == "hml_ctrl_a" {
			tmux = definition
		}
	}
	if len(left.HoldTriggerKeyPositions) == 0 || !reflect.DeepEqual(left.HoldTriggerKeyPositions, tmux.HoldTriggerKeyPositions) {
		t.Errorf("shared cross-hand triggers diverged")
	}
	if left.TappingTermMs != 280 || left.QuickTapMs == nil || *left.QuickTapMs != 0 || left.RequirePriorIdleMs == nil || *left.RequirePriorIdleMs != 100 {
		t.Errorf("shared timing differs: %+v", left)
	}
}

func TestIncludesNestedConstantsAndPropertyGroupsRetainUseSite(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "test.keymap")
	writeFile(t, filepath.Join(directory, "settings.h"), "#define NAV 1\n#define TARGET NAV\n#define LAYER_BASE 0\n#define LAYER_NAV NAV\n#define BOTH \\\n compatible = \"zmk,behavior-hold-tap\"; \\\n #binding-cells = <2>;\n")
	extra := `behaviors { held: held { BOTH flavor = "balanced"; tapping-term-ms = <200>; bindings = <&mo>, <&kp>; }; };`
	source := keymapText("&to TARGET", `#include "settings.h"`, extra)
	writeFile(t, path, source)
	doc, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if doc.Config.HoldTaps[0].TappingTermMs != 200 || doc.Config.Layers[0].Keys[0].Tap != (Behavior{Type: "to", LayerIndex: 1}) {
		t.Fatalf("bad expansion: %+v", doc.Config)
	}
	b := doc.Bindings[0][0]
	if source[b.Start:b.End] != "&to TARGET" || !b.Editable || len(doc.Sources) != 2 {
		t.Fatalf("source reference lost: %+v", b)
	}
}

func TestNestedModifierCallsAnnotationsAndCommentedDirectives(t *testing.T) {
	doc := mustLoad(t, strings.Replace(keymapText("&kp LC(LG(Q))", "", ""), "base {", "// @label Main layer\nbase {", 1))
	if doc.Config.Layers[0].Name != "Main layer" || doc.Config.Layers[0].Keys[0].Tap.KeyCode != "LC(LG(Q))" {
		t.Fatalf("lost annotation or nested modifiers")
	}
	doc = mustLoad(t, keymapText("&kp /* &bad Z */ A", "/*\n#include \"missing.h\"\n*/\n// #define A BAD", ""))
	if doc.Config.Layers[0].Keys[0].Tap.KeyCode != "A" {
		t.Fatal("comment changed binding")
	}
}

func TestBOMAndNonbreakingLabelWhitespacePreserveNamesAndByteRanges(t *testing.T) {
	source := "\uFEFF" + strings.TrimPrefix(keymapText("&kp A", "", ""), "\n")
	source = strings.Replace(source, "base {", "// @label \u00A0Main\u00A0\nbase {", 1)
	doc := mustLoad(t, source)
	if doc.Config.Layers[0].Name != "Main" {
		t.Fatalf("nonbreaking label whitespace retained: %q", doc.Config.Layers[0].Name)
	}
	binding := doc.Bindings[0][0]
	if got := source[binding.Start:binding.End]; got != "&kp A" {
		t.Fatalf("BOM changed binding byte offsets: %q", got)
	}
}

func TestPrecisionMovementUsesExpandedSign(t *testing.T) {
	for _, tc := range []struct{ binding, direction string }{
		{"&mmv MOVE_X(-SPEED)", "MOVE_LEFT"}, {"&mmv MOVE_X(SPEED)", "MOVE_RIGHT"}, {"&mmv MOVE_Y(-SPEED)", "MOVE_UP"}, {"&mmv MOVE_Y(SPEED)", "MOVE_DOWN"}, {"&mmv MOVE_X(-0)", "MOVE_RIGHT"},
	} {
		t.Run(tc.binding, func(t *testing.T) {
			doc := mustLoad(t, keymapText(tc.binding, "#define SPEED 300", ""))
			if got := doc.Config.Layers[0].Keys[0].Tap; got != (Behavior{Type: "mmv", Direction: tc.direction, Precision: true}) {
				t.Fatalf("got %+v", got)
			}
		})
	}
}

func TestInvalidBindingsReportSourceContext(t *testing.T) {
	for _, tc := range []struct{ binding, error string }{
		{"&not_defined", "Unknown behavior"}, {"&kp", "expects 1 arguments"}, {"&none A", "expects 0 arguments"}, {"&to 2", "Layer index out of range"}, {"&to UNDEFINED", "Expected a decimal"}, {"&to 01", "without leading zeroes"}, {"&kp LC(A", "Unclosed parenthesized"},
		{"&bt NOPE", "Unknown Bluetooth action"}, {"&bt BT_SEL", "expects 2 arguments"}, {"&bt BT_DISC -1", "Expected a decimal"}, {"&out BAD", "Unknown output"}, {"&macro_tap", "cannot be used directly"},
		{"&bt BT_SEL 9007199254740992", "Integer out of range"}, {"&bt BT_SEL 0x20000000000000", "Integer out of range"}, {"&bt BT_SEL 9999999999999999999999999999", "Integer out of range"},
	} {
		t.Run(tc.binding, func(t *testing.T) {
			_, err := loadText(t, keymapText(tc.binding, "", ""))
			assertError(t, err, tc.error)
			assertError(t, err, "test.keymap:")
		})
	}
}

func TestUnsupportedPreprocessing(t *testing.T) {
	for _, tc := range []struct{ header, error string }{
		{"#if 1\n#endif", "Unsupported directive"}, {"#define F(x) x", "Unsupported directive"}, {"#include <unknown.dtsi>", "Unsupported system include"}, {"#define A B\n#define B A", "Recursive constant"}, {"#define X 1\n#define X 2", "Duplicate constant"}, {"#define LAYER_BASE 1", "must equal declaration index 0"},
	} {
		t.Run(tc.header, func(t *testing.T) {
			_, err := loadText(t, keymapText("&kp A", tc.header, ""))
			assertError(t, err, tc.error)
		})
	}
	for _, tc := range []struct{ first, error string }{
		{"&kp A // comment \\\n&kp B", "Line continuations inside comments"}, {"&kp \\\nA", "Line continuations are supported only"}, {"&kp /* comment \\\n */ A", "Line continuations inside comments"},
	} {
		t.Run(tc.first, func(t *testing.T) { _, err := loadText(t, keymapText(tc.first, "", "")); assertError(t, err, tc.error) })
	}
}

func TestIncludeCyclesDuplicatesAndMissingFiles(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "test.keymap")
	settings := filepath.Join(directory, "settings.h")
	writeFile(t, settings, "#include \"test.keymap\"\n")
	writeFile(t, path, keymapText("&kp A", `#include "settings.h"`, ""))
	_, err := Load(path)
	assertError(t, err, "Include cycle")
	writeFile(t, settings, "#define SOME_VALUE 1\n")
	writeFile(t, path, keymapText("&kp A", "#include \"settings.h\"\n#include \"settings.h\"", ""))
	_, err = Load(path)
	assertError(t, err, "Duplicate include")
	writeFile(t, path, keymapText("&kp A", `#include "missing.h"`, ""))
	doc, err := Load(path)
	if doc != nil || !os.IsNotExist(err) {
		t.Fatalf("missing include must return no document: %v %v", doc, err)
	}
}

func TestAbsoluteIncludePathsAndCRLFDirectives(t *testing.T) {
	directory := t.TempDir()
	settings := filepath.Join(directory, "settings.h")
	writeFile(t, settings, "#define TARGET \\\r\n 1\r\n")
	doc := mustLoad(t, keymapText("&to TARGET", "#include \""+settings+"\"", ""))
	if doc.Config.Layers[0].Keys[0].Tap.LayerIndex != 1 || len(doc.Sources) != 2 {
		t.Fatal("absolute include or CRLF continuation was lost")
	}
}

func TestMalformedAndUnknownNodeContent(t *testing.T) {
	base := keymapText("&kp A", "", "")
	for _, tc := range []struct{ name, text, error string }{
		{"wrong layer size", keymapText("&none &none", "", ""), "needs 80 bindings, got 81"},
		{"duplicate property", strings.Replace(base, "base {", "base { bindings = <&none>;", 1), "Duplicate property"},
		{"duplicate node", strings.Replace(base, "nav {", "base {", 1), "Duplicate node"},
		{"unknown property", strings.Replace(base, "base {", "base { typo = <3>;", 1), "Unsupported property typo"},
		{"unclosed node", base[:len(base)-4], "Unclosed node"},
		{"nested layer", strings.Replace(base, "base {", "base { hidden { flag; };", 1), "Nested layer"},
		{"duplicate display names", strings.Replace(base, "nav {", "// @label BASE\nnav {", 1), "Duplicate layer name"},
		{"bad root property", strings.Replace(base, "/ {", "/ { flag;", 1), "Unsupported property flag"},
		{"unsupported section", keymapText("&kp A", "", "unknown { };"), "Unsupported section"},
		{"bad compatible", strings.Replace(base, "zmk,keymap", "not,keymap", 1), "Expected compatible"},
		{"missing root", `keymap { compatible = "zmk,keymap"; };`, "Expected one root"},
		{"two roots", base + "/ {};", "Expected one root"},
		{"missing keymap", "/ {};", "Missing keymap"},
		{"zero layers", `/ { keymap { compatible = "zmk,keymap"; }; };`, "at least one layer"},
		{"unclosed comment", base + "/*", "Unterminated comment"},
		{"unclosed string", strings.Replace(base, `"zmk,keymap"`, `"zmk,keymap`, 1), "Unterminated string"},
		{"unsupported punctuation", base + "!", "Unsupported character"},
		{"empty property", strings.Replace(base, "bindings = <&kp A", "bindings = ; flag = <&kp A", 1), "Empty value"},
		{"missing semicolon", strings.Replace(base, "; };", " };", 1), "Missing semicolon"},
	} {
		t.Run(tc.name, func(t *testing.T) { _, err := loadText(t, tc.text); assertError(t, err, tc.error) })
	}
}

func TestBuiltinLayerTapOverrideAndCustomLayerArguments(t *testing.T) {
	header := `&lt { flavor = "balanced"; tapping-term-ms = <200>; quick-tap-ms = <0>; };`
	doc := mustLoad(t, keymapText("&lt 1 A", header, ""))
	if doc.Config.HoldTaps[0].Name != "lt" || doc.Config.Layers[0].Keys[0].Hold.LayerIndex != 1 {
		t.Fatal("lost inherited layer tap")
	}
	for _, tc := range []struct{ header, error string }{
		{strings.Replace(header, "quick-tap-ms = <0>;", "#binding-cells = <0>;", 1), "cannot be changed"},
		{strings.Replace(header, "quick-tap-ms = <0>;", "bindings = <&mo>, <&kp>;", 1), "Changing built-in &lt bindings"},
		{header + header, "Duplicate &lt override"}, {strings.Replace(header, "&lt", "&mt", 1), "Only the built-in &lt override"},
	} {
		_, err := loadText(t, keymapText("&none", tc.header, ""))
		assertError(t, err, tc.error)
	}
	extra := `behaviors { magic: magic { compatible = "zmk,behavior-hold-tap"; #binding-cells = <2>; flavor = "balanced"; tapping-term-ms = <200>; bindings = <&mo>, <&kp>; }; };`
	_, err := loadText(t, keymapText("&magic 999 A", "", extra))
	assertError(t, err, "Layer index out of range")
	doc = mustLoad(t, keymapText("&magic 1 A", "", extra))
	if got := doc.Config.Layers[0].Keys[0].Tap; got.Type != "hold_tap" || got.Param1 != "1" || got.Param2 != "A" {
		t.Fatalf("magic convention lost: %+v", got)
	}
	extra = strings.ReplaceAll(extra, "magic", "held")
	doc = mustLoad(t, keymapText("&held 1 A", "", extra))
	if doc.Config.Layers[0].Keys[0].Tap.KeyCode != "A" || doc.Config.Layers[0].Keys[0].Hold.LayerIndex != 1 {
		t.Fatal("custom layer tap not expanded")
	}
}

func TestDefinitionValidation(t *testing.T) {
	morph := `behaviors { morph: morph { compatible = "zmk,behavior-mod-morph"; #binding-cells = <0>; bindings = <&kp A>, <&missing>; mods = <(MOD_LSFT|MOD_RSFT)>; }; };`
	for _, tc := range []struct{ extra, error string }{
		{morph, "Unknown behavior"}, {strings.Replace(morph, "<0>", "<1>", 1), "Wrong #binding-cells"},
		{strings.Replace(morph, "morph: morph", "morph", 1), "Behavior needs a node label"},
		{strings.Replace(morph, "morph: morph", "kp: morph", 1), "Duplicate or reserved"},
		{strings.Replace(morph, "mod-morph", "unknown", 1), "Unsupported behavior compatible"},
		{strings.Replace(morph, "&missing", "&kp B", 1) + strings.Replace(morph, "behaviors", "macros", 1), "Duplicate or reserved"},
		{strings.Replace(morph, "#binding-cells", "hidden { }; #binding-cells", 1), "Nested behavior"},
		{strings.Replace(strings.Replace(morph, "&missing", "&kp B", 1), "MOD_LSFT", "MOD_OTHER", 1), "Expected modifier flags"},
		{strings.Replace(morph, ", <&missing>", "", 1), "Mod-morph requires two"},
	} {
		t.Run(tc.error, func(t *testing.T) {
			_, err := loadText(t, keymapText("&none", "", tc.extra))
			assertError(t, err, tc.error)
		})
	}
	valid := strings.Replace(morph, "&missing", "&kp B", 1)
	doc := mustLoad(t, keymapText("&morph", "", valid))
	if doc.Config.ModMorphs[0].MorphBinding != "&kp B" || !reflect.DeepEqual(doc.Config.ModMorphs[0].Mods, []string{"MOD_LSFT", "MOD_RSFT"}) {
		t.Fatal("morph definition differs")
	}
}

func TestMacroParameterControlsAndCycles(t *testing.T) {
	extra := `macros { one: one { compatible = "zmk,behavior-macro-one-param"; #binding-cells = <1>; bindings = <&macro_param_2to1>, <&macro_tap &kp MACRO_PLACEHOLDER>; }; };`
	_, err := loadText(t, keymapText("&one A", "", extra))
	assertError(t, err, "exceeds #binding-cells")
	valid := strings.Replace(extra, "macro_param_2to1", "macro_param_1to1", 1)
	doc := mustLoad(t, keymapText("&one A", "", valid))
	if doc.Config.Macros[0].BindingCells != 1 || doc.Config.Layers[0].Keys[0].Tap.Param != "A" {
		t.Fatal("macro arity/argument lost")
	}
	two := strings.ReplaceAll(strings.Replace(valid, "macro-one-param", "macro-two-param", 1), "<1>", "<2>")
	doc = mustLoad(t, keymapText("&one A B", "", two))
	if doc.Config.Macros[0].BindingCells != 2 || doc.Config.Layers[0].Keys[0].Tap.Param2 != "B" {
		t.Fatal("two-parameter macro lost")
	}
	loop := `macros { loop: loop { compatible = "zmk,behavior-macro"; #binding-cells = <0>; bindings = <&macro_tap &loop>; }; };`
	_, err = loadText(t, keymapText("&loop", "", loop))
	assertError(t, err, "Recursive behavior reference")
	indirect := `macros { first: first { compatible = "zmk,behavior-macro"; #binding-cells = <0>; bindings = <&macro_tap &second>; }; second: second { compatible = "zmk,behavior-macro"; #binding-cells = <0>; bindings = <&macro_tap &first>; }; };`
	_, err = loadText(t, keymapText("&first", "", indirect))
	assertError(t, err, "Recursive behavior reference")
}

func TestComboAndConditionalDefinitionsValidateIndicesAndNesting(t *testing.T) {
	combo := `combos { compatible = "zmk,combos"; combo { key-positions = <0 1>; bindings = <&kp A>; timeout-ms = <0>; require-prior-idle-ms = <25>; layers = <0 1>; }; };`
	conditional := `conditional_layers { compatible = "zmk,conditional-layers"; conditional { if-layers = <0 1>; then-layer = <1>; }; };`
	doc := mustLoad(t, keymapText("&none", "", combo+conditional))
	if doc.Config.Combos[0].TimeoutMs == nil || *doc.Config.Combos[0].TimeoutMs != 0 || doc.Config.Combos[0].RequirePriorIdleMs == nil || *doc.Config.Combos[0].RequirePriorIdleMs != 25 || !reflect.DeepEqual(doc.Config.Combos[0].Layers, []int{0, 1}) || doc.Config.ConditionalLayers[0].ThenLayer != 1 {
		t.Fatal("combo/conditional data lost")
	}
	for _, tc := range []struct{ extra, error string }{
		{strings.Replace(combo, "combo {", "combo { hidden { value; };", 1), "Nested combo"},
		{strings.Replace(conditional, "conditional {", "conditional { hidden { value; };", 1), "Nested conditional"},
		{strings.Replace(combo, "key-positions = <0 1>", "key-positions = <0 0>", 1), "distinct valid key positions"},
		{strings.Replace(combo, "key-positions = <0 1>", "key-positions = <0 80>", 1), "distinct valid key positions"},
		{strings.Replace(combo, "layers = <0 1>", "layers = <0 2>", 1), "Combo layer index out of range"},
		{strings.Replace(conditional, "then-layer = <1>", "then-layer = <2>", 1), "Conditional layer indices"},
		{strings.Replace(conditional, "if-layers = <0 1>", "if-layers = <0>", 1), "Conditional layer indices"},
	} {
		t.Run(tc.error, func(t *testing.T) {
			_, err := loadText(t, keymapText("&none", "", tc.extra))
			assertError(t, err, tc.error)
		})
	}
}

func TestBuiltinBehaviorShapesAndSafeIntegerBoundary(t *testing.T) {
	profile := 0
	for _, tc := range []struct {
		binding string
		key     Key
	}{
		{"&kp A", Key{Tap: Behavior{Type: "kp", KeyCode: "A"}}},
		{"&to 0", Key{Tap: Behavior{Type: "to", LayerIndex: 0}}},
		{"&sl 0x1", Key{Tap: Behavior{Type: "sl", LayerIndex: 1}}},
		{"&tog 1", Key{Tap: Behavior{Type: "tog", LayerIndex: 1}}},
		{"&lt 1 SPACE", Key{Tap: Behavior{Type: "kp", KeyCode: "SPACE"}, Hold: &Behavior{Type: "mo", LayerIndex: 1}}},
		{"&mt LCTRL A", Key{Tap: Behavior{Type: "kp", KeyCode: "A"}, Hold: &Behavior{Type: "kp", KeyCode: "LCTRL"}}},
		{"&bootloader", Key{Tap: Behavior{Type: "bootloader"}}},
		{"&sys_reset", Key{Tap: Behavior{Type: "sys_reset"}}},
		{"&caps_word", Key{Tap: Behavior{Type: "caps_word"}}},
		{"&bt BT_SEL 0", Key{Tap: Behavior{Type: "bt", Action: "BT_SEL", ProfileIndex: &profile}}},
		{"&bt BT_CLR", Key{Tap: Behavior{Type: "bt", Action: "BT_CLR"}}},
		{"&rgb_ug RGB_TOG", Key{Tap: Behavior{Type: "rgb_ug", Action: "RGB_TOG"}}},
		{"&out OUT_USB", Key{Tap: Behavior{Type: "out", Action: "OUT_USB"}}},
		{"&mmv MOVE_LEFT", Key{Tap: Behavior{Type: "mmv", Direction: "MOVE_LEFT"}}},
		{"&msc SCRL_DOWN", Key{Tap: Behavior{Type: "msc", Direction: "SCRL_DOWN"}}},
		{"&mkp LCLK", Key{Tap: Behavior{Type: "mkp", Button: "LCLK"}}},
	} {
		t.Run(tc.binding, func(t *testing.T) {
			doc := mustLoad(t, keymapText(tc.binding, "", ""))
			if got := doc.Config.Layers[0].Keys[0]; !reflect.DeepEqual(got, tc.key) {
				t.Fatalf("got %+v want %+v", got, tc.key)
			}
		})
	}
	doc := mustLoad(t, keymapText("&bt BT_SEL 9007199254740991", "", ""))
	if *doc.Config.Layers[0].Keys[0].Tap.ProfileIndex != 9007199254740991 {
		t.Fatal("safe integer boundary changed")
	}
}

// FuzzLoadRejectsMalformedSource exercises the parser without hiding runtime panics.
func FuzzLoadRejectsMalformedSource(f *testing.F) {
	for _, seed := range []string{"", "/ {};", "&", "/*", `#define A A`, keymapText("&kp A", "", ""), keymapText("&kp LC(A", "", ""), keymapText("&kp A", "", `behaviors { x: x { compatible = "zmk,behavior-hold-tap"; #binding-cells = <2>; }; };`)} {
		f.Add(seed)
	}
	directory := f.TempDir()
	path := filepath.Join(directory, "fuzz.keymap")
	f.Fuzz(func(t *testing.T, source string) {
		if len(source) > 32768 || strings.Contains(source, "#include") {
			t.Skip()
		}
		writeFile(t, path, source)
		doc, err := Load(path)
		if err != nil && doc != nil {
			t.Fatal("failure returned partial document")
		}
		if err == nil {
			for _, layer := range doc.Config.Layers {
				if len(layer.Keys) != KeyCount {
					t.Fatal("accepted invalid layer size")
				}
			}
		}
	})
}
