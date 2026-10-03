// Package editor starts the user's editor without evaluating shell expressions.
package editor

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
	"unicode"
)

// Parse splits quoted executable paths and arguments without shell expansion.
func Parse(command string) ([]string, error) {
	var args []string
	var word strings.Builder
	var quote rune
	started, escaped := false, false
	for _, char := range command {
		if escaped {
			word.WriteRune(char)
			started, escaped = true, false
		} else if char == '\\' && quote != '\'' {
			escaped = true
		} else if quote != 0 {
			if char == quote {
				quote = 0
			} else {
				word.WriteRune(char)
			}
		} else if char == '\'' || char == '"' {
			quote, started = char, true
		} else if unicode.IsSpace(char) {
			if started {
				args = append(args, word.String())
				word.Reset()
				started = false
			}
		} else {
			word.WriteRune(char)
			started = true
		}
	}
	if escaped {
		return nil, fmt.Errorf("editor command ends with an incomplete escape")
	}
	if quote != 0 {
		return nil, fmt.Errorf("editor command contains an unclosed quote")
	}
	if started {
		args = append(args, word.String())
	}
	if len(args) == 0 || args[0] == "" {
		return nil, fmt.Errorf("editor command must name an executable")
	}
	return args, nil
}

func Command(path string) (*exec.Cmd, error) {
	value := strings.TrimSpace(os.Getenv("VISUAL"))
	if value == "" {
		value = strings.TrimSpace(os.Getenv("EDITOR"))
	}
	if value == "" {
		value = "vi"
	}
	args, err := Parse(value)
	if err != nil {
		return nil, err
	}
	return exec.Command(args[0], append(args[1:], path)...), nil
}

// CommandAt opens Vim at a 1-based line and byte column in the file.
func CommandAt(path string, line, column int) (*exec.Cmd, error) {
	if path == "" {
		return nil, fmt.Errorf("editor file path must not be empty")
	}
	if line < 1 || column < 1 {
		return nil, fmt.Errorf("editor line and byte column must be positive, got %d:%d", line, column)
	}
	return exec.Command("vim", "-c", fmt.Sprintf("call cursor(%d,%d)", line, column), "--", path), nil
}
