package main

import (
	"fmt"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

func (m *model) openKeyName() tea.Cmd {
	if m.document == nil {
		return nil
	}
	if !m.document.Bindings[m.layer][m.selected].Editable {
		m.status = "This binding is shared. Use e to edit its source."
		return nil
	}
	m.naming = bindingSelection{document: m.document, layer: m.layer, position: m.selected}
	m.mode, m.screen, m.output = "name", "keyboard", ""
	m.resetInput("Name this key…")
	// Existing names are never truncated when reopening the input.
	m.input.CharLimit = 0
	m.input.SetValue(m.selectedBinding().Name)
	m.input.CursorEnd()
	m.resize()
	return m.input.Focus()
}

func (m model) updateKeyName(msg tea.Msg) (tea.Model, tea.Cmd) {
	if m.busy {
		return m, nil
	}
	if key, ok := msg.(tea.KeyPressMsg); ok && key.String() == "enter" {
		m.busy, m.status = true, "Saving key name…"
		return m, tea.Batch(renameBinding(m.naming, m.input.Value()), m.spinner.Tick)
	}
	previous := m.input.Value()
	var cmd tea.Cmd
	m.input, cmd = m.input.Update(msg)
	if previous != m.input.Value() {
		m.output = ""
	}
	return m, cmd
}

func (m model) keyNameView(w, h int) string {
	key := m.selectedBinding()
	content := textStyle.Bold(true).Render("Name selected key") + "\n"
	content += dimStyle.Render(fmt.Sprintf("%s · pos %d", m.data.Layers[m.layer].Name, key.Position)) + "\n\n"
	content += lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(lavender).Width(w-4).Padding(0, 1).Render(m.input.View()) + "\n"
	content += dimStyle.Render("Enter saves · Empty removes · Esc cancels")
	if m.output != "" {
		content += "\n\n" + lipgloss.NewStyle().Foreground(rose).Width(w).Render(m.output)
	} else {
		content += "\n\n" + dimStyle.Width(w).Render("Shown on the keycap and in details for this layer. Tap and hold actions stay the same.")
	}
	return fit(content, w, h)
}
