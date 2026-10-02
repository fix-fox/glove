package keymapview

import (
	"fmt"
	"regexp"
	"slices"
	"strings"
	"testing"

	"github.com/fix-fox/glove/internal/keymap"
)

func resultFor(t *testing.T, results []SearchResult, target SearchTarget) SearchResult {
	t.Helper()
	for _, result := range results {
		if result.Target == target {
			return result
		}
	}
	t.Fatalf("missing target %+v in %+v", target, results)
	return SearchResult{}
}

func TestSearchReturnsExactNavigationTargetsWithoutParsingLabels(t *testing.T) {
	config := fixture()
	config.Layers[0].Name = "name · position 79 · misleading text"
	for _, query := range []string{"Cmd+C", "⌘C", "LG(C)", "copy", "cop"} {
		results := Search(config, query)
		key := resultFor(t, results, SearchTarget{Kind: "key", LayerIndex: 0, Position: 43})
		if key.Kind != "modifier" || !strings.Contains(key.Description, "LG(C)") {
			t.Fatalf("incorrect chord result: %+v", key)
		}
		resultFor(t, results, definitionTarget("macro", "copy_url"))
		seen := map[SearchTarget]bool{}
		for _, result := range results {
			if seen[result.Target] {
				t.Fatalf("duplicate target: %+v", result)
			}
			seen[result.Target] = true
		}
	}
	resultFor(t, Search(config, "symb"), SearchTarget{Kind: "layer", LayerIndex: 1})
	config.TapDances = []keymap.TapDanceDefinition{{Name: "td_launch", Label: "Launcher", Bindings: []string{"&kp ESC"}}}
	for _, tc := range []struct{ query, kind, name string }{{"copy_u", "macro", "copy_url"}, {"esc_co", "combo", "esc_combo"}, {"bspc_shift", "mod-morph", "mm_bspc_shift_del"}, {"hml_", "hold-tap", "hml_lgui"}, {"launch", "tap-dance", "td_launch"}, {"tri_", "conditional", "tri_layer"}} {
		resultFor(t, Search(config, tc.query), definitionTarget(tc.kind, tc.name))
	}
	for _, query := range []string{"", "  ", "\t\n", "no_match_at_all"} {
		if results := Search(config, query); len(results) != 0 {
			t.Fatalf("unexpected results for %q: %+v", query, results)
		}
	}
}

func TestSearchSupportsSingleCharactersLabelsAndNumericPositions(t *testing.T) {
	config := fixture()
	config.Layers[0].Keys[5].Tap = keymap.Behavior{Type: "kp", KeyCode: "Y"}
	config.Layers[0].Keys[6].Tap = keymap.Behavior{Type: "macro", MacroName: "copy_url"}
	config.Layers[1].Name = "Hebrew"
	config.Layers[1].Keys[1].Tap = keymap.Behavior{Type: "kp", KeyCode: "A"}
	for _, tc := range []struct {
		query  string
		target SearchTarget
	}{{"y", SearchTarget{Kind: "key", LayerIndex: 0, Position: 5}}, {"y", definitionTarget("macro", "copy_url")}, {"copy_u", SearchTarget{Kind: "key", LayerIndex: 0, Position: 6}}, {"ש", SearchTarget{Kind: "key", LayerIndex: 1, Position: 1}}, {"⌘", SearchTarget{Kind: "key", LayerIndex: 0, Position: 34}}, {"f", SearchTarget{Kind: "key", LayerIndex: 0, Position: 10}}, {"34", SearchTarget{Kind: "key", LayerIndex: 0, Position: 34}}} {
		resultFor(t, Search(config, tc.query), tc.target)
	}
	layer := resultFor(t, Search(config, "Heb"), SearchTarget{Kind: "layer", LayerIndex: 1})
	if layer.Kind != "layer" {
		t.Fatalf("wrong layer color kind: %+v", layer)
	}
	macro := resultFor(t, Search(config, "copy_u"), SearchTarget{Kind: "key", LayerIndex: 0, Position: 6})
	if macro.Kind != "macro" {
		t.Fatalf("wrong macro color kind: %+v", macro)
	}
	for _, query := range []string{"backsp", "Backspace"} {
		resultFor(t, Search(config, query), definitionTarget("mod-morph", "mm_bspc_shift_del"))
	}
	config.Layers[0].Keys[7].Tap = keymap.Behavior{Type: "mod_morph", Name: "mm_bspc_shift_del"}
	for _, tc := range []struct{ query, kind string }{{"DEL", "modifier"}, {"BSPC", "key"}, {"⇧⌦", "modifier"}} {
		result := resultFor(t, Search(config, tc.query), SearchTarget{Kind: "key", LayerIndex: 0, Position: 7})
		if result.Kind != tc.kind {
			t.Fatalf("%s uses %s, want %s", tc.query, result.Kind, tc.kind)
		}
	}
}

func TestSearchDescriptionsAreSafeAndTargetsRemainStable(t *testing.T) {
	config := fixture()
	config.Layers[0].Name = "\x1b[31mdefault\x1b[0m\a"
	config.Macros[0].Label = "\x1b]52;c;dGVzdA==\aCopyURL"
	for _, query := range []string{"c", "copy", "COPYURL", "\x1b[31mc\x1b[0m"} {
		results := Search(config, query)
		if len(results) == 0 {
			t.Fatal("sanitized query lost results")
		}
		for _, result := range results {
			if strings.ContainsAny(result.Title+result.Description, "\x1b\a\r\n") {
				t.Fatalf("unsafe result: %+v", result)
			}
		}
	}
}

func TestAllKeyDisplaysUseNumericPositions(t *testing.T) {
	config := fixture()
	aliases := regexp.MustCompile(`\b[LR][CNTMBFH][1-6]\b`)
	for _, command := range []string{"help", "key RM4", "43", "rm LM1", "find C", "combos", "combo esc_combo", "holdtaps", "layer default", "left", "right"} {
		output := Dispatch(config, command, 0, "both").Text
		if aliases.MatchString(output) {
			t.Fatalf("legacy key name in %q: %s", command, output)
		}
	}
	for _, prefix := range []string{"key ", "rm "} {
		matches, _ := Complete(config, prefix)
		if len(matches) != 80 {
			t.Fatalf("missing numeric completions: %v", matches)
		}
		for position, value := range matches {
			if value != fmt.Sprint(position) {
				t.Fatalf("non-numeric completion %q", value)
			}
		}
	}
	snapshot := SnapshotFrom(&keymap.Document{Config: config}, "")
	for _, layer := range snapshot.Layers {
		for position, key := range layer.Keys {
			if key.Name != fmt.Sprint(position) || aliases.MatchString(key.Detail) {
				t.Fatalf("legacy position in %+v", key)
			}
		}
	}
	for position, name := range KeyNames {
		want := "left"
		if strings.HasPrefix(name, "R") {
			want = "right"
		}
		if got := PositionSide(position); got != want {
			t.Fatalf("position %d: got %s want %s", position, got, want)
		}
	}
	for _, position := range []int{-1, 80, 999} {
		if PositionSide(position) != "" {
			t.Fatal("invalid position has a side")
		}
	}
	for _, result := range Search(config, "c") {
		if aliases.MatchString(result.Title + result.Description) {
			t.Fatalf("legacy search position: %+v", result)
		}
	}
	if matches, _ := Complete(config, "key LM"); !slices.Equal(matches, []string{}) {
		t.Fatal(matches)
	}
}

func TestSnapshotColorsEachBehaviorLineByItsActualMeaning(t *testing.T) {
	config := fixture()
	config.Macros = append(config.Macros, keymap.MacroDefinition{Name: "dictation"}, keymap.MacroDefinition{Name: "mod_activate", BindingCells: 1})
	config.HoldTaps = append(config.HoldTaps,
		keymap.HoldTapDefinition{Name: "dict_enter", TapBinding: "&kp", HoldBinding: "&dictation"},
		keymap.HoldTapDefinition{Name: "hml", TapBinding: "&kp", HoldBinding: "&mod_activate"},
		keymap.HoldTapDefinition{Name: "layer_hold", TapBinding: "&kp", HoldBinding: "&mo"})
	for _, tc := range []struct {
		name                         string
		key                          keymap.Key
		tap, hold, tapKind, holdKind string
	}{
		{"plain", keymap.Key{Tap: keymap.Behavior{Type: "kp", KeyCode: "A"}}, "A", "", "key", "empty"},
		{"modifier", keymap.Key{Tap: keymap.Behavior{Type: "kp", KeyCode: "LEFT_CTRL"}}, "⌃", "", "modifier", "empty"},
		{"chord", keymap.Key{Tap: keymap.Behavior{Type: "kp", KeyCode: "LG(C)"}}, "⌘C", "", "modifier", "empty"},
		{"layer", keymap.Key{Tap: keymap.Behavior{Type: "mo", LayerIndex: 1}}, "◇ SYM", "", "layer", "empty"},
		{"macro", keymap.Key{Tap: keymap.Behavior{Type: "macro", MacroName: "dictation"}}, "dictation", "", "macro", "empty"},
		{"home row", keymap.Key{Tap: keymap.Behavior{Type: "hold_tap", Name: "hml", Param1: "LCTRL", Param2: "A"}}, "A", "⌃", "key", "modifier"},
		{"generic hold", keymap.Key{Tap: keymap.Behavior{Type: "hold_tap", Name: "dict_enter", Param1: "0", Param2: "ENTER"}}, "Enter", "dictation", "key", "macro"},
		{"layer hold", keymap.Key{Tap: keymap.Behavior{Type: "hold_tap", Name: "layer_hold", Param1: "1", Param2: "A"}}, "A", "◇ SYM", "key", "layer"},
		{"explicit hold", keymap.Key{Tap: keymap.Behavior{Type: "kp", KeyCode: "A"}, Hold: &keymap.Behavior{Type: "mo", LayerIndex: 1}}, "A", "◇ SYM", "key", "layer"},
		{"morph", keymap.Key{Tap: keymap.Behavior{Type: "mod_morph", Name: "mm_bspc_shift_del"}}, "⌫", "⇧⌦", "key", "modifier"},
		{"morph with layer hold", keymap.Key{Tap: keymap.Behavior{Type: "mod_morph", Name: "mm_bspc_shift_del"}, Hold: &keymap.Behavior{Type: "mo", LayerIndex: 1}}, "⌫", "◇ SYM", "key", "layer"},
		{"transparent", keymap.Key{Tap: keymap.Behavior{Type: "trans"}}, "·", "", "empty", "empty"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			config.Layers[0].Keys[0] = tc.key
			binding := SnapshotFrom(&keymap.Document{Config: config}, "").Layers[0].Keys[0]
			if binding.Tap != tc.tap || binding.Hold != tc.hold || binding.TapKind != tc.tapKind || binding.HoldKind != tc.holdKind {
				t.Fatalf("got %+v, want %q/%q with %s/%s", binding, tc.tap, tc.hold, tc.tapKind, tc.holdKind)
			}
		})
	}
}

func BenchmarkSearchSingleCharacter(b *testing.B) {
	doc, err := keymap.Load("../../config/glove80.keymap")
	if err != nil {
		b.Fatal(err)
	}
	b.ResetTimer()
	for b.Loop() {
		Search(doc.Config, "a")
	}
}
