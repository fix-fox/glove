package main

import (
	"fmt"
	"strconv"
	"strings"

	"charm.land/bubbles/v2/list"
	"charm.land/bubbles/v2/spinner"
	"charm.land/bubbles/v2/textinput"
	"charm.land/bubbles/v2/viewport"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
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
	pickerItems                      []list.Item
	choiceTitle                      string
	viewport                         viewport.Model
	spinner                          spinner.Model
	confirmation                     bindingSelection
	naming                           bindingSelection
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
	m.KeyMap.CursorUp.SetKeys("up")
	m.KeyMap.CursorDown.SetKeys("down")
	m.KeyMap.PrevPage.SetKeys("left", "pgup")
	m.KeyMap.NextPage.SetKeys("right", "pgdown")
	m.KeyMap.GoToStart.SetKeys("home")
	m.KeyMap.GoToEnd.SetKeys("end")
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
	view := viewport.New()
	view.KeyMap.Up.SetKeys("up")
	view.KeyMap.Down.SetKeys("down")
	view.KeyMap.Left.SetKeys("left")
	view.KeyMap.Right.SetKeys("right")
	library := newMenu(nil, "Definitions")
	library.SetFilteringEnabled(false)
	return model{
		root: root, side: "both", width: 150, height: 46,
		selected: 37, screen: "keyboard", status: "Reading config…", busy: true,
		input: in, library: library, picker: newChoices(),
		viewport: view, spinner: s,
	}
}

func (m model) Init() tea.Cmd {
	return tea.Batch(loadConfig(m.root), m.spinner.Tick)
}

func (m *model) setDocument(document *keymap.Document) {
	previousEntity := keymapview.Entity{}
	if item, ok := m.library.SelectedItem().(menuItem); ok && m.data != nil {
		index, _ := strconv.Atoi(item.action)
		if index >= 0 && index < len(m.data.Entities) {
			previousEntity = m.data.Entities[index]
		}
	}
	m.layer = layerAfterReload(m.document, m.layer, document)
	m.document = document
	m.data = keymapview.SnapshotFrom(document, m.root)
	m.library.ResetFilter()
	if m.mode == "picker" {
		m.mode = ""
	}
	items := make([]list.Item, 0, len(m.data.Entities))
	selected := 0
	for i, e := range m.data.Entities {
		items = append(items, menuItem{e.Name, e.Kind, strconv.Itoa(i)})
		if e.Kind == previousEntity.Kind && e.Name == previousEntity.Name {
			selected = i
		}
	}
	m.library.SetItems(items)
	m.library.Select(selected)
	if m.mode == "search" {
		m.refreshChoices()
	}
	m.completions = nil
	m.resize()
}

func (m *model) resize() {
	m.input.SetWidth(max(10, m.width-12))
	if m.mode == "jump" {
		m.input.SetWidth(4)
	}
	m.picker.SetSize(max(1, m.width-4), max(1, m.height-17))
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

func (m *model) openPicker(kind, title string, items []list.Item) tea.Cmd {
	m.mode, m.pickerKind = "picker", kind
	m.choiceTitle, m.pickerItems = title, items
	m.picker = newChoices()
	m.resetInput("Type to filter…")
	m.refreshChoices()
	m.resize()
	return m.input.Focus()
}

func (m *model) openPalette() tea.Cmd {
	return m.openPicker("action", "Commands", []list.Item{
		menuItem{"Choose a layer", "Browse all layers · l", "layers"},
		menuItem{"Go to a position", "Show key positions and jump · g", "jump"},
		menuItem{"Find a binding", "Keycodes, chords, concepts and names · /", "search"},
		menuItem{"Browse definitions", "Macros, combos, hold-taps, morphs and conditional layers · tab", "library"},
		menuItem{"Name selected key", "Show a memorable name on the keycap · n", "name"},
		menuItem{"Edit config", "Open Neovim at the selected binding · e", "editor"},
		menuItem{"Reload config", "Validate edits and keep the last good map on error · r", "reload"},
		menuItem{"Clear selected key", "Review the source edit before applying · x", "clear"},
		menuItem{"Build and flash", "Choose local or remote, left half or both · f", "flash"},
		menuItem{"Switch keyboard half", "Both / Left / Right · s", "side"},
		menuItem{"Run a command", "All existing TUI commands · :", "command"},
	})
}

func (m *model) openLayers() tea.Cmd {
	items := make([]list.Item, 0, len(m.data.Layers))
	for i, layer := range m.data.Layers {
		items = append(items, menuItem{layer.Name, fmt.Sprintf("Layer %02d · 80 keys", i), strconv.Itoa(i)})
	}
	cmd := m.openPicker("layer", "Layers", items)
	m.picker.Select(m.layer)
	return cmd
}

func (m *model) resetInput(placeholder string) {
	m.input.SetValue("")
	m.input.Placeholder = placeholder
	m.input.CharLimit = 256
	m.input.Validate = nil
}

func (m *model) openInput(mode string) tea.Cmd {
	m.mode, m.output = mode, ""
	m.completions = nil
	if mode == "command" {
		m.resetInput("layer symbols, key 43, find Cmd+C, flash --remote…")
	} else {
		m.resetInput("Cmd+C, screenshot, a macro name…")
		m.choiceTitle = "Find a binding"
		m.picker = newChoices()
		m.refreshChoices()
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
		return m.openLayers()
	case "jump":
		return m.openJump()
	case "search", "command":
		return m.openInput(action)
	case "library":
		m.screen = "library"
		m.resize()
	case "editor":
		cmd, err := m.bindingEditor()
		if err != nil {
			m.showError(err)
			return nil
		}
		cmd.Dir = m.root
		return tea.ExecProcess(cmd, func(err error) tea.Msg { return processMsg{err} })
	case "name":
		return m.openKeyName()
	case "reload":
		m.busy, m.status = true, "Validating config…"
		return tea.Batch(loadConfig(m.root), m.spinner.Tick)
	case "clear":
		key := m.data.Layers[m.layer].Keys[m.selected]
		if !key.Editable {
			m.status = "This binding is shared. Edit its source in your editor."
			return nil
		}
		m.confirmation = bindingSelection{document: m.document, layer: m.layer, position: m.selected}
		m.mode = "confirm-clear"
	case "flash":
		return m.openPicker("flash", "Build and flash", []list.Item{
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
	case tea.MouseMsg:
		return m.handleMouse(msg)
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
		if m.mode == "name" {
			if msg.err != nil {
				m.output, m.status = msg.err.Error(), "Name not saved"
				return m, nil
			}
			m.mode = ""
			m.input.Blur()
		}
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
			m.mode = ""
			m.status = "Ready"
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
		if m.mode == "jump" {
			return m.updateJump(msg)
		}
		if m.mode == "name" {
			return m.updateKeyName(msg)
		}
		if m.mode == "picker" || m.mode == "search" {
			return m.updateChoices(msg)
		}
		if m.mode == "command" {
			if key == "tab" {
				m.completeCommand()
				return m, nil
			}
			m.completions = nil
			if key == "enter" && !m.busy && strings.TrimSpace(m.input.Value()) != "" {
				line := m.input.Value()
				m.busy, m.status = true, "Running command…"
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
		switch key {
		case "q":
			return m, tea.Quit
		case "ctrl+p":
			cmd := m.openPalette()
			return m, cmd
		case "l":
			cmd := m.openLayers()
			return m, cmd
		case "g":
			cmd := m.openJump()
			return m, cmd
		case "ctrl+f", "/":
			return m.beginInput("search")
		case ":":
			return m.beginInput("command")
		case "s":
			return m.do("side")
		case "r":
			return m.do("reload")
		case "e":
			return m.do("editor")
		case "n":
			return m.do("name")
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
			} else {
				return m, nil
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
		case "left":
			m.move(-1, 0)
		case "right":
			m.move(1, 0)
		case "up":
			m.move(0, -1)
		case "down":
			m.move(0, 1)
		}
	}
	if m.mode == "picker" || m.mode == "search" {
		return m.updateChoices(msg)
	}
	if m.mode == "jump" {
		return m.updateJump(msg)
	}
	if m.mode == "name" {
		return m.updateKeyName(msg)
	}
	if m.mode == "command" {
		var cmd tea.Cmd
		m.input, cmd = m.input.Update(msg)
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
		return keymapview.PositionSide(m.selected)
	}
	return m.side
}

func (m *model) ensureVisibleSelection() {
	if m.side == "both" {
		return
	}
	if keymapview.PositionSide(m.selected) != m.side {
		for _, key := range m.data.Layers[m.layer].Keys {
			if keymapview.PositionSide(key.Position) == m.side {
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
			if m.side != "both" && keymapview.PositionSide(*pos) != m.side {
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
  arrows            Move across the physical keyboard
  [ / ]             Previous / next layer
  l                 Layer picker: type to filter, enter to open
  g                 Show positions; type a number and enter to jump
  enter             Full binding or definition details
  tab               Keyboard / definitions
  /                 Live search; arrows choose, enter navigates
  ctrl+f            Find bindings from either tab
  ctrl+p            Command palette: type to filter, enter to execute
  :                 Run any existing TUI command

Config
  n                 Name selected key; Enter saves, empty removes
  e                 Open Neovim at the selected binding's line and column
  r                 Reload and validate the config
  x                 Clear selected key, with confirmation
  f                 Choose local/remote build and half/both flash

Keyboard view
  s                 Both / Left / Right half

Lists and details
  typing            Filter the open picker or search immediately
  arrows            Select a list item
  enter             Open the selected item
  pgup / pgdown     Scroll full details and search results
  esc               Go back or cancel
  q / ctrl+c        Quit (ctrl+c also works inside inputs)

Mouse
  click             Select a key, open a result, or switch tabs
  wheel             Move through keys/lists or scroll details

The full board is shown at 100 columns or more. Smaller terminals
follow the selected half; arrows can cross the split when side is Both.
Short terminals scroll the tiled keyboard to keep the selected row visible.
In command entry, tab completes commands and names, then cycles matches.
Positions are numbered 0–79. Selection changes the border and background;
label colors always follow the legend, including hold and morph labels.

Commands
  layers · layer <name|index> · left · right · both · key <position>
  macros · macro <name> · combos · combo <name> · holdtaps · morphs
  condlayers · find <query> · rm <position> · reload · edit
  flash [--local|--remote] [--full] · help · quit
`
