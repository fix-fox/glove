package editor

import (
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
