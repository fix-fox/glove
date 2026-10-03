package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/fix-fox/glove/internal/editor"
	"github.com/fix-fox/glove/internal/keymap"
)

// bindingEditor refreshes source offsets before positioning Vim at the selected key.
func (m *model) bindingEditor() (*exec.Cmd, error) {
	path := filepath.Join(m.root, "config", "glove80.keymap")
	if m.document != nil {
		path = m.document.Path
	}
	if current, err := keymap.Load(path); err == nil {
		m.setDocument(current)
	}
	line, column := 1, 1
	if doc := m.document; doc != nil && m.layer >= 0 && m.layer < len(doc.Bindings) && m.selected >= 0 && m.selected < len(doc.Bindings[m.layer]) {
		binding := doc.Bindings[m.layer][m.selected]
		path = binding.File
		// A broken external edit can prevent reload. Still open the file for repair,
		// but use old offsets only when that binding's source text is unchanged.
		contents, err := os.ReadFile(path)
		if err == nil && string(contents) == doc.Sources[path] && binding.Start >= 0 && binding.Start < len(contents) {
			prefix := string(contents[:binding.Start])
			line = strings.Count(prefix, "\n") + 1
			column = binding.Start - strings.LastIndex(prefix, "\n")
		}
	}
	return editor.CommandAt(path, line, column)
}
