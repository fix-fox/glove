package main

import (
	"fmt"
	"slices"
	"strings"

	"charm.land/bubbles/v2/list"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"
	"github.com/fix-fox/glove/internal/keymap"
	"github.com/fix-fox/glove/internal/keymapview"
)

type keyEditorState struct {
	selection bindingSelection
	draft     keymap.KeyEdit
	page      string
	field     int
	readOnly  string
}

type keyActionChoice struct {
	title, description string
	action             keymap.KeyAction
	clearHold          bool
}

func (i keyActionChoice) Title() string       { return i.title }
func (i keyActionChoice) Description() string { return i.description }
func (i keyActionChoice) FilterValue() string {
	return i.title + " " + i.description + " " + i.action.Code
}

var shortcutModifiers = []struct{ code, label string }{
	{"LG", "Left Cmd"}, {"LS", "Left Shift"}, {"LC", "Left Ctrl"}, {"LA", "Left Alt / Option"},
	{"RG", "Right Cmd"}, {"RS", "Right Shift"}, {"RC", "Right Ctrl"}, {"RA", "Right Alt / Option"},
}

func editorKeyLabel(code string) string {
	switch code {
	case "LSHIFT", "RSHIFT", "LCTRL", "RCTRL", "LALT", "RALT", "LGUI", "RGUI":
		labels := map[string]string{"LSHIFT": "Left Shift", "RSHIFT": "Right Shift", "LCTRL": "Left Ctrl", "RCTRL": "Right Ctrl", "LALT": "Left Alt / Option", "RALT": "Right Alt / Option", "LGUI": "Left Cmd", "RGUI": "Right Cmd"}
		return labels[code]
	}
	for _, entry := range keymapview.Keycodes {
		if entry.Code == code {
			return entry.Label
		}
	}
	return keymapview.KeyCodeLabel(code, false)
}

func shortcutLabel(code string) string {
	base, mods := keymapview.ParseModifiedKeyCode(code)
	parts := []string{}
	for _, mod := range mods {
		for _, option := range shortcutModifiers {
			if mod == option.code {
				parts = append(parts, strings.TrimPrefix(option.label, "Left "))
			}
		}
	}
	return strings.Join(append(parts, editorKeyLabel(base)), "+")
}

func (m model) keyActionLabel(action keymap.KeyAction) string {
	switch action.Kind {
	case keymap.KeyPress:
		return shortcutLabel(action.Code)
	case keymap.LayerWhileHeld, keymap.LayerToggle, keymap.LayerSwitch:
		prefix := map[keymap.KeyActionKind]string{keymap.LayerWhileHeld: "Hold layer: ", keymap.LayerToggle: "Toggle layer: ", keymap.LayerSwitch: "Switch to: "}[action.Kind]
		return prefix + keymapview.DisplayText(m.document.Config.Layers[action.Layer].Name, false)
	case keymap.KeyDisabled:
		return "Do nothing"
	case keymap.KeyTransparent:
		return "Use lower layer"
	}
	return ""
}

func (m *model) openKeyEdit() tea.Cmd {
	if m.document == nil {
		return nil
	}
	draft, err := keymap.ReadKeyEdit(m.document, m.layer, m.selected)
	m.keyEditor = keyEditorState{
		selection: bindingSelection{document: m.document, layer: m.layer, position: m.selected},
		draft:     draft, page: "form", field: 1,
	}
	m.mode, m.screen, m.output = "key-edit", "keyboard", ""
	m.input.Blur()
	if err != nil {
		m.keyEditor.readOnly = err.Error()
		m.output = m.selectedBinding().Detail
	}
	m.resize()
	m.viewport.GotoTop()
	return nil
}

func (m *model) closeKeyEdit() {
	m.mode, m.output, m.status = "", "", "Ready"
	m.keyEditor = keyEditorState{}
	m.input.Blur()
	m.resize()
}

func (m *model) keyEditForm() {
	m.keyEditor.page, m.output = "form", ""
	m.input.Blur()
	m.resize()
}

func (m *model) openKeyActions(hold bool) tea.Cmd {
	m.keyEditor.page, m.choiceTitle = "tap", "On tap / key action"
	items := []list.Item{}
	if hold {
		m.keyEditor.page, m.choiceTitle = "hold", "On hold"
		items = append(items, keyActionChoice{title: "Normal key behavior", description: "Remove the separate hold action", clearHold: true})
	}
	for _, entry := range keymapview.Keycodes {
		if hold && !keymap.IsModifierKey(entry.Code) {
			continue
		}
		items = append(items, keyActionChoice{title: editorKeyLabel(entry.Code), description: entry.Category + " · " + entry.Code, action: keymap.KeyAction{Kind: keymap.KeyPress, Code: entry.Code}})
	}
	for index := range m.document.Config.Layers {
		kinds := []keymap.KeyActionKind{keymap.LayerWhileHeld}
		if !hold {
			kinds = append(kinds, keymap.LayerToggle, keymap.LayerSwitch)
		}
		for _, kind := range kinds {
			action := keymap.KeyAction{Kind: kind, Layer: index}
			description := "Active until this key is released"
			if !hold {
				description = "Whole key action; replaces tap and hold"
			}
			items = append(items, keyActionChoice{title: m.keyActionLabel(action), description: description, action: action})
		}
	}
	if !hold {
		for _, kind := range []keymap.KeyActionKind{keymap.KeyDisabled, keymap.KeyTransparent} {
			action := keymap.KeyAction{Kind: kind}
			items = append(items, keyActionChoice{title: m.keyActionLabel(action), description: "Whole key action; replaces tap and hold", action: action})
		}
	}
	m.picker, m.pickerItems = newChoices(), items
	m.resetInput("Search keys, modifiers, or layers…")
	m.refreshChoices()
	m.resize()
	return m.input.Focus()
}

func (m *model) refreshShortcutModifiers(selected int) {
	_, mods := keymapview.ParseModifiedKeyCode(m.keyEditor.draft.Tap.Code)
	items := []list.Item{}
	for _, option := range shortcutModifiers {
		mark := "[ ] "
		if slices.Contains(mods, option.code) {
			mark = "[x] "
		}
		items = append(items, menuItem{mark + option.label, "Space or Enter toggles", option.code})
	}
	items = append(items, menuItem{"Done", "Return to the key editor", "done"})
	m.picker.SetItems(items)
	m.picker.Select(selected)
}

func withShortcutModifiers(base string, mods []string) string {
	for i := len(mods) - 1; i >= 0; i-- {
		base = mods[i] + "(" + base + ")"
	}
	return base
}

func (m *model) activateKeyEditField() tea.Cmd {
	switch m.keyEditor.field {
	case 0:
		m.keyEditor.page = "name"
		m.resetInput("Name this key…")
		m.input.CharLimit = 0
		m.input.SetValue(m.keyEditor.draft.Name)
		m.input.CursorEnd()
		return m.input.Focus()
	case 1:
		return m.openKeyActions(false)
	case 2:
		if m.keyEditor.draft.Tap.Kind != keymap.KeyPress {
			m.output = "Choose a key or shortcut on tap first."
			return nil
		}
		return m.openKeyActions(true)
	case 3:
		if m.keyEditor.draft.Tap.Kind != keymap.KeyPress {
			m.output = "Choose a key on tap to add shortcut modifiers."
			return nil
		}
		m.keyEditor.page = "modifiers"
		m.picker = newChoices()
		m.refreshShortcutModifiers(0)
		m.resize()
	case 4:
		if err := keymap.ValidateKeyEdit(m.keyEditor.draft, len(m.document.Config.Layers)); err != nil {
			m.output = err.Error()
			return nil
		}
		m.busy, m.status = true, "Saving key…"
		return tea.Batch(saveKeyBinding(m.keyEditor.selection, m.keyEditor.draft), m.spinner.Tick)
	case 5:
		m.closeKeyEdit()
	case 6:
		return m.perform("editor")
	}
	return nil
}

// updateKeyEdit keeps all choices in a draft until the explicit Save action.
func (m model) updateKeyEdit(msg tea.Msg) (tea.Model, tea.Cmd) {
	if m.busy {
		return m, nil
	}
	if press, ok := msg.(tea.KeyPressMsg); ok {
		key := press.String()
		if key == "esc" {
			if m.keyEditor.page == "form" || m.keyEditor.readOnly != "" {
				m.closeKeyEdit()
			} else {
				m.keyEditForm()
			}
			return m, nil
		}
		if (key == "E" || key == "shift+e") && (m.keyEditor.page == "form" || m.keyEditor.readOnly != "") {
			return m.do("editor")
		}
		if m.keyEditor.readOnly != "" {
			var cmd tea.Cmd
			m.viewport, cmd = m.viewport.Update(msg)
			return m, cmd
		}
		switch m.keyEditor.page {
		case "form":
			switch key {
			case "tab", "down", "right":
				m.keyEditor.field = (m.keyEditor.field + 1) % 7
			case "shift+tab", "up", "left":
				m.keyEditor.field = (m.keyEditor.field + 6) % 7
			case "enter", "space":
				cmd := m.activateKeyEditField()
				return m, cmd
			}
			return m, nil
		case "name":
			if key == "enter" {
				m.keyEditor.draft.Name = m.input.Value()
				m.keyEditForm()
				return m, nil
			}
		case "tap", "hold":
			if key == "enter" {
				if item, ok := m.picker.SelectedItem().(keyActionChoice); ok {
					if m.keyEditor.page == "hold" {
						m.keyEditor.draft.Hold = nil
						if !item.clearHold {
							action := item.action
							m.keyEditor.draft.Hold = &action
						}
					} else {
						action := item.action
						if action.Kind == keymap.KeyPress && m.keyEditor.draft.Tap.Kind == keymap.KeyPress {
							_, mods := keymapview.ParseModifiedKeyCode(m.keyEditor.draft.Tap.Code)
							action.Code = withShortcutModifiers(action.Code, mods)
						}
						m.keyEditor.draft.Tap = action
						if action.Kind != keymap.KeyPress {
							m.keyEditor.draft.Hold = nil
						}
					}
					m.keyEditForm()
				}
				return m, nil
			}
			return m.updateChoices(msg)
		case "modifiers":
			if key == "enter" || key == "space" {
				if item, ok := m.picker.SelectedItem().(menuItem); ok {
					if item.action == "done" {
						m.keyEditForm()
					} else {
						base, mods := keymapview.ParseModifiedKeyCode(m.keyEditor.draft.Tap.Code)
						if slices.Contains(mods, item.action) {
							mods = slices.DeleteFunc(mods, func(mod string) bool { return mod == item.action })
						} else {
							mods = append(mods, item.action)
						}
						m.keyEditor.draft.Tap.Code = withShortcutModifiers(base, mods)
						m.refreshShortcutModifiers(m.picker.Index())
					}
				}
				return m, nil
			}
			var cmd tea.Cmd
			m.picker, cmd = m.picker.Update(msg)
			return m, cmd
		}
	}
	if m.keyEditor.page == "tap" || m.keyEditor.page == "hold" {
		return m.updateChoices(msg)
	}
	if m.keyEditor.page == "name" {
		var cmd tea.Cmd
		m.input, cmd = m.input.Update(msg)
		return m, cmd
	}
	return m, nil
}

func saveKeyBinding(selection bindingSelection, draft keymap.KeyEdit) tea.Cmd {
	return func() tea.Msg {
		document, err := keymap.SaveKeyEdit(selection.document, selection.layer, selection.position, draft)
		return configMsg{document: document, err: err, message: fmt.Sprintf("Saved position %d; build and flash to apply", selection.position)}
	}
}

func (m model) keyEditView(w, h int) string {
	editor := m.keyEditor
	if editor.readOnly != "" {
		heading := "Custom key · read only\n" + lipgloss.NewStyle().Width(w).Render(editor.readOnly)
		return fit(heading+"\n\n"+m.viewport.View(), w, h)
	}
	switch editor.page {
	case "tap", "hold":
		return m.choicesView(w, h)
	case "name":
		return fit("Key name\n\n"+m.input.View()+"\n\nEnter accepts · Esc goes back\nSave in the editor to write the change.", w, h)
	case "modifiers":
		return fit("Shortcut modifiers\n"+shortcutLabel(editor.draft.Tap.Code)+"\n\n"+m.picker.View(), w, h)
	}
	tapLabel, hold := "On tap", "Normal key behavior"
	if editor.draft.Tap.Kind != keymap.KeyPress {
		tapLabel, hold = "Action", "Included in action"
	}
	if editor.draft.Hold != nil {
		hold = m.keyActionLabel(*editor.draft.Hold)
	}
	name := keymapview.DisplayText(editor.draft.Name, false)
	if name == "" {
		name = "Unnamed"
	}
	mods := "None"
	if editor.draft.Tap.Kind == keymap.KeyPress {
		_, selected := keymapview.ParseModifiedKeyCode(editor.draft.Tap.Code)
		if len(selected) > 0 {
			labels := []string{}
			for _, code := range selected {
				for _, option := range shortcutModifiers {
					if code == option.code {
						labels = append(labels, strings.TrimPrefix(option.label, "Left "))
					}
				}
			}
			mods = strings.Join(labels, ", ")
		}
	} else {
		mods = "Not available"
	}
	lines := []string{
		textStyle.Bold(true).Render("Edit key"),
		dimStyle.Render(fmt.Sprintf("%s · pos %d", m.data.Layers[editor.selection.layer].Name, editor.selection.position)),
		"",
	}
	for i, row := range [][2]string{{"Name", name}, {tapLabel, m.keyActionLabel(editor.draft.Tap)}, {"On hold", hold}, {"Modifiers", mods}} {
		label, style := "  ", textStyle
		if editor.field == i {
			label, style = "› ", accent.Bold(true)
		}
		lines = append(lines, style.Render(ansi.Truncate(fmt.Sprintf("%s%-9s %s", label, row[0], row[1]), w, "…")))
	}
	lines = append(lines, "")
	buttons := []string{}
	for i, label := range []string{"Save", "Cancel", "Neovim"} {
		style := dimStyle
		if editor.field == i+4 {
			style = accent.Bold(true).Reverse(true)
		}
		buttons = append(buttons, style.Render("[ "+label+" ]"))
	}
	lines = append(lines, strings.Join(buttons, " "))
	message := "Save updates this key on this layer."
	if editor.draft.Hold == nil && editor.draft.Tap.Kind == keymap.KeyPress {
		message = "Normal press, release, and repeat."
	}
	if m.output != "" {
		lines = append(lines, lipgloss.NewStyle().Foreground(rose).Width(w).Render(m.output))
	} else {
		lines = append(lines, dimStyle.Render(message))
	}
	return fit(strings.Join(lines, "\n"), w, h)
}

// keyEditMouse shares the editor's keyboard actions and ignores hidden form rows.
func (m model) keyEditMouse(msg tea.MouseMsg) (tea.Model, tea.Cmd) {
	mouse := msg.Mouse()
	if mouse.X < 2 || mouse.X >= m.width-2 || mouse.Y < 5 || mouse.Y >= m.height-5 {
		return m, nil
	}
	if _, ok := msg.(tea.MouseWheelMsg); ok {
		direction := 0
		if mouse.Button == tea.MouseWheelUp {
			direction = -1
		} else if mouse.Button == tea.MouseWheelDown {
			direction = 1
		}
		if direction == 0 {
			return m, nil
		}
		if m.keyEditor.readOnly != "" {
			m.scrollDetails(direction)
		} else {
			switch m.keyEditor.page {
			case "tap", "hold", "modifiers":
				if len(m.picker.Items()) > 0 {
					m.picker.Select(min(max(0, m.picker.Index()+direction), len(m.picker.Items())-1))
				}
			}
		}
		return m, nil
	}
	if _, ok := msg.(tea.MouseClickMsg); !ok || mouse.Button != tea.MouseLeft || m.keyEditor.readOnly != "" {
		return m, nil
	}
	switch m.keyEditor.page {
	case "form":
		if mouse.Y >= 8 && mouse.Y <= 11 {
			m.keyEditor.field = mouse.Y - 8
		} else if mouse.Y == 13 && mouse.X < 32 {
			switch {
			case mouse.X < 10:
				m.keyEditor.field = 4
			case mouse.X >= 11 && mouse.X < 21:
				m.keyEditor.field = 5
			case mouse.X >= 22:
				m.keyEditor.field = 6
			default:
				return m, nil
			}
		} else {
			return m, nil
		}
		cmd := m.activateKeyEditField()
		return m, cmd
	case "tap", "hold":
		if index, ok := m.choiceAt(mouse.X, mouse.Y); ok {
			m.picker.Select(index)
			return m.updateKeyEdit(tea.KeyPressMsg{Code: tea.KeyEnter})
		}
	case "modifiers":
		row := mouse.Y - 8
		if row >= 0 && row < m.picker.Height() && row%3 != 2 && row/3 < m.picker.Paginator.PerPage {
			index := m.picker.Paginator.Page*m.picker.Paginator.PerPage + row/3
			if index < len(m.picker.Items()) {
				m.picker.Select(index)
				return m.updateKeyEdit(tea.KeyPressMsg{Code: tea.KeyEnter})
			}
		}
	}
	return m, nil
}
