package keymapview

import (
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/fix-fox/glove/internal/keymap"
)

func TestSnapshotNativeLabelsGeometrySourcesAndDefinitions(t *testing.T) {
	root, err := filepath.Abs("../..")
	if err != nil {
		t.Fatal(err)
	}
	doc, err := keymap.Load(filepath.Join(root, "config/glove80.keymap"))
	if err != nil {
		t.Fatal(err)
	}
	snapshot := SnapshotFrom(doc, root)
	if snapshot.Path != "config/glove80.keymap" {
		t.Fatal(snapshot.Path)
	}
	positions := []int{}
	for _, row := range snapshot.Grid {
		for _, position := range row {
			if position != nil {
				positions = append(positions, *position)
			}
		}
	}
	slices.Sort(positions)
	for i, position := range positions {
		if i != position {
			t.Fatal("incorrect geometry")
		}
	}
	if len(positions) != 80 {
		t.Fatal("missing keys")
	}
	for _, layer := range snapshot.Layers {
		if len(layer.Keys) != 80 {
			t.Errorf("%s has %d keys", layer.Name, len(layer.Keys))
		}
	}
	key := snapshot.Layers[0].Keys[35]
	if key.Position != 35 || key.Name != "" || key.Tap != "A" || key.Hold != "⌃" || key.TapKind != "key" || key.HoldKind != "modifier" || !key.Editable || !strings.HasPrefix(key.Source, "config/glove80.keymap:") || !strings.Contains(key.Detail, "hold-tap hml(LCTRL, A)") {
		t.Fatalf("incorrect key: %+v", key)
	}
	for _, position := range []int{1, 65, 66, 67, 68, 77, 78} {
		key := snapshot.Layers[0].Keys[position]
		if key.Tap != "" || key.Hold != "" || key.TapKind != "empty" || key.HoldKind != "empty" {
			t.Errorf("intentional cleared key %d changed: %+v", position, key)
		}
	}
	hebrewFound := false
	for _, layer := range snapshot.Layers {
		if layer.Name == "hebrew" {
			hebrewFound = true
			if layer.Keys[35].Tap != "ש" || layer.Keys[0].Tap != "·" {
				t.Error("incorrect Hebrew labels")
			}
		}
	}
	if !hebrewFound {
		t.Error("missing Hebrew layer")
	}
	kinds := map[string]bool{}
	details := map[string]string{}
	for _, entity := range snapshot.Entities {
		kinds[entity.Kind] = true
		details[entity.Name] = entity.Detail
	}
	for _, kind := range []string{"macro", "combo", "hold-tap", "mod-morph", "conditional", "tap-dance"} {
		if !kinds[kind] {
			t.Errorf("missing %s", kind)
		}
	}
	for name, part := range map[string]string{"caps_lock": "prior idle: 300ms", "hml": "quick tap: 0ms", "hebrew_symbols": "when: hebrew + symbols"} {
		if !strings.Contains(details[name], part) {
			t.Errorf("%s lacks %s: %s", name, part, details[name])
		}
	}
}

func TestDictationBindingsRemainAvailable(t *testing.T) {
	doc, err := keymap.Load("../../config/glove80.keymap")
	if err != nil {
		t.Fatal(err)
	}
	config := doc.Config
	found := false
	for _, macro := range config.Macros {
		if macro.Name == "dictation" {
			found = true
			want := []keymap.MacroStep{{Directive: "tap", Bindings: []string{"&kp LCTRL"}}, {Directive: "tap", Bindings: []string{"&kp LCTRL"}}}
			if !reflect.DeepEqual(macro.Steps, want) {
				t.Fatal(macro.Steps)
			}
		}
	}
	if !found {
		t.Fatal("missing dictation macro")
	}
	found = false
	for _, layer := range config.Layers {
		if layer.Name == "Apps" {
			found = true
			key := layer.Keys[69]
			if key.Tap.Type != "macro" || key.Tap.MacroName != "dictation" || key.Hold != nil {
				t.Fatal(key)
			}
		}
	}
	if !found {
		t.Fatal("missing Apps layer")
	}
	found = false
	for _, def := range config.HoldTaps {
		if def.Name == "dict_enter" {
			found = true
			if def.HoldBinding != "&dictation" || def.TapBinding != "&kp" {
				t.Fatal(def)
			}
		}
	}
	if !found {
		t.Fatal("missing dict_enter behavior")
	}
	if got := config.Layers[0].Keys[75].Tap; !reflect.DeepEqual(got, keymap.Behavior{Type: "hold_tap", Name: "dict_enter", Param1: "0", Param2: "ENTER"}) {
		t.Fatal(got)
	}
}

func snapshotFixture(t *testing.T, first, header string) *keymap.Document {
	t.Helper()
	directory := t.TempDir()
	path := filepath.Join(directory, "test.keymap")
	source := header + "\n/ { keymap { compatible = \"zmk,keymap\";\nbase { bindings = <" + first + " " + strings.Repeat("&trans ", 79) + ">; };\nnav { bindings = <&kp B " + strings.Repeat("&trans ", 79) + ">; }; }; };\n"
	if err := os.WriteFile(path, []byte(source), 0600); err != nil {
		t.Fatal(err)
	}
	doc, err := keymap.Load(path)
	if err != nil {
		t.Fatal(err)
	}
	return doc
}

func TestSnapshotMarksSharedAndCommentedBindingsReadOnly(t *testing.T) {
	for _, tc := range []struct {
		first, header string
		editable      bool
	}{{"SHARED", "#define SHARED &kp A", false}, {"&kp /* keep */ A", "", false}, {"&kp A", "", true}} {
		doc := snapshotFixture(t, tc.first, tc.header)
		key := SnapshotFrom(doc, filepath.Dir(doc.Path)).Layers[0].Keys[0]
		if key.Editable != tc.editable {
			t.Errorf("%s editable=%v", tc.first, key.Editable)
		}
	}
}

func TestDisplayTextRejectsTerminalControls(t *testing.T) {
	for _, tc := range []struct {
		value     string
		multiline bool
		want      string
	}{{"\x1b[31mNav\x1b[0m\a", false, "Nav"}, {"\x1b]52;c;dGVzdA==\ahello", false, "hello"}, {"a\nb\tc\rd\x7f\u0085", false, "abcd"}, {"a\nb\tc", true, "a\nbc"}, {"אבג ⇧", false, "אבג ⇧"}} {
		if got := DisplayText(tc.value, tc.multiline); got != tc.want {
			t.Errorf("%q: got %q, want %q", tc.value, got, tc.want)
		}
	}
	doc := snapshotFixture(t, "&mo 1", "")
	doc.Config.Layers[1].Name = "\x1b[31mNav\x1b[0m\a"
	doc.Config.Layers[0].Keys[1] = keymap.Key{Tap: keymap.Behavior{Type: "kp", KeyCode: "A"}, Hold: &keymap.Behavior{Type: "mo", LayerIndex: 1}}
	snapshot := SnapshotFrom(doc, filepath.Dir(doc.Path))
	if snapshot.Layers[1].Name != "Nav" || snapshot.Layers[0].Keys[0].Tap != "◇ Nav" || snapshot.Layers[0].Keys[1].Hold != "◇ Nav" {
		t.Fatalf("unsafe labels: %+v", snapshot.Layers)
	}
	if !strings.Contains(snapshot.Layers[0].Keys[0].Detail, `layer "Nav"`) || !strings.Contains(snapshot.Layers[1].Keys[0].Detail, `layer 1 "Nav"`) {
		t.Fatal("detail quotes must not retain escaped terminal controls")
	}
	doc.Config.Macros = []keymap.MacroDefinition{{Name: "\x1b[31munsafe\x1b[0m", Label: "\aLabel"}}
	for _, command := range []string{"layers", "macros", "find unsafe", "layer nav"} {
		text := Dispatch(doc.Config, command, 0, "both").Text
		if strings.ContainsAny(text, "\x1b\a") {
			t.Errorf("unsafe output: %q", text)
		}
	}
}
