package keymapview

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"reflect"
	"regexp"
	"testing"

	"github.com/fix-fox/glove/internal/keymap"
)

// Frozen migration oracle from TypeScript: catalog, aliases, Hebrew and nested modifiers.
//
//go:embed testdata/labels.json
var labelCases []byte

func TestKeycodeLabelMigrationParity(t *testing.T) {
	var cases []struct {
		Code   string
		Hebrew bool
		Label  string
	}
	if err := json.Unmarshal(labelCases, &cases); err != nil {
		t.Fatal(err)
	}
	if len(cases) != 744 {
		t.Fatalf("expected 744 migration cases, got %d", len(cases))
	}
	for _, tc := range cases {
		t.Run(fmt.Sprintf("%s/hebrew=%v", tc.Code, tc.Hebrew), func(t *testing.T) {
			if got := KeyCodeLabel(tc.Code, tc.Hebrew); got != tc.Label {
				t.Fatalf("got %q, want %q", got, tc.Label)
			}
		})
	}
}

func TestKeycodeCatalog(t *testing.T) {
	seen := map[string]bool{}
	categories := map[string]int{}
	for _, kc := range Keycodes {
		if kc.Code == "" || kc.Label == "" || kc.Category == "" || seen[kc.Code] {
			t.Fatalf("invalid catalog entry: %+v", kc)
		}
		seen[kc.Code] = true
		categories[kc.Category]++
	}
	for category, count := range map[string]int{"Letters": 26, "Numbers": 10, "Function": 24, "Shifted Symbols": 21} {
		if categories[category] != count {
			t.Errorf("%s: got %d, want %d", category, categories[category], count)
		}
	}
	for _, category := range []string{"Modifiers", "Navigation", "Punctuation", "Control", "Keypad", "Media"} {
		if categories[category] == 0 {
			t.Errorf("missing category %s", category)
		}
	}
}

func TestPhysicalGeometryAndNames(t *testing.T) {
	if len(Geometry) != 7 || len(KeyNames) != 80 {
		t.Fatal("incorrect keyboard dimensions")
	}
	seen := map[int]bool{}
	names := map[string]bool{}
	namePattern := regexp.MustCompile(`^[LR][CNTMBFH][1-6]$`)
	wantCounts := []int{10, 12, 12, 12, 12, 16, 6}
	for rowIndex, row := range Geometry {
		if len(row) != 19 {
			t.Fatalf("row %d has %d columns", rowIndex, len(row))
		}
		count := 0
		for _, pos := range row {
			if pos < 0 {
				continue
			}
			if pos > 79 || seen[pos] {
				t.Fatalf("duplicate or invalid position %d", pos)
			}
			seen[pos] = true
			count++
		}
		if count != wantCounts[rowIndex] {
			t.Errorf("row %d: got %d keys", rowIndex, count)
		}
	}
	if len(seen) != 80 {
		t.Fatal("missing physical keys")
	}
	for _, name := range KeyNames {
		if !namePattern.MatchString(name) || names[name] {
			t.Fatalf("invalid or duplicate key name %s", name)
		}
		names[name] = true
	}
	for pos, want := range map[int]string{0: "LC1", 10: "LN1", 34: "LM1", 43: "RM4", 52: "LH1", 69: "LH4", 75: "RF1", 79: "RF5"} {
		if KeyNames[pos] != want {
			t.Errorf("position %d: %s", pos, KeyNames[pos])
		}
	}
}

func TestModifiedKeyCodeParsing(t *testing.T) {
	for _, tc := range []struct {
		code, key string
		mods      []string
	}{{"A", "A", []string{}}, {"LG(C)", "C", []string{"LG"}}, {"LA(LC(V))", "V", []string{"LA", "LC"}}, {"LA(LC(LS(LG(C))))", "C", []string{"LA", "LC", "LS", "LG"}}, {"LC(", "LC(", []string{}}, {"XX(A)", "XX(A)", []string{}}} {
		key, mods := ParseModifiedKeyCode(tc.code)
		if key != tc.key || !reflect.DeepEqual(mods, tc.mods) {
			t.Errorf("%s: %q %v", tc.code, key, mods)
		}
	}
	for _, mod := range []string{"LC", "RC", "LA", "RA", "LS", "RS", "LG", "RG"} {
		key, mods := ParseModifiedKeyCode(mod + "(A)")
		if key != "A" || !reflect.DeepEqual(mods, []string{mod}) {
			t.Errorf("modifier %s: %s %v", mod, key, mods)
		}
	}
}

func TestBehaviorLabels(t *testing.T) {
	profile := 2
	empty := keymap.Keymap{}
	for _, tc := range []struct {
		b    keymap.Behavior
		want string
	}{
		{keymap.Behavior{Type: "kp", KeyCode: "LSHIFT"}, "⇧"}, {keymap.Behavior{Type: "mo", LayerIndex: 1}, "◇ 1"}, {keymap.Behavior{Type: "to", LayerIndex: 2}, "⇨ 2"}, {keymap.Behavior{Type: "sl"}, "◆ 0"}, {keymap.Behavior{Type: "tog", LayerIndex: 3}, "⇄ 3"},
		{keymap.Behavior{Type: "trans"}, ""}, {keymap.Behavior{Type: "none"}, ""}, {keymap.Behavior{Type: "bootloader"}, "BOOT"}, {keymap.Behavior{Type: "sys_reset"}, "RESET"},
		{keymap.Behavior{Type: "bt", Action: "BT_SEL", ProfileIndex: &profile}, "BT SEL 2"}, {keymap.Behavior{Type: "bt", Action: "BT_SEL"}, "BT SEL 0"}, {keymap.Behavior{Type: "bt", Action: "BT_CLR"}, "BT CLR"}, {keymap.Behavior{Type: "bt", Action: "BT_NXT"}, "BT NXT"}, {keymap.Behavior{Type: "bt", Action: "BT_PRV"}, "BT PRV"}, {keymap.Behavior{Type: "bt", Action: "BT_CLR_ALL"}, "BT CLR_ALL"}, {keymap.Behavior{Type: "bt", Action: "BT_DISC"}, "BT DISC"},
		{keymap.Behavior{Type: "caps_word"}, "CAPS"}, {keymap.Behavior{Type: "rgb_ug", Action: "RGB_TOG"}, "RGB_TOG"}, {keymap.Behavior{Type: "out", Action: "OUT_BLE"}, "BLE"}, {keymap.Behavior{Type: "out", Action: "OUT_USB"}, "USB"}, {keymap.Behavior{Type: "mkp", Button: "LCLK"}, "LCLK"},
		{keymap.Behavior{Type: "hold_tap", Name: "hml_lgui", Param2: "A"}, "A"}, {keymap.Behavior{Type: "hold_tap", Name: "hml_lshift", Param2: "S"}, "S"}, {keymap.Behavior{Type: "hold_tap", Name: "hmr_rctrl", Param2: "SEMI"}, ";"}, {keymap.Behavior{Type: "hold_tap", Name: "magic"}, "magic-tap"}, {keymap.Behavior{Type: "hold_tap", Name: "my_ht", Param2: "A"}, "my_ht"}, {keymap.Behavior{Type: "hold_tap", Name: "lt", Param2: "A"}, "A"}, {keymap.Behavior{Type: "hold_tap", Name: "mt_ctrl", Param2: "A"}, "A"},
		{keymap.Behavior{Type: "macro", MacroName: "copy"}, "copy"}, {keymap.Behavior{Type: "mod_morph", Name: "missing"}, "missing"}, {keymap.Behavior{Type: "tap_dance", Name: "td_toggle"}, "toggle"},
	} {
		t.Run(tc.b.Type+tc.b.Name+tc.b.Action, func(t *testing.T) {
			if got := BehaviorLabel(tc.b, empty, false); got != tc.want {
				t.Errorf("got %q, want %q", got, tc.want)
			}
		})
	}
	for direction, label := range map[string]string{"UP": "UP", "DOWN": "DN", "RIGHT": "RHT", "LEFT": "LEFT"} {
		for _, precision := range []bool{false, true} {
			want := "M_" + label
			if precision {
				want = "p" + want
			}
			if got := BehaviorLabel(keymap.Behavior{Type: "mmv", Direction: "MOVE_" + direction, Precision: precision}, empty, false); got != want {
				t.Error(got)
			}
		}
		if got := BehaviorLabel(keymap.Behavior{Type: "msc", Direction: "SCRL_" + direction}, empty, false); got != "SC_"+label {
			t.Error(got)
		}
	}
	config := keymap.Keymap{Layers: []keymap.Layer{{Name: "Base"}, {Name: "Nav"}, {Name: "Num"}, {Name: "Sym"}}}
	for _, tc := range []struct {
		typ   string
		index int
		want  string
	}{{"mo", 0, "◇ BAS"}, {"mo", 1, "◇ Nav"}, {"to", 2, "⇨ Num"}, {"tog", 3, "⇄ Sym"}, {"sl", 0, "◆ BAS"}, {"mo", 99, "◇ 99"}} {
		if got := BehaviorLabel(keymap.Behavior{Type: tc.typ, LayerIndex: tc.index}, config, false); got != tc.want {
			t.Errorf("got %q want %q", got, tc.want)
		}
	}
}

func TestHoldLabelsAndMorphChains(t *testing.T) {
	for _, tc := range []struct{ name, param, want string }{{"hml", "LCTRL", "⌃"}, {"hmr", "LGUI", "⌘"}, {"hml", "LG(LALT)", "⌘⌥"}, {"hml", "LG(LGUI)", "⌘"}, {"hml_mm_q_shift_qmark", "LCTRL", "⌃"}, {"mt_ctrl", "RSHIFT", "⇧"}, {"magic", "0", "magic-hold"}, {"lt", "2", "◇2"}, {"other", "X", "other"}} {
		if got := HoldTapSecondaryLabel(tc.name, tc.param); got != tc.want {
			t.Errorf("%+v: %s", tc, got)
		}
	}
	inner := keymap.ModMorphDefinition{Name: "inner", DefaultBinding: "&kp Q", MorphBinding: "&kp QMARK", Mods: []string{"MOD_LSFT", "MOD_RSFT"}}
	outer := keymap.ModMorphDefinition{Name: "outer", DefaultBinding: "&inner", MorphBinding: "&kp EXCL", Mods: []string{"MOD_LCTL", "MOD_RCTL"}}
	for _, tc := range []struct {
		behavior keymap.Behavior
		defs     []keymap.ModMorphDefinition
		want     *UnpackedKey
	}{
		{keymap.Behavior{Type: "kp"}, nil, nil}, {keymap.Behavior{Type: "mod_morph", Name: "missing"}, nil, nil},
		{keymap.Behavior{Type: "mod_morph", Name: "inner"}, []keymap.ModMorphDefinition{inner}, &UnpackedKey{"Q", []Morph{{"shift", "QMARK"}}}},
		{keymap.Behavior{Type: "mod_morph", Name: "outer"}, []keymap.ModMorphDefinition{inner, outer}, &UnpackedKey{"Q", []Morph{{"shift", "QMARK"}, {"ctrl", "EXCL"}}}},
	} {
		if got := UnpackModMorph(tc.behavior, tc.defs); !reflect.DeepEqual(got, tc.want) {
			t.Errorf("got %+v, want %+v", got, tc.want)
		}
	}
	for _, bad := range []keymap.ModMorphDefinition{{Name: "bad", DefaultBinding: "&kp Q", MorphBinding: "&mo 1", Mods: inner.Mods}, {Name: "bad", DefaultBinding: "&bad", MorphBinding: "&kp A", Mods: inner.Mods}, {Name: "bad", DefaultBinding: "&kp Q", MorphBinding: "&kp A", Mods: []string{"UNKNOWN"}}, {Name: "bad", DefaultBinding: "garbage", MorphBinding: "&kp A", Mods: inner.Mods}} {
		if UnpackModMorph(keymap.Behavior{Type: "mod_morph", Name: "bad"}, []keymap.ModMorphDefinition{bad}) != nil {
			t.Error("accepted malformed morph")
		}
	}
	config := keymap.Keymap{ModMorphs: []keymap.ModMorphDefinition{inner}, HoldTaps: []keymap.HoldTapDefinition{{Name: "hml_lctrl_mm_q", TapBinding: "&inner"}}}
	if got := BehaviorLabel(keymap.Behavior{Type: "hold_tap", Name: "hml_lctrl_mm_q", Param1: "LCTRL", Param2: "0"}, config, false); got != "Q" {
		t.Error(got)
	}
	if got := BehaviorLabel(keymap.Behavior{Type: "mod_morph", Name: "inner"}, config, true); got != "/" {
		t.Error(got)
	}
}
