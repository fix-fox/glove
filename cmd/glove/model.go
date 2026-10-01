package main

import (
	"fmt"
	"path/filepath"
	"strconv"
	"strings"

	"charm.land/bubbles/v2/list"
	"charm.land/bubbles/v2/spinner"
	"charm.land/bubbles/v2/textinput"
	"charm.land/bubbles/v2/viewport"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/fix-fox/glove/internal/editor"
	"github.com/fix-fox/glove/internal/keymap"
	"github.com/fix-fox/glove/internal/keymapview"
)

type menuItem struct{ title, description, action string }

func (i menuItem) Title() string       { return i.title }
func (i menuItem) Description() string { return i.description }
func (i menuItem) FilterValue() string { return i.title + " " + i.description }

type processMsg struct{ err error }

type model struct {
	root, side                       string
	width, height                    int
	data                             *snapshot
	document                         *keymap.Document
	layer, selected                  int
	screen, mode, pickerKind         string
	status, output                   string
	busy                             bool
	input                            textinput.Model
	library, picker                  list.Model
	viewport                         viewport.Model
	spinner                          spinner.Model
	confirmation                     clearSelection
	completions                      []string
	completionPrefix, completionLine string
	completionIndex                  int
	flashArgs                        []string
	processError                     error
}

func newMenu(items []list.Item, title string) list.Model {
	d := list.NewDefaultDelegate()
	d.Styles.NormalTitle = lipgloss.NewStyle().Foreground(ink).PaddingLeft(2)
	d.Styles.NormalDesc = lipgloss.NewStyle().Foreground(muted).PaddingLeft(2)
	d.Styles.SelectedTitle = lipgloss.NewStyle().Foreground(mint).Border(lipgloss.NormalBorder(), false, false, false, true).BorderForeground(mint).PaddingLeft(1)
	d.Styles.SelectedDesc = d.Styles.SelectedTitle.Foreground(muted)
	m := list.New(items, d, 60, 25)
	m.Title = title
	m.Styles.Title = lipgloss.NewStyle().Foreground(bg).Background(lavender).Padding(0, 1).Bold(true)
	m.SetShowHelp(false)
	m.SetShowStatusBar(true)
	m.DisableQuitKeybindings()
	return m
}

func newModel(root string) model {
	in := textinput.New()
	in.Prompt = "› "
	in.Placeholder = "Cmd+C, screenshot, a macro name…"
	in.CharLimit = 256
	s := spinner.New()
	s.Spinner = spinner.Dot
	s.Style = lipgloss.NewStyle().Foreground(mint)
	return model{
		root: root, side: "both", width: 150, height: 46,
		selected: 37, screen: "keyboard", status: "Reading config…", busy: true,
		input: in, library: newMenu(nil, "Definitions"), picker: newMenu(nil, "Actions"),
		viewport: viewport.New(), spinner: s,
	}
}

func (m model) Init() tea.Cmd {
	return tea.Batch(loadConfig(m.root), m.spinner.Tick)
}

func (m *model) setDocument(document *keymap.Document) {
	m.layer = layerAfterReload(m.document, m.layer, document)
	m.document = document
	m.data = keymapview.SnapshotFrom(document, m.root)
	m.library.ResetFilter()
	if m.mode == "picker" {
		m.mode = ""
	}
	items := make([]list.Item, 0, len(m.data.Entities))
	for i, e := range m.data.Entities {
		items = append(items, menuItem{e.Name, e.Kind, strconv.Itoa(i)})
	}
	m.library.SetItems(items)
	m.completions = nil
	m.resize()
}

func (m *model) resize() {
	m.input.SetWidth(max(10, m.width-12))
	m.picker.SetSize(max(20, min(78, m.width-10)), max(6, m.height-14))
	m.library.SetSize(max(20, min(38, m.width/3)), max(6, m.height-12))
	w := max(20, m.width-10)
	if m.screen == "library" && m.mode == "" && m.width >= 90 {
		w = m.width - m.library.Width() - 10
	}
	m.viewport.SetWidth(w)
	viewportHeight := m.height - 12
	if m.mode == "search" || m.mode == "command" {
		viewportHeight = m.height - 17
	}
	if m.screen == "library" && m.mode == "" {
		viewportHeight = m.height - 14
	}
	m.viewport.SetHeight(max(1, viewportHeight))
	m.refreshViewport()
}

func (m *model) refreshViewport() {
	content := m.output
	if m.screen == "library" && m.mode == "" && m.data != nil {
		if item, ok := m.library.SelectedItem().(menuItem); ok {
			i, _ := strconv.Atoi(item.action)
			content = m.data.Entities[i].Detail
		}
	}
	m.viewport.SetContent(lipgloss.NewStyle().Width(m.viewport.Width()).Render(content))
}

func (m *model) openPicker(kind, title string, items []list.Item) {
	m.mode, m.pickerKind = "picker", kind
	m.picker = newMenu(items, title)
	m.resize()
}

func (m *model) openPalette() {
	m.openPicker("action", "What would you like to do?", []list.Item{
		menuItem{"Choose a layer", "Browse all layers · g", "layers"},
		menuItem{"Find a binding", "Keycodes, chords, concepts and names · /", "search"},
		menuItem{"Browse definitions", "Macros, combos, hold-taps, morphs and conditional layers · tab", "library"},
		menuItem{"Edit config", "Open the native keymap in your editor · e", "editor"},
		menuItem{"Reload config", "Validate edits and keep the last good map on error · r", "reload"},
		menuItem{"Clear selected key", "Review the source edit before applying · x", "clear"},
		menuItem{"Build and flash", "Choose local or remote, left half or both · f", "flash"},
		menuItem{"Switch keyboard half", "Both / Left / Right · s", "side"},
		menuItem{"Run a command", "All existing TUI commands · :", "command"},
	})
}

func (m *model) openLayers() {
	items := make([]list.Item, 0, len(m.data.Layers))
	for i, layer := range m.data.Layers {
		items = append(items, menuItem{layer.Name, fmt.Sprintf("Layer %02d · 80 keys", i), strconv.Itoa(i)})
	}
	m.openPicker("layer", "Layers", items)
	m.picker.Select(m.layer)
}

func (m *model) openInput(mode string) tea.Cmd {
	m.mode, m.output = mode, ""
	m.completions = nil
	m.input.SetValue("")
	if mode == "command" {
		m.input.Placeholder = "layer symbols, key RM4, find Cmd+C, flash --remote…"
	} else {
		m.input.Placeholder = "Cmd+C, screenshot, a macro name…"
	}
	m.resize()
	return m.input.Focus()
}

func (m *model) showError(err error) {
	m.mode, m.output, m.status = "output", err.Error(), "Action failed"
	m.resize()
	m.viewport.GotoTop()
}

// completeCommand replaces only the token at the cursor and cycles repeated Tab presses.
func (m *model) completeCommand() {
	line := m.input.Value()
	if m.input.Position() != len([]rune(line)) {
		return
	}
	if len(m.completions) > 0 && line == m.completionLine {
		m.completionIndex = (m.completionIndex + 1) % len(m.completions)
	} else {
		matches, token := keymapview.Complete(m.document.Config, line)
		if len(matches) == 0 {
			return
		}
		m.completions, m.completionIndex = matches, 0
		m.completionPrefix = strings.TrimSuffix(line, token)
	}
	m.completionLine = m.completionPrefix + m.completions[m.completionIndex]
	m.input.SetValue(m.completionLine)
	m.input.CursorEnd()
	m.status = fmt.Sprintf("%d/%d  %s", m.completionIndex+1, len(m.completions), strings.Join(m.completions, "  "))
}

func (m *model) perform(action string) tea.Cmd {
	if m.busy {
		return nil
	}
	m.mode = ""
	switch action {
	case "layers":
		m.openLayers()
	case "search", "command":
		return m.openInput(action)
	case "library":
		m.screen = "library"
		m.resize()
	case "editor":
		cmd, err := editor.Command(filepath.Join(m.root, "config", "glove80.keymap"))
		if err != nil {
			m.showError(err)
			return nil
		}
		cmd.Dir = m.root
		return tea.ExecProcess(cmd, func(err error) tea.Msg { return processMsg{err} })
	case "reload":
		m.busy, m.status = true, "Validating config…"
		return tea.Batch(loadConfig(m.root), m.spinner.Tick)
	case "clear":
		key := m.data.Layers[m.layer].Keys[m.selected]
		if !key.Editable {
			m.status = "This binding is shared. Edit its source in your editor."
			return nil
		}
		m.confirmation = clearSelection{document: m.document, layer: m.layer, position: m.selected}
		m.mode = "confirm-clear"
	case "flash":
		m.openPicker("flash", "Build and flash", []list.Item{
			menuItem{"Local · left half", "Build with Docker, then flash the left half", "--local"},
			menuItem{"Local · both halves", "Build with Docker, then flash both halves", "--local --full"},
			menuItem{"Remote · left half", "Build with GitHub Actions, then flash the left half", "--remote"},
			menuItem{"Remote · both halves", "Build with GitHub Actions, then flash both halves", "--remote --full"},
		})
	case "side":
		switch m.side {
		case "both":
			m.side = "left"
		case "left":
			m.side = "right"
		default:
			m.side = "both"
		}
		m.ensureVisibleSelection()
	}
	return nil
}

func (m *model) do(action string) (tea.Model, tea.Cmd) {
	cmd := m.perform(action)
	return *m, cmd
}

func (m *model) beginInput(mode string) (tea.Model, tea.Cmd) {
	cmd := m.openInput(mode)
	return *m, cmd
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width, m.height = msg.Width, msg.Height
		m.resize()
		return m, nil
	case spinner.TickMsg:
		var cmd tea.Cmd
		m.spinner, cmd = m.spinner.Update(msg)
		if !m.busy {
			return m, nil
		}
		return m, cmd
	case processMsg:
		m.processError = msg.err
		m.busy, m.status = true, "Reloading config…"
		return m, tea.Batch(loadConfig(m.root), m.spinner.Tick)
	case configMsg:
		m.busy = false
		if msg.err != nil {
			m.status = "Config request failed. Last valid map retained."
			m.mode, m.output = "output", msg.err.Error()
			if m.processError != nil {
				m.output = "External command failed: " + m.processError.Error() + "\n\nReload failed: " + m.output
				m.processError = nil
			}
			m.resize()
			m.viewport.GotoTop()
			return m, nil
		}
		if msg.document != nil {
			m.setDocument(msg.document)
			m.status = "Config loaded"
			if msg.message != "" {
				m.status = msg.message
			}
			if m.processError != nil {
				m.mode, m.output = "output", "External command failed: "+m.processError.Error()
				m.processError = nil
				m.resize()
			}
		}
		if result := msg.intent; result != nil {
			m.status = "Ready"
			switch result.Kind {
			case "output":
				m.output = result.Text
				if m.mode != "search" && m.mode != "command" {
					m.mode = "output"
				}
				if result.Error {
					m.status = "Command failed"
				}
				m.resize()
				m.viewport.GotoTop()
			case "show-layer":
				m.layer, m.side, m.mode, m.screen = result.Index, result.Side, "", "keyboard"
				m.ensureVisibleSelection()
			case "clear-key":
				m.layer, m.selected = result.LayerIndex, result.Position
				return m.do("clear")
			case "reload":
				return m.do("reload")
			case "edit":
				return m.do("editor")
			case "flash":
				m.flashArgs, m.mode = result.Args, "confirm-flash"
			case "quit":
				return m, tea.Quit
			}
		}
		return m, nil
	case tea.KeyPressMsg:
		key := msg.String()
		if key == "ctrl+c" {
			return m, tea.Quit
		}
		if key == "esc" && m.mode != "" {
			if m.mode == "picker" && m.picker.FilterState() != list.Unfiltered {
				var cmd tea.Cmd
				m.picker, cmd = m.picker.Update(msg)
				return m, cmd
			}
			m.mode = ""
			m.input.Blur()
			m.resize()
			return m, nil
		}
		if m.mode == "confirm-clear" || m.mode == "confirm-flash" {
			if key == "n" {
				m.mode = ""
			}
			if key != "y" || m.busy {
				return m, nil
			}
			if m.mode == "confirm-clear" {
				m.mode, m.busy, m.status = "", true, "Writing config…"
				return m, tea.Batch(clearBinding(m.confirmation), m.spinner.Tick)
			}
			m.mode = ""
			cmd, err := flashCommand(m.root, m.flashArgs)
			if err != nil {
				m.showError(err)
				return m, nil
			}
			cmd.Dir = m.root
			return m, tea.ExecProcess(cmd, func(err error) tea.Msg { return processMsg{err} })
		}
		if m.mode == "picker" {
			if key == "enter" && m.picker.FilterState() != list.Filtering {
				item, ok := m.picker.SelectedItem().(menuItem)
				if !ok {
					return m, nil
				}
				switch m.pickerKind {
				case "layer":
					index, err := strconv.Atoi(item.action)
					if err != nil || index < 0 || index >= len(m.data.Layers) {
						m.mode, m.status = "", "Layer changed. Open the layer picker again."
						return m, nil
					}
					m.layer = index
					m.mode, m.screen = "", "keyboard"
				case "flash":
					m.flashArgs, m.mode = strings.Fields(item.action), "confirm-flash"
				case "action":
					return m.do(item.action)
				}
				return m, nil
			}
			var cmd tea.Cmd
			m.picker, cmd = m.picker.Update(msg)
			return m, cmd
		}
		if m.mode == "search" || m.mode == "command" {
			if key == "tab" && m.mode == "command" {
				m.completeCommand()
				return m, nil
			}
			m.completions = nil
			if key == "enter" && !m.busy && strings.TrimSpace(m.input.Value()) != "" {
				line := m.input.Value()
				if m.mode == "search" {
					line = "find " + line
				}
				m.busy, m.status = true, "Searching config…"
				return m, tea.Batch(m.command(line), m.spinner.Tick)
			}
			var cmd tea.Cmd
			if key == "pgdown" || key == "pgup" {
				m.viewport, cmd = m.viewport.Update(msg)
			} else {
				m.input, cmd = m.input.Update(msg)
			}
			return m, cmd
		}
		if m.mode == "output" {
			var cmd tea.Cmd
			m.viewport, cmd = m.viewport.Update(msg)
			return m, cmd
		}
		if m.data == nil {
			switch key {
			case "q":
				return m, tea.Quit
			case "r":
				return m.do("reload")
			case "e":
				return m.do("editor")
			}
			return m, nil
		}
		if m.screen == "library" && m.library.FilterState() == list.Filtering {
			var cmd tea.Cmd
			m.library, cmd = m.library.Update(msg)
			m.refreshViewport()
			return m, cmd
		}
		switch key {
		case "q":
			return m, tea.Quit
		case "ctrl+p":
			m.openPalette()
		case "g":
			m.openLayers()
		case "ctrl+f":
			return m.beginInput("search")
		case "/":
			if m.screen != "library" {
				return m.beginInput("search")
			}
		case ":":
			return m.beginInput("command")
		case "s":
			return m.do("side")
		case "r":
			return m.do("reload")
		case "e":
			return m.do("editor")
		case "x":
			return m.do("clear")
		case "f":
			return m.do("flash")
		case "tab":
			if m.screen == "keyboard" {
				m.screen = "library"
			} else {
				m.screen = "keyboard"
			}
			m.resize()
			return m, nil
		case "[":
			m.layer = (m.layer + len(m.data.Layers) - 1) % len(m.data.Layers)
		case "]":
			m.layer = (m.layer + 1) % len(m.data.Layers)
		case "?":
			m.mode, m.output = "output", helpText
			m.resize()
			m.viewport.GotoTop()
			return m, nil
		case "enter":
			if m.screen == "keyboard" {
				m.output = m.selectedBinding().Detail + "\n\n" + m.selectedBinding().Source
			} else if item, ok := m.library.SelectedItem().(menuItem); ok {
				i, _ := strconv.Atoi(item.action)
				m.output = m.data.Entities[i].Detail
			}
			m.mode = "output"
			m.resize()
			m.viewport.GotoTop()
			return m, nil
		}
		if m.screen == "library" {
			var cmd tea.Cmd
			if key == "pgdown" || key == "pgup" {
				m.viewport, cmd = m.viewport.Update(msg)
			} else {
				previous := m.library.Index()
				m.library, cmd = m.library.Update(msg)
				m.refreshViewport()
				if previous != m.library.Index() {
					m.viewport.GotoTop()
				}
			}
			return m, cmd
		}
		switch key {
		case "left", "h":
			m.move(-1, 0)
		case "right", "l":
			m.move(1, 0)
		case "up", "k":
			m.move(0, -1)
		case "down", "j":
			m.move(0, 1)
		}
	}
	if m.mode == "search" || m.mode == "command" {
		var cmd tea.Cmd
		m.input, cmd = m.input.Update(msg)
		return m, cmd
	}
	if m.mode == "picker" {
		var cmd tea.Cmd
		m.picker, cmd = m.picker.Update(msg)
		return m, cmd
	}
	if m.screen == "library" && m.mode == "" {
		var cmd tea.Cmd
		m.library, cmd = m.library.Update(msg)
		m.refreshViewport()
		return m, cmd
	}
	return m, nil
}

func (m model) selectedBinding() binding { return m.data.Layers[m.layer].Keys[m.selected] }

func (m model) effectiveSide() string {
	if m.side == "both" && m.width < 100 && m.data != nil {
		if strings.HasPrefix(m.selectedBinding().Name, "L") {
			return "left"
		}
		return "right"
	}
	return m.side
}

func (m *model) ensureVisibleSelection() {
	if m.side == "both" {
		return
	}
	prefix := "L"
	if m.side == "right" {
		prefix = "R"
	}
	if !strings.HasPrefix(m.selectedBinding().Name, prefix) {
		for _, key := range m.data.Layers[m.layer].Keys {
			if strings.HasPrefix(key.Name, prefix) {
				m.selected = key.Position
				break
			}
		}
	}
}

// move uses physical rows and nearest columns, so thumb keys remain reachable.
func (m *model) move(dx, dy int) {
	row, col := 0, 0
	for r, cells := range m.data.Grid {
		for c, pos := range cells {
			if pos != nil && *pos == m.selected {
				row, col = r, c
			}
		}
	}
	best, score := m.selected, 10000
	for r, cells := range m.data.Grid {
		for c, pos := range cells {
			if pos == nil {
				continue
			}
			name := m.data.Layers[m.layer].Keys[*pos].Name
			if m.side == "left" && !strings.HasPrefix(name, "L") || m.side == "right" && !strings.HasPrefix(name, "R") {
				continue
			}
			if dy == 0 {
				if r != row || (c-col)*dx <= 0 {
					continue
				}
				if abs(c-col) < score {
					best, score = *pos, abs(c-col)
				}
			} else {
				if (r-row)*dy <= 0 {
					continue
				}
				distance := abs(r-row)*100 + abs(c-col)
				if distance < score {
					best, score = *pos, distance
				}
			}
		}
	}
	m.selected = best
}

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}

const helpText = `Explore
  arrows / h j k l   Move across the physical keyboard
  [ / ]             Previous / next layer
  g                 Searchable layer picker
  enter             Full binding or definition details
  tab               Keyboard / definitions
  /                 Find bindings; filter while in definitions
  ctrl+f            Find bindings from either tab
  ctrl+p            Searchable action palette
  :                 Run any existing TUI command

Config
  e                 Open the native keymap in $VISUAL / $EDITOR
  r                 Reload and validate the config
  x                 Clear selected key, with confirmation
  f                 Choose local/remote build and half/both flash

Keyboard view
  s                 Both / Left / Right half

Lists and details
  /                 Filter a list; enter accepts the filter
  arrows            Select a list item
  enter             Open the selected item
  pgup / pgdown     Scroll full details and search results
  esc               Go back or cancel
  q / ctrl+c        Quit (ctrl+c also works inside inputs)

The full board is shown at 100 columns or more. Smaller terminals
follow the selected half; arrows can cross the split when side is Both.
Short terminals scroll the tiled keyboard to keep the selected row visible.
In command entry, tab completes commands and names, then cycles matches.

Commands
  layers · layer <name|index> · left · right · both · key <position>
  macros · macro <name> · combos · combo <name> · holdtaps · morphs
  condlayers · find <query> · rm <position> · reload · edit
  flash [--local|--remote] [--full] · help · quit
`
