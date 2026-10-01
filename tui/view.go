package main

import (
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"
)

var (
	bg        = lipgloss.Color("#111318")
	panel     = lipgloss.Color("#1B1E27")
	line      = lipgloss.Color("#343849")
	ink       = lipgloss.Color("#E7E9F0")
	muted     = lipgloss.Color("#989EAE")
	mint      = lipgloss.Color("#9CE5C6")
	lavender  = lipgloss.Color("#C5B0FF")
	blue      = lipgloss.Color("#96C7F2")
	rose      = lipgloss.Color("#EDACC7")
	textStyle = lipgloss.NewStyle().Foreground(ink)
	dimStyle  = lipgloss.NewStyle().Foreground(muted)
	accent    = lipgloss.NewStyle().Foreground(mint)
)

func (m model) View() tea.View {
	v := tea.NewView(m.render())
	v.AltScreen = true
	v.BackgroundColor = bg
	v.ForegroundColor = ink
	v.WindowTitle = "Glove80 · " + m.layout
	return v
}

func (m model) render() string {
	if m.width < 40 || m.height < 22 {
		return fit("Glove80\nResize to at least 40 × 22.\nctrl+c to quit", max(1, m.width), max(1, m.height))
	}
	w := m.width - 4
	logo := accent.Bold(true).Render("GLOVE") + dimStyle.Render(" / ") + textStyle.Bold(true).Render("80")
	meta := dimStyle.Render(strings.ToUpper(m.layout) + "  ·  " + strings.ToUpper(m.effectiveDensity()))
	header := spread(logo, meta, w) + "\n\n"
	keyboard, library := dimStyle.Render("  Keyboard  "), dimStyle.Render("  Definitions  ")
	active := lipgloss.NewStyle().Foreground(bg).Background(mint).Bold(true)
	if m.screen == "keyboard" {
		keyboard = active.Render("  Keyboard  ")
	} else {
		library = active.Render("  Definitions  ")
	}
	header += spread(keyboard+"  "+library, dimStyle.Render("ctrl+p  actions"), w) + "\n"
	header += lipgloss.NewStyle().Foreground(line).Render(strings.Repeat("─", w))
	bodyHeight := m.height - 10
	body := ""
	switch {
	case m.mode == "picker":
		body = m.pickerView(w, bodyHeight)
	case m.mode == "confirm-clear" || m.mode == "confirm-flash":
		body = m.confirmView(w, bodyHeight)
	case m.mode == "search" || m.mode == "command" || m.mode == "output":
		body = m.outputView(w, bodyHeight)
	case m.data == nil:
		body = "\n" + m.spinner.View() + " Reading your keyboard config…\n\n" + dimStyle.Render("r reload   e edit   q quit")
	case m.screen == "library":
		body = m.libraryView(w, bodyHeight)
	default:
		body = m.keyboardView(w, bodyHeight)
	}
	status := m.status
	if m.busy {
		status = m.spinner.View() + " " + status
	} else {
		status = accent.Render("●") + " " + dimStyle.Render(status)
	}
	context := ""
	if m.data != nil {
		context = fmt.Sprintf("%d layers  ·  %d definitions", len(m.data.Layers), len(m.data.Entities))
	}
	footer := lipgloss.NewStyle().Foreground(line).Render(strings.Repeat("─", w)) + "\n"
	footer += spread(status, dimStyle.Render(context), w) + "\n" + m.hints()
	content := header + "\n" + fit(body, w, bodyHeight) + "\n" + footer
	return lipgloss.NewStyle().Background(bg).Foreground(ink).Padding(1, 2).Render(fit(content, w, m.height-2))
}

func (m model) effectiveDensity() string {
	if m.height < 42 {
		return "compact"
	}
	return m.density
}

func (m model) keyboardView(w, h int) string {
	sidePanel := m.layout == "studio" && w >= 140
	boardWidth := w
	if sidePanel {
		boardWidth -= 28
	}
	side := m.effectiveSide()
	sideName := "Both halves"
	if side != "both" {
		sideName = strings.ToUpper(side[:1]) + side[1:] + " half"
	}
	if m.side == "both" && side != "both" {
		sideName += " · auto"
	}
	layerTitle := accent.Bold(true).Render(fmt.Sprintf("%02d", m.layer)) + "  " + textStyle.Bold(true).Render(m.data.Layers[m.layer].Name)
	title := spread(layerTitle, dimStyle.Render(sideName), boardWidth)
	grid := m.keyboardGrid(boardWidth)
	legend := dimStyle.Render("tap") + "  " + lipgloss.NewStyle().Foreground(lavender).Render("hold / morph") + "  " + lipgloss.NewStyle().Foreground(blue).Render("layer") + "  " + lipgloss.NewStyle().Foreground(rose).Render("macro")
	board := title + "\n\n" + grid + "\n" + legend
	if sidePanel {
		inspector := m.inspector(25, h-1, true)
		return lipgloss.JoinHorizontal(lipgloss.Top, fit(board, boardWidth, h), "   ", inspector)
	}
	remaining := h - lipgloss.Height(board) - 1
	if remaining >= 4 {
		return board + "\n\n" + m.inspector(w, remaining-1, false)
	}
	key := m.selectedBinding()
	return board + "\n" + accent.Render(key.Name) + "  " + textStyle.Render(key.Tap) + "  " + dimStyle.Render(key.Hold+" · enter for details")
}

func (m model) keyboardGrid(w int) string {
	side := m.effectiveSide()
	start, end := 0, 19
	if side == "left" {
		end = 9
	}
	if side == "right" {
		start = 10
	}
	cellWidth := max(3, min(12, w/(end-start)))
	rows := make([]string, 0, len(m.data.Grid))
	for _, row := range m.data.Grid {
		cells := make([]string, 0, end-start)
		for _, pos := range row[start:end] {
			if pos == nil {
				cells = append(cells, fit("", cellWidth, m.keyRows()))
				continue
			}
			cells = append(cells, m.keyCell(m.data.Layers[m.layer].Keys[*pos], cellWidth))
		}
		rows = append(rows, lipgloss.JoinHorizontal(lipgloss.Top, cells...))
	}
	return strings.Join(rows, "\n")
}

func (m model) keyCell(key binding, width int) string {
	fg := ink
	switch key.Kind {
	case "empty":
		fg = muted
	case "layer":
		fg = blue
	case "macro":
		fg = rose
	case "modifier":
		fg = lavender
	}
	selected := key.Position == m.selected
	label := key.Tap
	if label == "" {
		label = "·"
	}
	secondary := key.Hold
	if selected && secondary == "" {
		secondary = key.Name
	}
	inner := width
	if m.effectiveDensity() == "tiles" {
		inner -= 2
	}
	primaryStyle := lipgloss.NewStyle().Foreground(fg).Width(inner).Align(lipgloss.Center)
	secondaryStyle := lipgloss.NewStyle().Foreground(muted).Width(inner).Align(lipgloss.Center)
	style := lipgloss.NewStyle().Width(width).Background(panel)
	if m.effectiveDensity() == "tiles" {
		style = style.Border(lipgloss.RoundedBorder()).BorderForeground(line)
	}
	if selected {
		style = style.Background(lipgloss.Color("#273A36")).BorderForeground(mint)
		primaryStyle = primaryStyle.Foreground(mint).Bold(true)
		secondaryStyle = secondaryStyle.Foreground(mint)
	}
	primaryStyle = primaryStyle.Background(style.GetBackground())
	secondaryStyle = secondaryStyle.Background(style.GetBackground())
	content := primaryStyle.Render(ansi.Truncate(label, inner, "…"))
	if m.keyRows() != 1 {
		content += "\n" + secondaryStyle.Render(ansi.Truncate(secondary, inner, "…"))
	}
	return style.Render(content)
}

func (m model) keyRows() int {
	if m.effectiveDensity() == "tiles" {
		return 4
	}
	if m.height < 30 {
		return 1
	}
	return 2
}

func (m model) inspector(w, h int, vertical bool) string {
	key := m.selectedBinding()
	title := accent.Bold(true).Render(key.Name) + dimStyle.Render(fmt.Sprintf("  /  position %02d", key.Position))
	if !vertical {
		summary := textStyle.Bold(true).Render(key.Tap)
		if key.Hold != "" {
			summary += dimStyle.Render("   hold ") + lipgloss.NewStyle().Foreground(lavender).Render(key.Hold)
		}
		return fit(spread(title+"   "+summary, dimStyle.Render("enter  full details"), w)+"\n"+dimStyle.Render(key.Source)+"\n"+m.briefDetail(key.Detail, w), w, h)
	}
	content := dimStyle.Render("SELECTED KEY") + "\n\n" + title + "\n\n"
	content += dimStyle.Render("TAP") + "\n" + textStyle.Bold(true).Render(key.Tap) + "\n\n"
	if key.Hold != "" {
		content += dimStyle.Render("HOLD") + "\n" + lipgloss.NewStyle().Foreground(lavender).Render(key.Hold) + "\n\n"
	}
	content += lipgloss.NewStyle().Foreground(line).Render(strings.Repeat("─", w)) + "\n\n"
	content += textStyle.Width(w).Render(key.Detail) + "\n\n" + dimStyle.Width(w).Render(key.Source)
	content += "\n\n" + accent.Render("enter") + dimStyle.Render(" details   ") + accent.Render("x") + dimStyle.Render(" clear")
	return fit(content, w, h)
}

func (m model) briefDetail(detail string, w int) string {
	lines := strings.Split(detail, "\n")
	if len(lines) > 1 {
		lines = lines[1:]
	}
	return dimStyle.Render(ansi.Truncate(strings.Join(lines, " · "), w, "…"))
}

func (m model) libraryView(w, h int) string {
	if w < 86 {
		return dimStyle.Render("enter to open a definition · / to filter") + "\n\n" + m.library.View()
	}
	left := fit(m.library.View(), m.library.Width(), h)
	rightWidth := w - m.library.Width() - 4
	right := dimStyle.Render("DEFINITION") + "\n\n" + textStyle.Render(m.viewport.View()) + "\n" + dimStyle.Render("pgup / pgdown to scroll")
	return lipgloss.JoinHorizontal(lipgloss.Top, left, "    ", fit(right, rightWidth, h))
}

func (m model) pickerView(w, h int) string {
	cardWidth := m.picker.Width() + 4
	card := lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(lavender).Padding(1, 1).Render(m.picker.View())
	return lipgloss.Place(w, h, lipgloss.Center, lipgloss.Top, fit(card, cardWidth, h))
}

func (m model) confirmView(w, h int) string {
	title, detail := "Clear this binding?", ""
	if m.mode == "confirm-clear" {
		key := m.data.Layers[m.confirmation.Layer].Keys[m.confirmation.Position]
		replacement := "&trans"
		if m.confirmation.Layer == 0 {
			replacement = "&none"
		}
		detail = fmt.Sprintf("%s · %s\n\n%s → %s\n\n%s\n\nThis writes to the native config file.", m.data.Layers[m.confirmation.Layer].Name, key.Name, key.Tap, replacement, key.Source)
	} else {
		title = "Build and flash?"
		detail = "scripts/glove-flash.sh " + strings.Join(m.flashArgs, " ") + "\n\nThe build will run in this terminal.\nFollow its prompts to connect the keyboard."
	}
	card := lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(rose).Padding(2, 3).Width(min(70, w-4)).Render(
		textStyle.Bold(true).Render(title) + "\n\n" + textStyle.Render(detail) + "\n\n" + accent.Render("y  confirm") + "     " + dimStyle.Render("n / esc  cancel"))
	return lipgloss.Place(w, h, lipgloss.Center, lipgloss.Center, card)
}

func (m model) outputView(w, h int) string {
	title := "Details"
	if m.mode == "search" {
		title = "Find a binding"
	}
	if m.mode == "command" {
		title = "Command"
	}
	content := textStyle.Bold(true).Render(title) + "\n\n"
	if m.mode != "output" {
		content += lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(lavender).Width(w-4).Padding(0, 1).Render(m.input.View()) + "\n\n"
	}
	if m.output == "" {
		content += dimStyle.Render("Search chords like Cmd+C, concepts like screenshot, or definition names.\nPress enter to search across every layer and definition.")
	} else {
		content += textStyle.Render(m.viewport.View())
	}
	return fit(content, w, h)
}

func (m model) hints() string {
	var hints [][2]string
	switch m.mode {
	case "picker":
		hints = [][2]string{{"↑↓", "choose"}, {"/", "filter"}, {"enter", "open"}, {"esc", "back"}}
	case "search", "command":
		hints = [][2]string{{"enter", "run"}, {"pgup/dn", "scroll"}, {"esc", "back"}}
	case "output":
		hints = [][2]string{{"↑↓", "scroll"}, {"pgup/dn", "page"}, {"esc", "back"}}
	case "confirm-clear", "confirm-flash":
		hints = [][2]string{{"y", "confirm"}, {"n / esc", "cancel"}}
	default:
		if m.screen == "library" {
			hints = [][2]string{{"↑↓", "choose"}, {"/", "filter"}, {"enter", "details"}, {"tab", "keyboard"}, {"ctrl+p", "actions"}}
		} else {
			hints = [][2]string{{"↑↓←→", "move"}, {"g", "layers"}, {"/", "find"}, {"tab", "definitions"}, {"v", "layout"}, {"d", "density"}, {"?", "help"}}
		}
	}
	parts := make([]string, 0, len(hints))
	for _, hint := range hints {
		parts = append(parts, accent.Render(hint[0])+" "+dimStyle.Render(hint[1]))
	}
	return strings.Join(parts, "   ")
}

// fit clips by terminal cell width and pads every frame to prevent resize spill.
func fit(s string, w, h int) string {
	lines := strings.Split(s, "\n")
	result := make([]string, max(0, h))
	for i := range result {
		if i < len(lines) {
			result[i] = ansi.Truncate(lines[i], max(0, w), "")
		}
		result[i] += strings.Repeat(" ", max(0, w-lipgloss.Width(result[i])))
	}
	return strings.Join(result, "\n")
}

func spread(left, right string, width int) string {
	gap := width - lipgloss.Width(left) - lipgloss.Width(right)
	if gap < 1 {
		return ansi.Truncate(left, width, "…")
	}
	return left + strings.Repeat(" ", gap) + right
}
