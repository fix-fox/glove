package main

import (
	"fmt"
	"os/exec"
	"strconv"
	"strings"

	"charm.land/bubbles/v2/list"
	"charm.land/bubbles/v2/spinner"
	"charm.land/bubbles/v2/textinput"
	"charm.land/bubbles/v2/viewport"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

type menuItem struct{ title, description, action string }

func (i menuItem) Title() string       { return i.title }
func (i menuItem) Description() string { return i.description }
func (i menuItem) FilterValue() string { return i.title + " " + i.description }

type bridgeMsg struct {
	response response
	err      error
}
type processMsg struct{ err error }

type model struct {
	root, layout, density, side string
	width, height               int
	data                        *snapshot
	layer, selected             int
	screen, mode, pickerKind    string
	status, output              string
	busy                        bool
	input                       textinput.Model
	library, picker             list.Model
	viewport                    viewport.Model
	spinner                     spinner.Model
	confirmation                request
	flashArgs                   []string
	processError                error
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

func newModel(root, layout, density string) model {
	in := textinput.New()
	in.Prompt = "› "
	in.Placeholder = "Cmd+C, screenshot, a macro name…"
	in.CharLimit = 256
	s := spinner.New()
	s.Spinner = spinner.Dot
	s.Style = lipgloss.NewStyle().Foreground(mint)
	return model{
		root: root, layout: layout, density: density, side: "both", width: 150, height: 46,
		selected: 37, screen: "keyboard", status: "Reading config…", busy: true,
		input: in, library: newMenu(nil, "Definitions"), picker: newMenu(nil, "Actions"),
		viewport: viewport.New(), spinner: s,
	}
}

func (m model) Init() tea.Cmd {
	return tea.Batch(m.bridge(request{Action: "snapshot"}), m.spinner.Tick)
}

func (m model) bridge(req request) tea.Cmd {
	return func() tea.Msg {
		result, err := callBridge(m.root, req)
		return bridgeMsg{result, err}
	}
}

func (m *model) setSnapshot(data *snapshot) {
	m.data = data
	m.layer = min(max(0, m.layer), len(data.Layers)-1)
	m.library.ResetFilter()
	if m.mode == "picker" {
		m.mode = ""
	}
	items := make([]list.Item, 0, len(data.Entities))
	for i, e := range data.Entities {
		items = append(items, menuItem{e.Name, e.Kind, strconv.Itoa(i)})
	}
	m.library.SetItems(items)
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
	m.viewport.SetHeight(max(4, m.height-16))
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
		menuItem{"Switch layout", "Studio / Focus · v", "layout"},
		menuItem{"Switch key density", "Tiles / Compact · d", "density"},
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
	m.input.SetValue("")
	if mode == "command" {
		m.input.Placeholder = "layer symbols, key RM4, find Cmd+C, flash --remote…"
	} else {
		m.input.Placeholder = "Cmd+C, screenshot, a macro name…"
	}
	m.resize()
	return m.input.Focus()
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
		cmd := exec.Command("node", "--no-deprecation", "--import=tsx", "scripts/tea-bridge.ts", "--edit")
		cmd.Dir = m.root
		return tea.ExecProcess(cmd, func(err error) tea.Msg { return processMsg{err} })
	case "reload":
		m.busy, m.status = true, "Validating config…"
		return tea.Batch(m.bridge(request{Action: "snapshot"}), m.spinner.Tick)
	case "clear":
		key := m.data.Layers[m.layer].Keys[m.selected]
		if !key.Editable {
			m.status = "This binding is shared. Edit its source in your editor."
			return nil
		}
		m.confirmation = request{Action: "clear", Layer: m.layer, Position: m.selected, Revision: m.data.Revision}
		m.mode = "confirm-clear"
	case "flash":
		m.openPicker("flash", "Build and flash", []list.Item{
			menuItem{"Local · left half", "Build with Docker, then flash the left half", "--local"},
			menuItem{"Local · both halves", "Build with Docker, then flash both halves", "--local --full"},
			menuItem{"Remote · left half", "Build with GitHub Actions, then flash the left half", "--remote"},
			menuItem{"Remote · both halves", "Build with GitHub Actions, then flash both halves", "--remote --full"},
		})
	case "layout":
		if m.layout == "studio" {
			m.layout = "focus"
		} else {
			m.layout = "studio"
		}
	case "density":
		if m.density == "tiles" {
			m.density = "compact"
		} else {
			m.density = "tiles"
		}
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
		return m, tea.Batch(m.bridge(request{Action: "snapshot"}), m.spinner.Tick)
	case bridgeMsg:
		m.busy = false
		if msg.err != nil {
			m.status = "Config request failed. Last valid map retained."
			m.mode, m.output = "output", msg.err.Error()
			m.resize()
			return m, nil
		}
		if msg.response.Snapshot != nil {
			m.setSnapshot(msg.response.Snapshot)
			m.status = "Config loaded"
			if msg.response.Message != "" {
				m.status = msg.response.Message
			}
			if m.processError != nil {
				m.mode, m.output = "output", "External command failed: "+m.processError.Error()
				m.processError = nil
				m.resize()
			}
		}
		if result := msg.response.Result; result != nil {
			switch result.Kind {
			case "output":
				m.output = result.Text
				if m.mode != "search" && m.mode != "command" {
					m.mode = "output"
				}
				if result.Error {
					m.status = "Command failed"
				} else {
					m.status = "Ready"
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
				return m, tea.Batch(m.bridge(m.confirmation), m.spinner.Tick)
			}
			m.mode = ""
			args := append([]string{"scripts/glove-flash.sh"}, m.flashArgs...)
			cmd := exec.Command("bash", args...)
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
			if key == "enter" && !m.busy && strings.TrimSpace(m.input.Value()) != "" {
				line := m.input.Value()
				if m.mode == "search" {
					line = "find " + line
				}
				m.busy, m.status = true, "Searching config…"
				return m, tea.Batch(m.bridge(request{Action: "command", Command: line, Layer: m.layer, Side: m.side, Revision: m.data.Revision}), m.spinner.Tick)
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
		case "v":
			return m.do("layout")
		case "d":
			return m.do("density")
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

Compare designs
  v                 Studio / Focus layout
  d                 Tiles / Compact keys
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
Below 42 rows, keys use Compact density. Below 30 rows, hold labels
move to the inspector. Resize to compare Tiles.

Commands
  layers · layer <name|index> · left · right · both · key <position>
  macros · macro <name> · combos · combo <name> · holdtaps · morphs
  condlayers · find <query> · rm <position> · reload · edit
  flash [--local|--remote] [--full] · help · quit
`
