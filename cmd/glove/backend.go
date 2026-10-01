package main

import (
	"fmt"
	"path/filepath"

	tea "charm.land/bubbletea/v2"
	"github.com/fix-fox/glove/internal/keymap"
	"github.com/fix-fox/glove/internal/keymapview"
)

type binding = keymapview.Binding
type snapshot = keymapview.Snapshot

type configMsg struct {
	document *keymap.Document
	intent   *keymapview.Intent
	message  string
	err      error
}

type clearSelection struct {
	document        *keymap.Document
	layer, position int
}

func loadConfig(root string) tea.Cmd {
	return func() tea.Msg {
		document, err := keymap.Load(filepath.Join(root, "config", "glove80.keymap"))
		return configMsg{document: document, err: err}
	}
}

// command reads the same immutable document that supplies the displayed key positions.
func (m model) command(line string) tea.Cmd {
	return func() tea.Msg {
		result := keymapview.Dispatch(m.document.Config, line, m.layer, m.side)
		return configMsg{intent: &result}
	}
}

func clearBinding(selection clearSelection) tea.Cmd {
	return func() tea.Msg {
		document, err := keymap.Clear(selection.document, selection.layer, selection.position)
		return configMsg{document: document, err: err, message: fmt.Sprintf("Cleared position %d; saved native config", selection.position)}
	}
}
