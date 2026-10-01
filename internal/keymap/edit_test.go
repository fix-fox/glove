package keymap

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func editFixture(t *testing.T, first, header string) (string, string, *Document) {
	t.Helper()
	directory := t.TempDir()
	path := filepath.Join(directory, "test.keymap")
	source := strings.Replace(keymapText(first, header, ""), first+" ", first+" /* keep trailing comment */ ", 1)
	source = strings.Replace(source, "<&none ", "<&kp B ", 1)
	writeFile(t, path, source)
	if err := os.Chmod(path, 0640); err != nil {
		t.Fatal(err)
	}
	doc, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	return path, source, doc
}

func readFile(t testing.TB, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

func TestClearPreservesOtherTextPermissionsAndConsecutiveRanges(t *testing.T) {
	path, source, doc := editFixture(t, "&kp LC(A)", "")
	after, err := Clear(doc, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if got := readFile(t, path); got != strings.Replace(source, "&kp LC(A)", "&none", 1) {
		t.Fatalf("unexpected edit: %s", got)
	}
	if after.Config.Layers[0].Keys[0] != (Key{Tap: Behavior{Type: "none"}}) {
		t.Fatal("wrong base replacement")
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0640 {
		t.Fatalf("mode changed to %o", info.Mode().Perm())
	}
	entries, err := os.ReadDir(filepath.Dir(path))
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].Name() != "test.keymap" {
		t.Fatalf("temporary file leaked: %v", entries)
	}
	after, err = Clear(after, 1, 0)
	if err != nil {
		t.Fatal(err)
	}
	if after.Config.Layers[1].Keys[0] != (Key{Tap: Behavior{Type: "trans"}}) || !strings.Contains(readFile(t, path), "nav { bindings = <&trans ") {
		t.Fatal("consecutive edit used stale ranges")
	}
	unchanged, err := Clear(after, 1, 0)
	if err != nil || unchanged != after {
		t.Fatal("already transparent key should be a no-op")
	}
}

func TestClearConstantArgumentEditsItsLiteralUseOnly(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "test.keymap")
	settings := filepath.Join(directory, "settings.h")
	writeFile(t, settings, "#define TARGET 1\n")
	source := keymapText("&to TARGET", `#include "settings.h"`, "")
	writeFile(t, path, source)
	doc, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	_, err = Clear(doc, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if readFile(t, path) != strings.Replace(source, "&to TARGET", "&none", 1) || readFile(t, settings) != "#define TARGET 1\n" {
		t.Fatal("constant edit changed shared definition")
	}
}

func TestClearRefusesStaleMainAndIncludedFilesEvenForNoOp(t *testing.T) {
	path, source, doc := editFixture(t, "&kp LC(A)", "")
	external := strings.Replace(source, "&kp B", "&kp C", 1)
	writeFile(t, path, external)
	_, err := Clear(doc, 0, 0)
	assertError(t, err, "changed on disk")
	if readFile(t, path) != external {
		t.Fatal("overwrote external edit")
	}
	directory := t.TempDir()
	path = filepath.Join(directory, "test.keymap")
	settings := filepath.Join(directory, "settings.h")
	writeFile(t, settings, "#define TARGET 1\n")
	source = keymapText("&none", `#include "settings.h"`, "")
	writeFile(t, path, source)
	doc, err = Load(path)
	if err != nil {
		t.Fatal(err)
	}
	writeFile(t, settings, "#define TARGET 0\n")
	_, err = Clear(doc, 0, 0)
	assertError(t, err, "changed on disk")
	if readFile(t, path) != source {
		t.Fatal("no-op changed source")
	}
}

func TestClearRefusesRetargetedIncludeSymlink(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "test.keymap")
	link := filepath.Join(directory, "settings.h")
	old := filepath.Join(directory, "old.h")
	next := filepath.Join(directory, "new.h")
	writeFile(t, old, "#define TARGET 1\n")
	writeFile(t, next, "#define TARGET 0\n")
	if err := os.Symlink("old.h", link); err != nil {
		t.Fatal(err)
	}
	source := keymapText("&to TARGET", `#include "settings.h"`, "")
	writeFile(t, path, source)
	doc, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(link); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("new.h", link); err != nil {
		t.Fatal(err)
	}
	_, err = Clear(doc, 0, 0)
	assertError(t, err, "changed its symlink target")
	if readFile(t, path) != source || readFile(t, old) != "#define TARGET 1\n" || readFile(t, next) != "#define TARGET 0\n" {
		t.Fatal("retargeted include was modified")
	}
}

func TestClearRefusesSharedMacrosAndEmbeddedComments(t *testing.T) {
	for _, tc := range []struct{ first, header, error string }{
		{"KEY", "#define KEY &kp A", "shared macro"},
		{"&KEY A", "#define KEY kp", "shared macro"},
		{"&kp /* important */ A", "", "contains comments"},
		{"&kp // important\n A", "", "contains comments"},
	} {
		t.Run(tc.first, func(t *testing.T) {
			path, source, doc := editFixture(t, tc.first, tc.header)
			_, err := Clear(doc, 0, 0)
			assertError(t, err, tc.error)
			if readFile(t, path) != source {
				t.Fatal("refused edit changed source")
			}
		})
	}
}

func TestClearRejectsInvalidPositionsAndCandidateWithoutWriting(t *testing.T) {
	path, source, doc := editFixture(t, "&kp LC(A)", "")
	for _, pair := range [][2]int{{-1, 0}, {0, -1}, {0, 80}, {2, 0}} {
		if _, err := Clear(doc, pair[0], pair[1]); err == nil {
			t.Fatalf("accepted invalid position %v", pair)
		}
	}
	// A damaged source range must fail candidate validation before creating a temp file.
	doc.Bindings[0][0].End += len(" /* keep trailing comment */ &trans")
	_, err := Clear(doc, 0, 0)
	assertError(t, err, "contains comments")
	doc.Bindings[0][0].End = doc.Bindings[0][0].Start + len("&kp LC(A)")
	doc.Bindings[0][0].Start++
	_, err = Clear(doc, 0, 0)
	assertError(t, err, "contains comments or shared syntax")
	if readFile(t, path) != source {
		t.Fatal("invalid edit changed source")
	}
	// Without an embedded comment, a range spanning two bindings invalidates the layer.
	writeFile(t, path, keymapText("&kp A", "", ""))
	doc, err = Load(path)
	if err != nil {
		t.Fatal(err)
	}
	source = readFile(t, path)
	doc.Bindings[0][0].End = doc.Bindings[0][1].End
	_, err = Clear(doc, 0, 0)
	assertError(t, err, "needs 80 bindings, got 79")
	if readFile(t, path) != source {
		t.Fatal("invalid candidate reached disk")
	}
	entries, err := os.ReadDir(filepath.Dir(path))
	if err != nil || len(entries) != 1 {
		t.Fatal("invalid candidate left temporary files")
	}
}

func TestClearUsesByteOffsetsWithUnicodeBeforeAndInsideLabels(t *testing.T) {
	path, source, doc := editFixture(t, "&kp LC(A)", "\uFEFF// עברית 🦊\n")
	source = strings.Replace(source, "base {", "// @label עברית 🦊\nbase {", 1)
	writeFile(t, path, source)
	doc, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	b := doc.Bindings[0][0]
	if source[b.Start:b.End] != "&kp LC(A)" {
		t.Fatalf("invalid byte offsets %+v", b)
	}
	after, err := Clear(doc, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if readFile(t, path) != strings.Replace(source, "&kp LC(A)", "&none", 1) || after.Config.Layers[0].Name != "עברית 🦊" {
		t.Fatal("Unicode edit changed unrelated bytes")
	}
}

func TestClearIncludedLayerSourceKeepsMainAndSymlink(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "test.keymap")
	layerPath := filepath.Join(directory, "layers.dtsi")
	link := filepath.Join(directory, "link.dtsi")
	layers := "base { bindings = <&kp A " + strings.Repeat("&trans ", 79) + ">; };"
	writeFile(t, layerPath, layers)
	if err := os.Symlink("layers.dtsi", link); err != nil {
		t.Fatal(err)
	}
	source := "/ { keymap { compatible = \"zmk,keymap\";\n#include \"link.dtsi\"\n}; };\n"
	writeFile(t, path, source)
	doc, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	after, err := Clear(doc, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if readFile(t, path) != source || readFile(t, layerPath) != strings.Replace(layers, "&kp A", "&none", 1) {
		t.Fatal("wrong include source edited")
	}
	if target, err := os.Readlink(link); err != nil || target != "layers.dtsi" {
		t.Fatal("edit replaced include symlink")
	}
	if err := AssertUnchanged(after); err != nil {
		t.Fatalf("candidate source tracking stale: %v", err)
	}
	if !reflect.DeepEqual(after.Config.Layers[0].Keys[0], Key{Tap: Behavior{Type: "none"}}) {
		t.Fatal("returned stale model")
	}
}
