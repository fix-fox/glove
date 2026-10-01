package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/fix-fox/glove/internal/keymap"
)

func fixtureSource(code, layer string) string {
	return `/ { keymap { compatible = "zmk,keymap"; ` + layer + ` { bindings = <&kp ` + code + ` ` + strings.Repeat("&none ", 79) + `>; }; }; };` + "\n"
}

func nativeFixture(t *testing.T, code, layer string) *commandSession {
	t.Helper()
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, "config"), 0755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(root, "config", "glove80.keymap")
	if err := os.WriteFile(path, []byte(fixtureSource(code, layer)), 0640); err != nil {
		t.Fatal(err)
	}
	doc, err := keymap.Load(path)
	if err != nil {
		t.Fatal(err)
	}
	return &commandSession{root: root, document: doc, side: "both", input: strings.NewReader(""), output: &bytes.Buffer{}, diagnostics: &bytes.Buffer{}}
}

func replaceFixture(t *testing.T, session *commandSession, content string) {
	t.Helper()
	if err := os.WriteFile(session.document.Path, []byte(content), 0640); err != nil {
		t.Fatal(err)
	}
}

func TestOneShotInspectionClearAndValidation(t *testing.T) {
	s := nativeFixture(t, "A", "base")
	for _, args := range [][]string{{"key", "0"}, {"rm", "0"}, {"--check-config"}} {
		var output, errors bytes.Buffer
		err := run(append([]string{"--root", s.root}, args...), strings.NewReader(""), &output, &errors, false)
		if err != nil {
			t.Fatalf("%v: %v", args, err)
		}
		expected := "kp A"
		if args[0] == "rm" {
			expected = "saved native config"
		}
		if args[0] == "--check-config" {
			expected = "Valid keymap: 1 layers"
		}
		if !strings.Contains(output.String(), expected) {
			t.Fatalf("missing %s in %s", expected, output.String())
		}
	}
	data, err := os.ReadFile(s.document.Path)
	if err != nil || string(data) != strings.Replace(fixtureSource("A", "base"), "&kp A", "&none", 1) {
		t.Fatalf("clear changed surrounding source: %s %v", data, err)
	}
}

func TestCommandErrorsReturnFailureWithoutStackTrace(t *testing.T) {
	s := nativeFixture(t, "A", "base")
	for _, args := range [][]string{{"bogus"}, {"rm", "nope"}, {"layer", "missing"}, {"reload", "other.keymap"}, {"edit"}, {"--layout=focus"}, {"--keys=compact"}} {
		var output, diagnostics bytes.Buffer
		err := run(append([]string{"--root", s.root}, args...), strings.NewReader(""), &output, &diagnostics, false)
		if err == nil {
			t.Fatalf("%v should fail", args)
		}
		if args[0] == "edit" && !strings.Contains(err.Error(), "edit requires an interactive terminal") {
			t.Fatal(err)
		}
	}
	replaceFixture(t, s, "/ { bad")
	err := run([]string{"--root", s.root, "layers"}, strings.NewReader(""), &bytes.Buffer{}, &bytes.Buffer{}, false)
	if err == nil || !strings.Contains(err.Error(), "Unable to load keymap:") {
		t.Fatalf("missing startup diagnostic: %v", err)
	}
}

func TestFailedReloadRetainsLastGoodReadModelThenRecovers(t *testing.T) {
	s := nativeFixture(t, "A", "base")
	original := s.document
	replaceFixture(t, s, "/ { bad")
	if _, err := s.execute("reload"); err == nil {
		t.Fatal("invalid reload accepted")
	}
	if _, err := s.execute("key 0"); err != nil {
		t.Fatal(err)
	}
	if s.document != original || !strings.Contains(s.output.(*bytes.Buffer).String(), "kp A") {
		t.Fatal("last good map lost")
	}
	replaceFixture(t, s, fixtureSource("B", "renamed"))
	if _, err := s.execute("reload"); err != nil {
		t.Fatal(err)
	}
	s.output.(*bytes.Buffer).Reset()
	s.execute("key 0")
	if !strings.Contains(s.output.(*bytes.Buffer).String(), "kp B") || !strings.Contains(s.output.(*bytes.Buffer).String(), "renamed") {
		t.Fatal("reload failed to adopt repaired map")
	}
}

func TestClearRejectsExternalEditsIncludingAlreadyClearKeys(t *testing.T) {
	for _, initiallyClear := range []bool{false, true} {
		s := nativeFixture(t, "A", "base")
		if initiallyClear {
			replaceFixture(t, s, strings.Replace(fixtureSource("A", "base"), "&kp A", "&none", 1))
			if err := s.reload(); err != nil {
				t.Fatal(err)
			}
		}
		original := s.document
		replaceFixture(t, s, fixtureSource("B", "base"))
		if _, err := s.execute("rm 0"); err == nil || !strings.Contains(strings.ToLower(err.Error()), "reload") {
			t.Fatalf("stale edit accepted: %v", err)
		}
		data, _ := os.ReadFile(s.document.Path)
		if string(data) != fixtureSource("B", "base") || s.document != original {
			t.Fatal("failed edit changed source or snapshot")
		}
		if err := s.reload(); err != nil {
			t.Fatal(err)
		}
		if _, err := s.execute("rm 0"); err != nil {
			t.Fatal(err)
		}
		data, _ = os.ReadFile(s.document.Path)
		if string(data) != strings.Replace(fixtureSource("B", "base"), "&kp B", "&none", 1) {
			t.Fatal("clear after reload failed")
		}
	}
}

func TestFlashValidatesBeforeSubprocessAndReportsExitFailure(t *testing.T) {
	s := nativeFixture(t, "A", "base")
	if err := os.Mkdir(filepath.Join(s.root, "scripts"), 0755); err != nil {
		t.Fatal(err)
	}
	script := filepath.Join(s.root, "scripts", "glove-flash.sh")
	if err := os.WriteFile(script, []byte("echo unexpected-build\nexit 7\n"), 0600); err != nil {
		t.Fatal(err)
	}
	replaceFixture(t, s, "/ { bad")
	if _, err := s.execute("flash"); err == nil {
		t.Fatal("invalid config started flash")
	}
	if strings.Contains(s.output.(*bytes.Buffer).String(), "unexpected-build") {
		t.Fatal("flash subprocess started")
	}
	replaceFixture(t, s, fixtureSource("B", "base"))
	if _, err := s.execute("flash"); err == nil || !strings.Contains(err.Error(), "Flash exited with code 7") {
		t.Fatalf("missing subprocess failure: %v", err)
	}
	if s.document.Config.Layers[0].Keys[0].Tap.KeyCode != "B" {
		t.Fatal("flash did not reload current config")
	}
}

func TestPipedCommandsPreserveErrorsAndQuitStopsInput(t *testing.T) {
	s := nativeFixture(t, "A", "base")
	var output, diagnostics bytes.Buffer
	err := run([]string{"--root", s.root}, strings.NewReader("bogus\nkey 0\nquit\nrm 0\n"), &output, &diagnostics, false)
	if err == nil || diagnostics.Len() == 0 || !strings.Contains(output.String(), "kp A") {
		t.Fatal("piped errors or last good output lost")
	}
	data, _ := os.ReadFile(s.document.Path)
	if string(data) != fixtureSource("A", "base") {
		t.Fatal("commands after quit executed")
	}
}
