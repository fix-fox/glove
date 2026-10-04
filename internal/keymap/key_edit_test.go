package keymap

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestKeyEditorSavesSupportedActionsAndRemovesHold(t *testing.T) {
	cases := []struct {
		name string
		edit KeyEdit
		want string
	}{
		{"key", KeyEdit{Tap: KeyAction{Kind: KeyPress, Code: "ENTER"}}, "&kp ENTER"},
		{"shortcut", KeyEdit{Tap: KeyAction{Kind: KeyPress, Code: "LG(LS(N4))"}}, "&kp LG(LS(N4))"},
		{"modifier hold", KeyEdit{Tap: KeyAction{Kind: KeyPress, Code: "A"}, Hold: &KeyAction{Kind: KeyPress, Code: "LCTRL"}}, "&mt LCTRL A"},
		{"layer hold", KeyEdit{Tap: KeyAction{Kind: KeyPress, Code: "SPACE"}, Hold: &KeyAction{Kind: LayerWhileHeld, Layer: 1}}, "&lt 1 SPACE"},
		{"dedicated modifier", KeyEdit{Tap: KeyAction{Kind: KeyPress, Code: "LSHIFT"}}, "&kp LSHIFT"},
		{"dedicated layer", KeyEdit{Tap: KeyAction{Kind: LayerWhileHeld, Layer: 1}}, "&mo 1"},
		{"toggle", KeyEdit{Tap: KeyAction{Kind: LayerToggle, Layer: 1}}, "&tog 1"},
		{"switch", KeyEdit{Tap: KeyAction{Kind: LayerSwitch, Layer: 1}}, "&to 1"},
		{"disabled", KeyEdit{Tap: KeyAction{Kind: KeyDisabled}}, "&none"},
		{"transparent", KeyEdit{Tap: KeyAction{Kind: KeyTransparent}}, "&trans"},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			path, before, doc := editFixture(t, "&lt 1 TAB", "")
			after, err := SaveKeyEdit(doc, 0, 0, test.edit)
			if err != nil {
				t.Fatal(err)
			}
			if actual := readFile(t, path); actual != strings.Replace(before, "&lt 1 TAB", test.want, 1) {
				t.Fatalf("unexpected source edit: %s", actual)
			}
			got, err := ReadKeyEdit(after, 0, 0)
			if err != nil || !reflect.DeepEqual(got, test.edit) {
				t.Fatalf("reload changed requested actions: %+v, %v", got, err)
			}
			info, _ := os.Stat(path)
			if info.Mode().Perm() != 0640 {
				t.Fatal("file permissions changed")
			}
		})
	}
}

func TestKeyEditorPreservesHomeRowAndCustomLayerTiming(t *testing.T) {
	for _, behavior := range []string{"hml", "hmr", "custom_layer", "custom_mod"} {
		t.Run(behavior, func(t *testing.T) {
			hold, param := "&kp", "LCTRL"
			if behavior == "hml" || behavior == "hmr" {
				hold = "&mod_activate"
			}
			if behavior == "custom_layer" {
				hold, param = "&mo", "1"
			}
			extra := `macros { mod_activate: mod_activate { compatible = "zmk,behavior-macro-one-param"; #binding-cells = <1>; bindings = <&macro_param_1to1>, <&macro_press &kp MACRO_PLACEHOLDER>; }; };
behaviors { ` + behavior + `: ` + behavior + ` { compatible = "zmk,behavior-hold-tap"; #binding-cells = <2>; flavor = "balanced"; tapping-term-ms = <280>; quick-tap-ms = <0>; require-prior-idle-ms = <100>; hold-trigger-key-positions = <1 2 3>; hold-trigger-on-release; bindings = <` + hold + `>, <&kp>; }; };`
			raw := "&" + behavior + " " + param + " A"
			doc := mustLoad(t, keymapText(raw, "", extra))
			before := readFile(t, doc.Path)
			edit, err := ReadKeyEdit(doc, 0, 0)
			if err != nil {
				t.Fatal(err)
			}
			edit.Tap.Code = "LG(C)"
			if edit.Hold.Kind == KeyPress {
				edit.Hold.Code, param = "RGUI", "RGUI"
			}
			after, err := SaveKeyEdit(doc, 0, 0, edit)
			if err != nil {
				t.Fatal(err)
			}
			if readFile(t, doc.Path) != strings.Replace(before, raw, "&"+behavior+" "+param+" LG(C)", 1) || !reflect.DeepEqual(doc.Config.HoldTaps, after.Config.HoldTaps) || !reflect.DeepEqual(doc.Config.Macros, after.Config.Macros) {
				t.Fatal("edit changed tuned behavior or another source range")
			}
		})
	}
}

func TestKeyEditorNameAndActionsSaveTogetherAndNoOpPreservesConstants(t *testing.T) {
	doc := mustLoad(t, keymapText("/* @name Old */ &lt TARGET LC(A)", "#define TARGET 1", ""))
	before := readFile(t, doc.Path)
	edit, err := ReadKeyEdit(doc, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	after, err := SaveKeyEdit(doc, 0, 0, edit)
	if err != nil || after != doc || readFile(t, doc.Path) != before {
		t.Fatal("saving unchanged fields must preserve source exactly")
	}
	edit.Name = "העתק"
	after, err = SaveKeyEdit(doc, 0, 0, edit)
	if err != nil || readFile(t, doc.Path) != strings.Replace(before, "@name Old", "@name העתק", 1) {
		t.Fatalf("renaming changed actions or constants: %v", err)
	}
	edit.Name, edit.Tap.Code = "", "SPACE"
	_, err = SaveKeyEdit(after, 0, 0, edit)
	if err != nil || !strings.Contains(readFile(t, doc.Path), "<&lt TARGET SPACE ") || strings.Contains(readFile(t, doc.Path), "@name") {
		t.Fatalf("name removal and action edit failed: %v", err)
	}
}

func TestKeyEditorRejectsComplexBindingsAndUnsafeCandidatesWithoutWriting(t *testing.T) {
	for _, first := range []string{"&kp /* embedded */ A", "SHARED", "&sl 1", "&bootloader", "&mt A B"} {
		doc := mustLoad(t, keymapText(first, "#define SHARED &kp A", ""))
		before := readFile(t, doc.Path)
		if _, err := ReadKeyEdit(doc, 0, 0); err == nil {
			t.Fatalf("%s should require the external editor", first)
		}
		if _, err := SaveKeyEdit(doc, 0, 0, KeyEdit{Tap: KeyAction{Kind: KeyDisabled}}); err == nil || readFile(t, doc.Path) != before {
			t.Fatalf("unsupported binding %s was changed", first)
		}
	}
	doc := mustLoad(t, keymapText("&kp A", "", ""))
	before := readFile(t, doc.Path)
	for _, edit := range []KeyEdit{
		{Tap: KeyAction{Kind: KeyPress, Code: "A &kp B"}},
		{Tap: KeyAction{Kind: KeyPress, Code: "LG(A) trailing"}},
		{Tap: KeyAction{Kind: LayerToggle, Layer: 9}},
		{Tap: KeyAction{Kind: LayerWhileHeld, Layer: -1}},
		{Tap: KeyAction{Kind: "macro"}},
		{Name: "bad */", Tap: KeyAction{Kind: KeyDisabled}},
		{Tap: KeyAction{Kind: KeyDisabled}, Hold: &KeyAction{Kind: KeyPress, Code: "LCTRL"}},
		{Tap: KeyAction{Kind: KeyPress, Code: "A"}, Hold: &KeyAction{Kind: KeyPress, Code: "B"}},
		{Tap: KeyAction{Kind: KeyPress, Code: "A"}, Hold: &KeyAction{Kind: LayerToggle, Layer: 1}},
	} {
		if _, err := SaveKeyEdit(doc, 0, 0, edit); err == nil || readFile(t, doc.Path) != before {
			t.Fatalf("invalid draft was written: %+v, %v", edit, err)
		}
	}
}

func TestKeyEditorEditsIncludedSourceAndRejectsStaleInclude(t *testing.T) {
	directory := t.TempDir()
	path, included := filepath.Join(directory, "root.keymap"), filepath.Join(directory, "keys.dtsi")
	writeFile(t, included, keymapText("&kp A", "", ""))
	writeFile(t, path, "#include \"keys.dtsi\"\n")
	doc, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	edit, _ := ReadKeyEdit(doc, 0, 0)
	edit.Name, edit.Tap.Code = "Copy", "LG(C)"
	after, err := SaveKeyEdit(doc, 0, 0, edit)
	if err != nil || readFile(t, path) != "#include \"keys.dtsi\"\n" || !strings.Contains(readFile(t, included), "/* @name Copy */ &kp LG(C)") {
		t.Fatalf("wrong file edited: %v", err)
	}
	before := readFile(t, included) + "// external change\n"
	writeFile(t, included, before)
	_, err = SaveKeyEdit(after, 0, 0, edit)
	assertError(t, err, "reload")
	if readFile(t, included) != before {
		t.Fatal("stale save overwrote external change")
	}
}

func TestKeyEditorUsesLayerConstantsAndEditsOnlyTheSelectedLayer(t *testing.T) {
	header := "#define LAYER_BASE 0\n#define LAYER_NAV 1"
	for _, tap := range []KeyAction{
		{Kind: LayerWhileHeld, Layer: 1}, {Kind: LayerToggle, Layer: 1}, {Kind: LayerSwitch, Layer: 1},
	} {
		doc := mustLoad(t, keymapText("&kp A", header, ""))
		before := readFile(t, doc.Path)
		after, err := SaveKeyEdit(doc, 1, 0, KeyEdit{Tap: tap})
		if err != nil {
			t.Fatal(err)
		}
		if after.Config.Layers[0].Keys[0] != doc.Config.Layers[0].Keys[0] || !strings.Contains(readFile(t, doc.Path), "LAYER_NAV &trans") || strings.Count(readFile(t, doc.Path), "LAYER_NAV") != 2 {
			t.Fatal("layer action lost the constant or changed the base key")
		}
		binding := after.Bindings[1][0]
		replacement := after.Sources[binding.File][binding.Start:binding.End]
		if readFile(t, doc.Path) != strings.Replace(before, "nav { bindings = <&none", "nav { bindings = <"+replacement, 1) {
			t.Fatal("edit changed a different layer or surrounding text")
		}
	}
	doc := mustLoad(t, keymapText("&kp A", header, ""))
	_, err := SaveKeyEdit(doc, 0, 0, KeyEdit{Tap: KeyAction{Kind: KeyPress, Code: "SPACE"}, Hold: &KeyAction{Kind: LayerWhileHeld, Layer: 1}})
	if err != nil || !strings.Contains(readFile(t, doc.Path), "&lt LAYER_NAV SPACE") {
		t.Fatalf("new layer-tap did not reuse the layer constant: %v", err)
	}
}
