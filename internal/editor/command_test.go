package editor

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestParseEditorArgumentsWithoutShellExpansion(t *testing.T) {
	for _, test := range []struct {
		input string
		want  []string
	}{
		{`code --wait`, []string{"code", "--wait"}},
		{`"/Applications/Visual Studio Code.app/bin/code" --wait`, []string{"/Applications/Visual Studio Code.app/bin/code", "--wait"}},
		{`editor --name 'two words' ""`, []string{"editor", "--name", "two words", ""}},
		{`my\ editor --arg=hello\ world`, []string{"my editor", "--arg=hello world"}},
		{`editor '$HOME' '$(touch /tmp/nope)' ';'`, []string{"editor", "$HOME", "$(touch /tmp/nope)", ";"}},
		{`editor "a\\b" 'a\b'`, []string{"editor", `a\b`, `a\b`}},
		{`editor שלום`, []string{"editor", "שלום"}},
	} {
		got, err := Parse(test.input)
		if err != nil || !reflect.DeepEqual(got, test.want) {
			t.Errorf("Parse(%q) = %v, %v", test.input, got, err)
		}
	}
}

func TestParseRejectsIncompleteEditorCommands(t *testing.T) {
	for _, test := range []struct{ input, message string }{{"", "executable"}, {`"" foo`, "executable"}, {`editor 'oops`, "unclosed quote"}, {`editor \`, "incomplete escape"}} {
		_, err := Parse(test.input)
		if err == nil || !strings.Contains(err.Error(), test.message) {
			t.Fatalf("Parse(%q) should report %s, got %v", test.input, test.message, err)
		}
	}
}

func TestEditorPrecedenceAndLiteralFileArgument(t *testing.T) {
	t.Setenv("VISUAL", "editor --wait")
	t.Setenv("EDITOR", "other")
	path := "/tmp/config with spaces.keymap"
	cmd, err := Command(path)
	if err != nil || !reflect.DeepEqual(cmd.Args, []string{"editor", "--wait", path}) {
		t.Fatalf("unexpected visual: %v %v", cmd, err)
	}
	t.Setenv("VISUAL", " ")
	cmd, err = Command(path)
	if err != nil || cmd.Args[0] != "other" {
		t.Fatalf("EDITOR not selected: %v %v", cmd, err)
	}
	t.Setenv("EDITOR", "")
	cmd, err = Command(path)
	if err != nil || cmd.Args[0] != "vi" {
		t.Fatalf("vi not selected: %v %v", cmd, err)
	}
}

func TestCommandAtUsesVimAndLiteralFileArgument(t *testing.T) {
	t.Setenv("VISUAL", "code --wait")
	t.Setenv("EDITOR", "nano")
	path := "-config with spaces; $(touch nope).keymap"
	cmd, err := CommandAt(path, 23, 47)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"vim", "-c", "call cursor(23,47)", "--", path}
	if !reflect.DeepEqual(cmd.Args, want) {
		t.Fatalf("CommandAt arguments = %q, want %q", cmd.Args, want)
	}
}

func TestCommandAtRejectsMissingFileAndInvalidCoordinates(t *testing.T) {
	for _, test := range []struct {
		name, path   string
		line, column int
		message      string
	}{
		{"missing file", "", 1, 1, "file path must not be empty"},
		{"zero line", "config.keymap", 0, 1, "line and byte column must be positive"},
		{"negative line", "config.keymap", -1, 1, "line and byte column must be positive"},
		{"zero column", "config.keymap", 1, 0, "line and byte column must be positive"},
		{"negative column", "config.keymap", 1, -1, "line and byte column must be positive"},
	} {
		t.Run(test.name, func(t *testing.T) {
			cmd, err := CommandAt(test.path, test.line, test.column)
			if cmd != nil || err == nil || !strings.Contains(err.Error(), test.message) {
				t.Fatalf("CommandAt(%q, %d, %d) = %v, %v; want %s", test.path, test.line, test.column, cmd, err, test.message)
			}
		})
	}
}

func TestCommandAtPositionsVimAtByteColumn(t *testing.T) {
	if _, err := exec.LookPath("vim"); err != nil {
		t.Skip("Vim is not installed")
	}
	for _, test := range []struct {
		name, content string
		line, column  int
	}{
		{"first position", "&kp Q\n", 1, 1},
		{"second line", "first line\n    &kp Q\n", 2, 5},
		{"Unicode and tab prefix", "first line\n\tשלום &kp Q\n", 2, len("\tשלום ") + 1},
	} {
		t.Run(test.name, func(t *testing.T) {
			dir := t.TempDir()
			path := filepath.Join(dir, "config with spaces.keymap")
			if err := os.WriteFile(path, []byte(test.content), 0o600); err != nil {
				t.Fatal(err)
			}
			checkPath := filepath.Join(dir, "check.vim")
			check := fmt.Sprintf("if line('.') != %d || col('.') != %d\n  cquit\nendif\nqa!\n", test.line, test.column)
			if err := os.WriteFile(checkPath, []byte(check), 0o600); err != nil {
				t.Fatal(err)
			}
			cmd, err := CommandAt(path, test.line, test.column)
			if err != nil {
				t.Fatal(err)
			}
			args := []string{"vim", "-Nu", "NONE", "-n", "-i", "NONE", "-es"}
			args = append(args, cmd.Args[1:len(cmd.Args)-2]...)
			args = append(args, "-S", checkPath)
			cmd.Args = append(args, cmd.Args[len(cmd.Args)-2:]...)
			if output, err := cmd.CombinedOutput(); err != nil {
				t.Fatalf("Vim did not reach %d:%d: %v\n%s", test.line, test.column, err, output)
			}
		})
	}
}
