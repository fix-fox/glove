package main

import (
	"fmt"
	"io"
	"strconv"
	"strings"

	"charm.land/bubbles/v2/list"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"
	"github.com/fix-fox/glove/internal/keymap"
	"github.com/fix-fox/glove/internal/keymapview"
)

type searchItem struct{ keymapview.SearchResult }

func (i searchItem) Title() string       { return i.SearchResult.Title }
func (i searchItem) Description() string { return i.SearchResult.Description }
func (i searchItem) FilterValue() string { return i.Title() + " " + i.Description() }

type choiceDelegate struct{}

func (choiceDelegate) Height() int                         { return 2 }
func (choiceDelegate) Spacing() int                        { return 1 }
func (choiceDelegate) Update(tea.Msg, *list.Model) tea.Cmd { return nil }
func (choiceDelegate) Render(w io.Writer, menu list.Model, index int, item list.Item) {
	choice, ok := item.(interface {
		Title() string
		Description() string
	})
	if !ok {
		return
	}
	kind := "key"
	if result, ok := item.(searchItem); ok {
		kind = result.Kind
	}
	selected := index == menu.Index()
	marker := "  "
	if selected {
		marker = accent.Render("│ ")
	}
	width := max(0, menu.Width()-2)
	title := lipgloss.NewStyle().Foreground(kindColor(kind)).Bold(selected).Render(ansi.Truncate(choice.Title(), width, "…"))
	detail := dimStyle.Render(ansi.Truncate(choice.Description(), width, "…"))
	fmt.Fprint(w, marker+title+"\n"+marker+detail)
}

func newChoices() list.Model {
	menu := newMenu(nil, "")
	menu.SetDelegate(choiceDelegate{})
	menu.SetFilteringEnabled(false)
	menu.SetShowFilter(false)
	menu.SetShowTitle(false)
	menu.SetShowStatusBar(false)
	menu.Styles.PaginationStyle = lipgloss.NewStyle().Foreground(muted).PaddingLeft(2)
	return menu
}

// refreshChoices computes against the current input before Enter can activate an item.
func (m *model) refreshChoices() {
	items := []list.Item{}
	if m.mode == "search" {
		if m.document != nil {
			for _, result := range keymapview.Search(m.document.Config, m.input.Value()) {
				items = append(items, searchItem{result})
			}
		}
	} else if query := strings.TrimSpace(m.input.Value()); query == "" {
		items = m.pickerItems
	} else {
		targets := make([]string, len(m.pickerItems))
		for i, item := range m.pickerItems {
			targets[i] = item.FilterValue()
		}
		for _, rank := range list.DefaultFilter(query, targets) {
			items = append(items, m.pickerItems[rank.Index])
		}
	}
	m.picker.SetItems(items)
	m.picker.Select(0)
}

func (m model) updateChoices(msg tea.Msg) (tea.Model, tea.Cmd) {
	if press, ok := msg.(tea.KeyPressMsg); ok {
		switch press.String() {
		case "enter":
			return m.activateChoice()
		case "up", "down", "pgup", "pgdown":
			var cmd tea.Cmd
			m.picker, cmd = m.picker.Update(msg)
			return m, cmd
		}
	}
	previous := m.input.Value()
	var cmd tea.Cmd
	m.input, cmd = m.input.Update(msg)
	if previous != m.input.Value() {
		m.refreshChoices()
	}
	return m, cmd
}

func (m *model) activateChoice() (tea.Model, tea.Cmd) {
	if m.busy {
		return *m, nil
	}
	switch item := m.picker.SelectedItem().(type) {
	case searchItem:
		target := item.Target
		switch target.Kind {
		case "key":
			m.chooseKey(target.LayerIndex, target.Position)
		case "layer":
			m.chooseKey(target.LayerIndex, m.selected)
		case "definition":
			for i, entity := range m.data.Entities {
				if entity.Kind == target.EntityKind && entity.Name == target.EntityName {
					m.mode, m.screen = "", "library"
					m.input.Blur()
					m.library.Select(i)
					m.resize()
					m.viewport.GotoTop()
					break
				}
			}
		}
	case menuItem:
		m.input.Blur()
		switch m.pickerKind {
		case "layer":
			index, err := strconv.Atoi(item.action)
			if err == nil {
				m.chooseKey(index, m.selected)
			}
		case "flash":
			m.flashArgs, m.mode = strings.Fields(item.action), "confirm-flash"
		case "action":
			return m.do(item.action)
		}
	}
	return *m, nil
}

// chooseKey follows an exact result or position even when another half is displayed.
func (m *model) chooseKey(layer, position int) {
	if m.data == nil || layer < 0 || layer >= len(m.data.Layers) || position < 0 || position >= keymap.KeyCount {
		return
	}
	m.layer, m.selected = layer, position
	if m.side != "both" {
		m.side = keymapview.PositionSide(position)
	}
	m.mode, m.screen, m.status = "", "keyboard", "Ready"
	m.input.Blur()
	m.resize()
}

func (m *model) openJump() tea.Cmd {
	m.mode, m.screen = "jump", "keyboard"
	m.input.SetValue("")
	m.input.Placeholder = "0–79"
	m.input.CharLimit = 2
	m.input.Validate = func(value string) error {
		for _, r := range value {
			if r < '0' || r > '9' {
				return fmt.Errorf("enter a position from 0 to 79")
			}
		}
		return nil
	}
	m.status = "Enter to jump"
	m.resize()
	return m.input.Focus()
}

func (m model) updateJump(msg tea.Msg) (tea.Model, tea.Cmd) {
	if press, ok := msg.(tea.KeyPressMsg); ok && press.String() == "enter" {
		position, err := strconv.Atoi(m.input.Value())
		if err != nil || position < 0 || position >= keymap.KeyCount {
			m.status = "Position must be 0–79"
			return m, nil
		}
		m.chooseKey(m.layer, position)
		return m, nil
	}
	var cmd tea.Cmd
	m.input, cmd = m.input.Update(msg)
	return m, cmd
}

func (m model) choicesView(w, h int) string {
	noun := "result"
	if m.mode == "picker" {
		noun = "choice"
	}
	if len(m.picker.Items()) != 1 {
		noun += "s"
	}
	count := fmt.Sprintf("%d %s", len(m.picker.Items()), noun)
	content := textStyle.Bold(true).Render(m.choiceTitle) + "\n\n"
	content += lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(lavender).Width(w-4).Padding(0, 1).Render(m.input.View()) + "\n\n"
	content += dimStyle.Render(count) + "\n"
	if len(m.picker.Items()) == 0 {
		message := "No matches. Keep typing or change the query."
		if m.mode == "search" && strings.TrimSpace(m.input.Value()) == "" {
			message = "Type a key, chord, layer, or definition name."
		}
		content += dimStyle.Width(w).Render(message)
	} else {
		content += m.picker.View()
	}
	return fit(content, w, h)
}
