package keymapview

import (
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/fix-fox/glove/internal/keymap"
)

func fixture() keymap.Keymap {
	emptyKeys := func() []keymap.Key {
		keys := make([]keymap.Key, 80)
		for i := range keys {
			keys[i].Tap.Type = "none"
		}
		return keys
	}
	keys := emptyKeys()
	keys[0].Tap.Type = "trans"
	keys[10] = keymap.Key{Tap: keymap.Behavior{Type: "kp", KeyCode: "F5"}, Hold: &keymap.Behavior{Type: "mo", LayerIndex: 1}}
	keys[20].Tap = keymap.Behavior{Type: "kp", KeyCode: "C"}
	keys[34].Tap = keymap.Behavior{Type: "hold_tap", Name: "hml_lgui", Param1: "LGUI", Param2: "A"}
	keys[43].Tap = keymap.Behavior{Type: "kp", KeyCode: "LG(C)"}
	return keymap.Keymap{
		Layers:            []keymap.Layer{{Name: "default", Keys: keys}, {Name: "symbols", Keys: emptyKeys()}, {Name: "system", Keys: emptyKeys()}},
		Macros:            []keymap.MacroDefinition{{Name: "copy_url", Label: "CopyURL", Steps: []keymap.MacroStep{{Directive: "tap", Bindings: []string{"&kp LG(L)"}}, {Directive: "tap", Bindings: []string{"&kp", "LG(C)"}}}}},
		Combos:            []keymap.ComboDefinition{{Name: "esc_combo", KeyPositions: []int{22, 23}, Binding: "&kp ESC"}},
		ModMorphs:         []keymap.ModMorphDefinition{{Name: "mm_bspc_shift_del", DefaultBinding: "&kp BSPC", MorphBinding: "&kp DEL", Mods: []string{"MOD_LSFT"}}},
		HoldTaps:          []keymap.HoldTapDefinition{{Name: "hml_lgui", Flavor: "balanced", TappingTermMs: 280, HoldBinding: "&kp", TapBinding: "&kp"}},
		ConditionalLayers: []keymap.ConditionalLayerDefinition{{Name: "tri_layer", IfLayers: []int{1, 2}, ThenLayer: 2}},
	}
}

func TestLayerAndPositionResolution(t *testing.T) {
	config := fixture()
	for _, tc := range []struct {
		ref        string
		index      int
		errorParts []string
	}{{"1", 1, nil}, {"SYMBOLS", 1, nil}, {"def", 0, nil}, {"3", 0, []string{"out of range"}}, {"sy", 0, []string{"Ambiguous", "symbols", "system"}}, {"nope", 0, []string{"Unknown", "default"}}, {"999999999999999999999999999", 0, []string{"out of range"}}} {
		got, err := ResolveLayer(config, tc.ref)
		if len(tc.errorParts) == 0 {
			if err != nil || got != tc.index {
				t.Errorf("%s: got %d, %v", tc.ref, got, err)
			}
		} else {
			if err == nil {
				t.Fatalf("accepted %s", tc.ref)
			}
			for _, part := range tc.errorParts {
				if !strings.Contains(err.Error(), part) {
					t.Errorf("missing %s: %v", part, err)
				}
			}
		}
	}
	for ref, want := range map[string]int{"43": 43, "0": 0, "79": 79, "lm1": 34, "RM4": 43} {
		got, err := ResolvePosition(ref)
		if err != nil || got != want {
			t.Errorf("%s: got %d, %v", ref, got, err)
		}
	}
	for _, ref := range []string{"80", "-1", "XX9", "999999999999999999999999999"} {
		_, err := ResolvePosition(ref)
		if err == nil {
			t.Errorf("accepted %s", ref)
		} else if ref == "XX9" && !strings.Contains(err.Error(), "0-79") {
			t.Error("missing numeric position hint")
		}
	}
}

func TestFindQueryFormsAndAliases(t *testing.T) {
	for _, tc := range []struct {
		input string
		want  *FindQuery
	}{{"Cmd+C", &FindQuery{[]string{"LG"}, "C"}}, {"LG(C)", &FindQuery{[]string{"LG"}, "C"}}, {"⌘C", &FindQuery{[]string{"LG"}, "C"}}, {"f5", &FindQuery{[]string{}, "F5"}}, {"Shift+Cmd+C", &FindQuery{[]string{"LG", "LS"}, "C"}}, {" ⌘⇧C ", &FindQuery{[]string{"LG", "LS"}, "C"}}, {"", nil}, {"foo+c", nil}, {"⌘", nil}, {"+", nil}} {
		if got := ParseFindQuery(tc.input); !reflect.DeepEqual(got, tc.want) {
			t.Errorf("%s: got %+v, want %+v", tc.input, got, tc.want)
		}
	}
	for word, mod := range modifierWords {
		got := ParseFindQuery(word + "+A")
		if got == nil || got.Key != "A" || !reflect.DeepEqual(got.Mods, []string{mod}) {
			t.Errorf("word %s: %+v", word, got)
		}
	}
	alias := LookupAlias(" SCREENSHOT ")
	if alias == nil || !reflect.DeepEqual(alias.Queries, []string{"LG(LS(N5))", "LG(LS(N4))", "LG(LS(N3))", "PSCRN"}) || !strings.Contains(alias.Hint, "⌘⇧5") {
		t.Fatalf("incorrect screenshot alias: %+v", alias)
	}
	if LookupAlias("unknown") != nil {
		t.Fatal("unknown alias accepted")
	}
	for _, alias := range FindAliases {
		for _, query := range alias.Queries {
			if ParseFindQuery(query) == nil {
				t.Errorf("alias %s has invalid query %s", alias.Name, query)
			}
		}
	}
}

func TestReverseBindingSearch(t *testing.T) {
	config := fixture()
	for _, tc := range []struct {
		query                   FindQuery
		location, binding, note string
	}{
		{FindQuery{[]string{"LG"}, "C"}, "layer default · position 43 · tap", "LG(C)", ""},
		{FindQuery{Key: "C"}, "layer default · position 20 · tap", "C", ""},
		{FindQuery{Key: "C"}, "layer default · position 43 · tap", "LG(C)", "with LG"},
		{FindQuery{[]string{"LG"}, "C"}, "macro copy_url · step 2 (tap)", "LG(C)", ""},
		{FindQuery{Key: "LGUI"}, "layer default · position 34 · tap", "LGUI", ""},
		{FindQuery{Key: "DEL"}, "mod-morph mm_bspc_shift_del · morph", "DEL", ""},
		{FindQuery{Key: "ESC"}, "combo esc_combo", "ESC", ""},
		{FindQuery{Key: "F5"}, "layer default · position 10 · tap", "F5", ""},
	} {
		matches := FindBindings(config, tc.query)
		want := FindMatch{tc.location, tc.binding, tc.note}
		if !slices.Contains(matches, want) {
			t.Errorf("missing %+v in %+v", want, matches)
		}
	}
	for _, match := range FindBindings(config, FindQuery{[]string{"LG"}, "C"}) {
		if strings.Contains(match.Location, "position 20") {
			t.Fatal("modified query matched bare key")
		}
	}
	config.Layers[0].Keys[0] = keymap.Key{Tap: keymap.Behavior{Type: "mod_morph", Name: "outer"}, Hold: &keymap.Behavior{Type: "kp", KeyCode: "ESC"}}
	config.ModMorphs = append(config.ModMorphs, keymap.ModMorphDefinition{Name: "outer", DefaultBinding: "&mm_bspc_shift_del", MorphBinding: "&kp Z", Mods: []string{"MOD_LCTL"}})
	config.TapDances = []keymap.TapDanceDefinition{{Name: "td_escape", Bindings: []string{"&kp ESC"}}}
	config.HoldTaps = append(config.HoldTaps, keymap.HoldTapDefinition{Name: "escape", TapBinding: "&kp ESC", HoldBinding: "&kp X"})
	for _, query := range []string{"ESC", "BSPC"} {
		matches := FindBindings(config, FindQuery{Key: query})
		if !slices.ContainsFunc(matches, func(m FindMatch) bool { return strings.Contains(m.Location, "position 0") }) {
			t.Errorf("missing %s from hold/nested morph", query)
		}
	}
	matches := FindBindings(config, FindQuery{Key: "ESC"})
	for _, location := range []string{"tap-dance td_escape · tap 1", "hold-tap escape · binding"} {
		if !slices.ContainsFunc(matches, func(m FindMatch) bool { return m.Location == location }) {
			t.Errorf("missing %s", location)
		}
	}
	if got := ExtractKpCodes("&kp LG(C) &mo 1 &kp ESC"); !reflect.DeepEqual(got, []string{"LG(C)", "ESC"}) {
		t.Error(got)
	}
}

func TestTextSearchNamesLabelsAndKeycodes(t *testing.T) {
	config := fixture()
	for _, tc := range []struct{ query, want string }{{"copy_u", `macro "copy_url"`}, {"COPYURL", "copy_url"}, {"esc_co", `combo "esc_combo"`}, {"bspc_shift", "mm_bspc_shift_del"}, {"hml_", "hml_lgui"}, {"symb", `layer 1 "symbols"`}, {"backsp", `keycode BSPC "Backspace"`}} {
		results := TextSearch(config, tc.query)
		if !slices.ContainsFunc(results, func(r TextSearchResult) bool { return strings.Contains(r.Entity, tc.want) }) {
			t.Errorf("query %s: %+v", tc.query, results)
		}
	}
	for _, result := range TextSearch(config, "backsp") {
		if strings.Contains(result.Entity, "keycode BSPC") {
			if !slices.ContainsFunc(result.Matches, func(m FindMatch) bool { return strings.Contains(m.Location, "mm_bspc_shift_del") }) {
				t.Error("label lookup lost bindings")
			}
		}
	}
	if got := TextSearch(config, "a"); len(got) == 0 {
		t.Error("single-character labels must be searchable")
	}
	for _, query := range []string{"", " "} {
		if got := TextSearch(config, query); len(got) != 0 {
			t.Errorf("short query %q produced hits", query)
		}
	}
}

func TestCompletionPreservesTokenAndContext(t *testing.T) {
	config := fixture()
	for _, tc := range []struct {
		line, token string
		want        []string
	}{
		{"", "", Commands}, {"la", "la", []string{"layers", "layer"}}, {"LM", "LM", []string{}}, {"re", "re", []string{"reload"}}, {"ed", "ed", []string{"edit"}}, {"help re", "re", []string{"reload"}},
		{"layer sy", "sy", []string{"symbols", "system"}}, {"layer ", "", []string{"default", "symbols", "system"}}, {"key 3", "3", []string{"3", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39"}}, {"rm 7", "7", []string{"7", "70", "71", "72", "73", "74", "75", "76", "77", "78", "79"}}, {"key LM", "LM", []string{}}, {"key 34 ", "", []string{}},
		{"macro co", "co", []string{"copy_url"}}, {"combo e", "e", []string{"esc_combo"}}, {"flash --l", "--l", []string{"--local"}}, {"flash --remote --f", "--f", []string{"--full"}}, {"help fi", "fi", []string{"find"}}, {"find Cmd", "Cmd", []string{}}, {"find scre", "scre", []string{"screenshot"}},
	} {
		matches, token := Complete(config, tc.line)
		if !reflect.DeepEqual(matches, tc.want) || token != tc.token {
			t.Errorf("%q: %v/%q, want %v/%q", tc.line, matches, token, tc.want, tc.token)
		}
	}
}
