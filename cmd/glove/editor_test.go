package main

import (
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/fix-fox/glove/internal/keymap"
)

func TestVimTargetsSelectedBindingInIncludeWithByteColumnsAndFreshOffsets(t *testing.T) {
	s := nativeFixture(t, "A", "base")
	path := filepath.Join(s.root, "config", "keys.dtsi")
	source := "// Layer bindings\n" + strings.Replace(fixtureSource("A", "base"), "&kp A", "\t/* העתק */ &kp A /* @name Copy */ &kp LG(C)", 1)
	source = strings.Replace(source, "&none ", "", 1)
	if err := os.WriteFile(path, []byte(source), 0640); err != nil {
		t.Fatal(err)
	}
	replaceFixture(t, s, "#include \"keys.dtsi\"\n")
	doc, err := keymap.Load(s.document.Path)
	if err != nil {
		t.Fatal(err)
	}
	resolvedPath, err := filepath.EvalSymlinks(path)
	if err != nil {
		t.Fatal(err)
	}
	m := newModel(s.root)
	m.setDocument(doc)
	m.selected, m.busy = 1, false
	for _, prefix := range []string{"", "// New external line\n\n"} {
		current := prefix + source
		if err := os.WriteFile(path, []byte(current), 0640); err != nil {
			t.Fatal(err)
		}
		cmd, err := m.bindingEditor()
		if err != nil {
			t.Fatal(err)
		}
		offset := strings.Index(current, "&kp LG(C)")
		line := strings.Count(current[:offset], "\n") + 1
		column := offset - strings.LastIndex(current[:offset], "\n")
		want := []string{"vim", "-c", fmt.Sprintf("call cursor(%d,%d)", line, column), "--", resolvedPath}
		if !slices.Equal(cmd.Args, want) {
			t.Fatalf("got %v, want %v", cmd.Args, want)
		}
	}
	_, cmd := press(m, 'e')
	if cmd == nil {
		t.Fatal("e did not start the positioned editor action")
	}
}

func TestVimAllowsRepairingInvalidConfigWithoutUsingStaleOffsets(t *testing.T) {
	s := nativeFixture(t, "A", "base")
	m := newModel(s.root)
	m.setDocument(s.document)
	m.selected, m.busy = 0, false
	replaceFixture(t, s, "// Broken\n/ { invalid")
	resolvedPath, err := filepath.EvalSymlinks(s.document.Path)
	if err != nil {
		t.Fatal(err)
	}
	for _, loaded := range []bool{true, false} {
		if !loaded {
			m.document = nil
		}
		cmd, err := m.bindingEditor()
		if err != nil {
			t.Fatal(err)
		}
		openedPath, err := filepath.EvalSymlinks(cmd.Args[len(cmd.Args)-1])
		if err != nil || openedPath != resolvedPath || cmd.Args[2] != "call cursor(1,1)" {
			t.Fatalf("editor should open the file for repair: %v, %v", cmd, err)
		}
	}
}
