package keymap

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestRenameKeyRoundTripPreservesSourceBehaviorAndPermissions(t *testing.T) {
	path, source, doc := editFixture(t, "&kp LC(C)", "// עברית 🦊")
	original := doc.Config
	for _, name := range []string{"  Copy  ", "העתק 🦊", "", "again", "\u00a0 \u00a0"} {
		after, err := RenameKey(doc, 0, 0, name)
		if err != nil {
			t.Fatal(err)
		}
		name = strings.TrimSpace(name)
		binding := "&kp LC(C)"
		if name != "" {
			binding = "/* @name " + name + " */ " + binding
		}
		if got := readFile(t, path); got != strings.Replace(source, "&kp LC(C)", binding, 1) {
			t.Fatalf("rename changed unrelated source: %q", got)
		}
		loaded, err := Load(path)
		if err != nil || !reflect.DeepEqual(loaded.Config, after.Config) {
			t.Fatalf("reload did not preserve name: %v", err)
		}
		if after.Config.Layers[0].Keys[0].Name != name {
			t.Fatalf("name = %q, want %q", after.Config.Layers[0].Keys[0].Name, name)
		}
		// Only the selected name may change anywhere in the model.
		after.Config.Layers[0].Keys[0].Name = ""
		if !reflect.DeepEqual(after.Config, original) {
			t.Fatal("rename changed behavior or another binding")
		}
		after.Config.Layers[0].Keys[0].Name = name
		doc = after
		info, err := os.Stat(path)
		if err != nil || info.Mode().Perm() != 0640 {
			t.Fatalf("permissions changed: %v", err)
		}
		if err := AssertUnchanged(doc); err != nil {
			t.Fatal(err)
		}
	}
	unchanged, err := RenameKey(doc, 0, 0, "")
	if err != nil || unchanged != doc {
		t.Fatalf("removing an absent name should be a no-op: %v", err)
	}
	entries, err := os.ReadDir(filepath.Dir(path))
	if err != nil || len(entries) != 1 {
		t.Fatal("rename left temporary files")
	}
}

func TestRenameKeySupportsCommentsAndIsolatesLayersAndBindings(t *testing.T) {
	for _, first := range []string{"&kp /* preserve */ LC(C)", "&kp // preserve\n LC(C)", "& /* preserve */ kp LC(C)"} {
		t.Run(first, func(t *testing.T) {
			path, source, doc := editFixture(t, first, "")
			after, err := RenameKey(doc, 0, 0, "Copy")
			if err != nil {
				t.Fatal(err)
			}
			if readFile(t, path) != strings.Replace(source, first, "/* @name Copy */ "+first, 1) {
				t.Fatal("comments changed")
			}
			after, err = RenameKey(after, 1, 0, "Navigation")
			if err != nil {
				t.Fatal(err)
			}
			after, err = RenameKey(after, 0, 1, "Copy")
			if err != nil {
				t.Fatal(err)
			}
			for layerIndex, layer := range after.Config.Layers {
				for position, key := range layer.Keys {
					want := ""
					if layerIndex == 0 && position <= 1 {
						want = "Copy"
					}
					if layerIndex == 1 && position == 0 {
						want = "Navigation"
					}
					if key.Name != want {
						t.Fatalf("layer %d key %d name = %q", layerIndex, position, key.Name)
					}
				}
			}
		})
	}
}

func TestRenameKeyPreservesHumanAnnotationSpacingAndNearbyComments(t *testing.T) {
	for _, gap := range []string{"  ", " /* keep this */ ", "\n// keep this too\n"} {
		t.Run(gap, func(t *testing.T) {
			first := "/*  @name Old name   */" + gap + "&kp A"
			path, source, doc := editFixture(t, first, "")
			after, err := RenameKey(doc, 0, 0, "New name")
			if err != nil {
				t.Fatal(err)
			}
			if readFile(t, path) != strings.Replace(source, "Old name", "New name", 1) {
				t.Fatal("rename changed annotation surroundings")
			}
			unchanged, err := RenameKey(after, 0, 0, "New name")
			if err != nil || unchanged != after {
				t.Fatalf("renaming to the same name should preserve source formatting: %v", err)
			}
			_, err = RenameKey(after, 0, 0, "")
			if err != nil {
				t.Fatal(err)
			}
			if readFile(t, path) != strings.Replace(source, "/*  @name Old name   */", "", 1) {
				t.Fatal("removing annotation changed surrounding comments or whitespace")
			}
		})
	}
}

func TestClearRemovesNameAndPreservesNearbyComments(t *testing.T) {
	for _, layer := range []int{0, 1} {
		for _, gap := range []string{" ", " /* keep this */ "} {
			path, source, doc := editFixture(t, "/* @name Copy */"+gap+"&kp LC(C)", "")
			position := 0
			if layer == 1 {
				var err error
				doc, err = RenameKey(doc, 1, 0, "Navigation")
				if err != nil {
					t.Fatal(err)
				}
				source = readFile(t, path)
			}
			after, err := Clear(doc, layer, position)
			if err != nil {
				t.Fatal(err)
			}
			want := strings.Replace(source, "/* @name Navigation */ &kp B", "&trans", 1)
			if layer == 0 {
				remaining := gap
				if remaining == " " {
					remaining = ""
				}
				want = strings.Replace(source, "/* @name Copy */"+gap+"&kp LC(C)", remaining+"&none", 1)
			}
			if readFile(t, path) != want || after.Config.Layers[layer].Keys[position].Name != "" {
				t.Fatal("clear did not remove only its name and binding")
			}
		}
	}
}

func TestRenameKeyRejectsUnsafeNamesWithoutWriting(t *testing.T) {
	path, source, doc := editFixture(t, "&kp A", "")
	unsafe := []string{"*/ &none /*", "comment /* nesting", "copy\nnext", "\rCopy", "\tCopy", "Copy\u2028next", "Copy\u2029next", "copy\u202e", "\ufffd\xff"}
	for r := rune(0); r < 32; r++ {
		unsafe = append(unsafe, "Copy"+string(r))
	}
	unsafe = append(unsafe, "Copy\u007f", "Copy\u0085")
	for _, name := range unsafe {
		t.Run(name, func(t *testing.T) {
			_, err := RenameKey(doc, 0, 0, name)
			assertError(t, err, "Key name")
			if readFile(t, path) != source {
				t.Fatal("invalid name reached disk")
			}
		})
	}
}

func TestLoadRejectsMalformedOrUnsupportedKeyNameAnnotations(t *testing.T) {
	base := keymapText("&kp A", "", "")
	for _, tc := range []struct{ name, source, error string }{
		{"empty", keymapText("/* @name */ &kp A", "", ""), "Key names require"},
		{"line comment", keymapText("// @name Copy\n&kp A", "", ""), "inline block comment"},
		{"missing separator", keymapText("/* @nameCopy */ &kp A", "", ""), "Key names require"},
		{"duplicate", keymapText("/* @name Copy */ /* @name Again */ &kp A", "", ""), "Duplicate @name"},
		{"orphan", strings.Replace(base, ">; };", "/* @name Orphan */>; };", 1), "Orphan @name"},
		{"inside argument", keymapText("&kp /* @name Copy */ A", "", ""), "@name must appear immediately before"},
		{"multiline", keymapText("/* @name Copy\nnext */ &kp A", "", ""), "line breaks"},
		{"multiline prefix", keymapText("/*\n@name Copy */ &kp A", "", ""), "line breaks"},
		{"control", keymapText("/* @name Copy\x00 */ &kp A", "", ""), "control characters"},
		{"nested comment", keymapText("/* @name Copy /* */ &kp A", "", ""), "comment delimiters"},
		{"root", "/* @name Root */" + base, "@name annotations are supported only"},
		{"node", strings.Replace(base, "base {", "/* @name Layer */ base {", 1), "@name annotations are supported only"},
		{"property", strings.Replace(base, "bindings =", "/* @name Value */ bindings =", 1), "@name annotations are supported only"},
		{"compatible", strings.Replace(base, `"zmk,keymap"`, `/* @name Type */ "zmk,keymap"`, 1), "@name annotations are supported only"},
		{"outside group", strings.Replace(base, "<&kp A", "/* @name Copy */ <&kp A", 1), "Expected <"},
		{"macro definition", keymapText("KEY", "#define KEY /* @name Copy */ &kp A", ""), "preprocessor directives or shared macros"},
		{"unused macro", keymapText("&kp A", "#define KEY /* @name Copy */ &kp A", ""), "preprocessor directives or shared macros"},
		{"directive suffix", keymapText("&kp A", "#include <behaviors.dtsi> /* @name Copy */", ""), "preprocessor directives"},
		{"macro reference", keymapText("/* @name Copy */ KEY", "#define KEY &kp A", ""), "cannot name a shared macro"},
		{"behavior name macro", keymapText("/* @name Copy */ &KEY A", "#define KEY kp", ""), "cannot name a shared macro"},
		{"macro group reference", keymapText("/* @name Copy */ KEYS", "#define KEYS &kp A &kp B", ""), "cannot name a shared macro"},
		{"behavior definition", keymapText("&kp A", "", `macros { copy: copy { compatible = "zmk,behavior-macro"; #binding-cells = <0>; bindings = <&macro_tap /* @name Copy */ &kp C>; }; };`), "@name annotations are supported only"},
		{"combo", keymapText("&kp A", "", `combos { compatible = "zmk,combos"; combo { key-positions = <0 1>; bindings = </* @name Copy */ &kp C>; }; };`), "@name annotations are supported only"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := loadText(t, tc.source)
			assertError(t, err, tc.error)
			assertError(t, err, "test.keymap:")
		})
	}
}

func TestRenameKeyRejectsSharedMacrosButAllowsConstantArguments(t *testing.T) {
	for _, first := range []string{"KEY", "&KEY A"} {
		header := "#define KEY &kp A"
		if first != "KEY" {
			header = "#define KEY kp"
		}
		path, source, doc := editFixture(t, first, header)
		_, err := RenameKey(doc, 0, 0, "Copy")
		assertError(t, err, "shared macro")
		if readFile(t, path) != source {
			t.Fatal("rename changed shared definition")
		}
	}
	path, source, doc := editFixture(t, "&kp CODE", "#define CODE LC(C)")
	after, err := RenameKey(doc, 0, 0, "Copy")
	if err != nil || after.Config.Layers[0].Keys[0].Tap.KeyCode != "LC(C)" {
		t.Fatalf("literal binding with constant argument refused: %v", err)
	}
	if readFile(t, path) != strings.Replace(source, "&kp CODE", "/* @name Copy */ &kp CODE", 1) {
		t.Fatal("rename expanded a constant in the source")
	}
}

func TestRenameKeyRejectsInvalidPositionsAndCandidateWithoutWriting(t *testing.T) {
	path, source, doc := editFixture(t, "&kp A", "")
	for _, pair := range [][2]int{{-1, 0}, {0, -1}, {0, 80}, {2, 0}} {
		if _, err := RenameKey(doc, pair[0], pair[1], "Copy"); err == nil {
			t.Fatalf("accepted invalid position %v", pair)
		}
	}
	if _, err := RenameKey(nil, 0, 0, "Copy"); err == nil {
		t.Fatal("accepted nil document")
	}
	// A corrupt offset inside the binding must fail before reaching the writer.
	doc.Bindings[0][0].Start += len("&kp ")
	_, err := RenameKey(doc, 0, 0, "Copy")
	assertError(t, err, "shared syntax")
	// A corrupt annotation span removing '<' must fail complete candidate parsing.
	doc.Bindings[0][0].Start -= len("&kp ")
	doc.Bindings[0][0].NameStart = doc.Bindings[0][0].Start - 1
	doc.Bindings[0][0].NameEnd = doc.Bindings[0][0].Start
	_, err = RenameKey(doc, 0, 0, "")
	assertError(t, err, "Expected <")
	if readFile(t, path) != source {
		t.Fatal("invalid rename reached disk")
	}
}

func TestKeyNamesKeepTapHoldBehaviorAndBindingGroups(t *testing.T) {
	source := keymapText("/* @name Layer tap */ &lt 1 A", "", "")
	source = strings.Replace(source, "&lt 1 A &trans", "&lt 1 A>, </* @name Transparent */ &trans", 1)
	doc := mustLoad(t, source)
	want := Key{Name: "Layer tap", Tap: Behavior{Type: "kp", KeyCode: "A"}, Hold: &Behavior{Type: "mo", LayerIndex: 1}}
	if !reflect.DeepEqual(doc.Config.Layers[0].Keys[0], want) {
		t.Fatal("name changed tap-hold behavior")
	}
	if got := doc.Config.Layers[0].Keys[1]; got != (Key{Name: "Transparent", Tap: Behavior{Type: "trans"}}) {
		t.Fatalf("name changed binding groups: %+v", got)
	}
}

func TestRenameKeyRefusesStaleIncludesAndRetargetedSymlinksEvenForNoOp(t *testing.T) {
	for _, change := range []string{"main", "include", "symlink"} {
		for _, name := range []string{"Copy", ""} {
			t.Run(change+name, func(t *testing.T) {
				directory := t.TempDir()
				path := filepath.Join(directory, "test.keymap")
				include := filepath.Join(directory, "settings.h")
				link := filepath.Join(directory, "link.h")
				other := filepath.Join(directory, "other.h")
				writeFile(t, include, "#define CODE A\n")
				writeFile(t, other, "#define CODE B\n")
				if err := os.Symlink("settings.h", link); err != nil {
					t.Fatal(err)
				}
				source := keymapText("&kp CODE", `#include "link.h"`, "")
				writeFile(t, path, source)
				doc, err := Load(path)
				if err != nil {
					t.Fatal(err)
				}
				message := "changed on disk"
				switch change {
				case "main":
					source += "// external change\n"
					writeFile(t, path, source)
				case "include":
					writeFile(t, include, "#define CODE C\n")
				case "symlink":
					if err := os.Remove(link); err != nil {
						t.Fatal(err)
					}
					if err := os.Symlink("other.h", link); err != nil {
						t.Fatal(err)
					}
					message = "changed its symlink target"
				}
				_, err = RenameKey(doc, 0, 0, name)
				assertError(t, err, message)
				if readFile(t, path) != source {
					t.Fatal("stale rename overwrote the file")
				}
			})
		}
	}
}

func TestRenameKeyEditsIncludedLayerWithoutReplacingItsSymlink(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "test.keymap")
	layersPath := filepath.Join(directory, "layers.dtsi")
	link := filepath.Join(directory, "link.dtsi")
	layers := "base { bindings = <&kp A " + strings.Repeat("&trans ", 79) + ">; };"
	writeFile(t, layersPath, layers)
	if err := os.Symlink("layers.dtsi", link); err != nil {
		t.Fatal(err)
	}
	source := "/ { keymap { compatible = \"zmk,keymap\";\n#include \"link.dtsi\"\n}; };\n"
	writeFile(t, path, source)
	doc, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	after, err := RenameKey(doc, 0, 0, "A name")
	if err != nil {
		t.Fatal(err)
	}
	if readFile(t, path) != source || readFile(t, layersPath) != strings.Replace(layers, "&kp A", "/* @name A name */ &kp A", 1) {
		t.Fatal("wrong include file edited")
	}
	if target, err := os.Readlink(link); err != nil || target != "layers.dtsi" {
		t.Fatal("rename replaced the include symlink")
	}
	if after.Config.Layers[0].Keys[0].Name != "A name" {
		t.Fatal("rename returned stale config")
	}
}
