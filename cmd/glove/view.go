package main

import (
	"fmt"
	"image/color"
	"strconv"
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
	v.WindowTitle = "Glove80"
	v.MouseMode = tea.MouseModeCellMotion
	return v
}

func (m model) render() string {
	if m.width < 40 || m.height < 22 {
		return fit("Glove80\nResize to at least 40 × 22.\nctrl+c to quit", max(1, m.width), max(1, m.height))
	}
	w := m.width - 4
	logo := accent.Bold(true).Render("GLOVE") + dimStyle.Render(" / ") + textStyle.Bold(true).Render("80")
	meta := dimStyle.Render("e edit  ·  r reload  ·  f flash")
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
	case m.mode == "picker" || m.mode == "search":
		body = m.choicesView(w, bodyHeight)
	case m.mode == "confirm-clear" || m.mode == "confirm-flash":
		body = m.confirmView(w, bodyHeight)
	case m.mode == "command" || m.mode == "output":
		body = m.outputView(w, bodyHeight)
	case m.mode == "name":
		body = m.keyNameView(w, bodyHeight)
	case m.data == nil:
		body = "\n" + m.spinner.View() + " Reading your keyboard config…\n\n" + dimStyle.Render("r reload   e edit   q quit")
	case m.screen == "library":
		body = m.libraryView(w, bodyHeight)
	default:
		body = m.keyboardView(w, bodyHeight)
	}
	status := m.status
	if m.mode == "jump" {
		status = accent.Render("Go to ") + m.input.View() + "  " + dimStyle.Render(m.status)
	} else if m.busy {
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

func (m model) keyboardView(w, h int) string {
	sidePanel := w >= 140
	geometry := m.boardGeometry()
	boardWidth := geometry.Width
	side := m.effectiveSide()
	sideName := "Both halves"
	if side != "both" {
		sideName = strings.ToUpper(side[:1]) + side[1:] + " half"
	}
	if m.side == "both" && side != "both" {
		sideName += " · auto"
	}
	layerTitle := accent.Bold(true).Render(fmt.Sprintf("%02d", m.layer)) + "  " + textStyle.Bold(true).Render(m.data.Layers[m.layer].Name)
	first, count := geometry.FirstRow, geometry.RowCount
	if count < len(m.data.Grid) {
		sideName += fmt.Sprintf(" · rows %d-%d", first+1, first+count)
	}
	title := spread(layerTitle, dimStyle.Render(sideName), boardWidth)
	grid := m.keyboardGrid()
	legend := keyLegend()
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
	summary := accent.Render("pos " + strconv.Itoa(key.Position))
	if key.Name != "" {
		summary += "  " + textStyle.Bold(true).Render(key.Name)
	}
	return board + "\n" + summary + "  " + bindingStyle(key.TapKind).Render(key.Tap) + "  " + bindingStyle(key.HoldKind).Render(key.Hold) + dimStyle.Render(" · enter for details")
}

func (m model) keyboardGrid() string {
	geometry := m.boardGeometry()
	start, end := geometry.StartCol, geometry.EndCol
	cellWidth := geometry.CellWidth
	rows := make([]string, 0, len(m.data.Grid))
	for _, row := range m.data.Grid[geometry.FirstRow : geometry.FirstRow+geometry.RowCount] {
		cells := make([]string, 0, end-start)
		for _, pos := range row[start:end] {
			if pos == nil {
				cells = append(cells, fit("", cellWidth, 4))
				continue
			}
			cells = append(cells, m.keyCell(m.data.Layers[m.layer].Keys[*pos], cellWidth))
		}
		rows = append(rows, lipgloss.JoinHorizontal(lipgloss.Top, cells...))
	}
	return strings.Join(rows, "\n")
}

func (m model) keyCell(key binding, width int) string {
	selected := key.Position == m.selected
	label := key.Tap
	if key.Name != "" {
		label = key.Name
	}
	if label == "" {
		label = "·"
	}
	secondary := key.Hold
	if m.mode == "jump" {
		secondary = strconv.Itoa(key.Position)
	}
	inner := width - 2
	primaryStyle := bindingStyle(key.TapKind).Width(inner).Align(lipgloss.Center)
	secondaryStyle := bindingStyle(key.HoldKind).Width(inner).Align(lipgloss.Center)
	if m.mode == "jump" {
		secondaryStyle = secondaryStyle.Foreground(mint)
	}
	style := lipgloss.NewStyle().Width(width).Background(panel).Border(lipgloss.RoundedBorder()).BorderForeground(line)
	if selected {
		style = style.Background(lipgloss.Color("#273A36")).BorderForeground(mint)
		primaryStyle = primaryStyle.Bold(true)
	}
	primaryStyle = primaryStyle.Background(style.GetBackground())
	secondaryStyle = secondaryStyle.Background(style.GetBackground())
	content := primaryStyle.Render(ansi.Truncate(label, inner, "…"))
	content += "\n" + secondaryStyle.Render(ansi.Truncate(secondary, inner, "…"))
	return style.Render(content)
}

func kindColor(kind string) color.Color {
	switch kind {
	case "empty":
		return muted
	case "modifier":
		return lavender
	case "layer":
		return blue
	case "macro":
		return rose
	default:
		return ink
	}
}

func bindingStyle(kind string) lipgloss.Style {
	return lipgloss.NewStyle().Foreground(kindColor(kind))
}

func keyLegend() string {
	return bindingStyle("key").Render("tap") + "  " + bindingStyle("modifier").Render("modifier / morph") + "  " + bindingStyle("layer").Render("layer") + "  " + bindingStyle("macro").Render("macro")
}

// visibleRows scrolls whole physical rows and always includes the selected key.
func (m model) visibleRows(height int) (first, count int) {
	count = min(len(m.data.Grid), max(1, (height-4)/4))
	selectedRow := 0
	for row, positions := range m.data.Grid {
		for _, position := range positions {
			if position != nil && *position == m.selected {
				selectedRow = row
			}
		}
	}
	first = min(max(0, selectedRow-count/2), len(m.data.Grid)-count)
	return first, count
}

func (m model) inspector(w, h int, vertical bool) string {
	key := m.selectedBinding()
	title := dimStyle.Render("pos ") + accent.Bold(true).Render(strconv.Itoa(key.Position))
	if key.Name != "" {
		if vertical {
			title += "\n" + textStyle.Bold(true).Width(w).Render(key.Name)
		} else {
			title += "   " + textStyle.Bold(true).Render(key.Name)
		}
	}
	if !vertical {
		summary := bindingStyle(key.TapKind).Bold(true).Render(key.Tap)
		if key.Hold != "" {
			summary += dimStyle.Render("   hold / alternate ") + bindingStyle(key.HoldKind).Render(key.Hold)
		}
		return fit(spread(title+"   "+summary, dimStyle.Render("enter  full details"), w)+"\n"+dimStyle.Render(key.Source)+"\n"+m.briefDetail(key.Detail, w), w, h)
	}
	content := dimStyle.Render("SELECTED KEY") + "\n\n" + title + "\n\n"
	content += dimStyle.Render("TAP") + "\n" + bindingStyle(key.TapKind).Bold(true).Render(key.Tap) + "\n\n"
	if key.Hold != "" {
		content += dimStyle.Render("HOLD / ALTERNATE") + "\n" + bindingStyle(key.HoldKind).Render(key.Hold) + "\n\n"
	}
	content += lipgloss.NewStyle().Foreground(line).Render(strings.Repeat("─", w)) + "\n\n"
	content += textStyle.Width(w).Render(key.Detail) + "\n\n" + dimStyle.Width(w).Render(key.Source)
	content += "\n\n" + accent.Render("n") + dimStyle.Render(" name   ") + accent.Render("x") + dimStyle.Render(" clear")
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
		return dimStyle.Render("enter to open a definition · / to find") + "\n\n" + m.library.View()
	}
	left := fit(m.library.View(), m.library.Width(), h)
	rightWidth := w - m.library.Width() - 4
	right := dimStyle.Render("DEFINITION") + "\n\n" + textStyle.Render(m.viewport.View()) + "\n" + dimStyle.Render("pgup / pgdown to scroll")
	return lipgloss.JoinHorizontal(lipgloss.Top, left, "    ", fit(right, rightWidth, h))
}

func (m model) confirmView(w, h int) string {
	title, detail := "Clear this binding?", ""
	compact := h < 20 || w < 80
	cardWidth := min(70, w-4)
	if compact {
		cardWidth = min(70, w)
	}
	if m.mode == "confirm-clear" {
		key := m.data.Layers[m.confirmation.layer].Keys[m.confirmation.position]
		replacement := "&trans"
		if m.confirmation.layer == 0 {
			replacement = "&none"
		}
		detail = fmt.Sprintf("%s · pos %d\n\n%s → %s\n\n%s\n\nThis writes to the native config file.", m.data.Layers[m.confirmation.layer].Name, key.Position, key.Tap, replacement, key.Source)
		if compact {
			detail = fmt.Sprintf("pos %d\nWrite %s to config\n%s", key.Position, replacement, key.Source)
		}
	} else {
		title = "Build and flash?"
		detail = "scripts/glove-flash.sh " + strings.Join(m.flashArgs, " ") + "\n\nThe build will run in this terminal.\nFollow its prompts to connect the keyboard."
		if compact {
			detail = strings.Join(m.flashArgs, " ") + "\nBuild runs in this terminal.\nFollow the connection prompts."
		}
	}
	style := lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(rose).Padding(2, 3).Width(cardWidth)
	if compact {
		style = style.Padding(0, 1)
		lines := strings.Split(detail, "\n")
		for i := range lines {
			lines[i] = ansi.Truncate(lines[i], cardWidth-4, "…")
		}
		detail = strings.Join(lines, "\n")
	}
	card := style.Render(
		textStyle.Bold(true).Render(title) + "\n\n" + textStyle.Render(detail) + "\n\n" + accent.Render("y  confirm") + "     " + dimStyle.Render("n / esc  cancel"))
	return lipgloss.Place(w, h, lipgloss.Center, lipgloss.Center, card)
}

func (m model) outputView(w, h int) string {
	title := "Details"
	if m.mode == "command" {
		title = "Command"
	}
	content := textStyle.Bold(true).Render(title) + "\n\n"
	if m.mode != "output" {
		content += lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(lavender).Width(w-4).Padding(0, 1).Render(m.input.View()) + "\n\n"
	}
	if m.output == "" {
		if m.mode == "command" {
			content += dimStyle.Render("Try layer symbols, key 43, or find Cmd+C.\nTab completes commands and names. Enter runs the command.")
		}
	} else {
		content += textStyle.Render(m.viewport.View())
	}
	return fit(content, w, h)
}

func (m model) hints() string {
	var hints [][2]string
	switch m.mode {
	case "picker", "search":
		hints = [][2]string{{"type", "filter"}, {"↑↓", "choose"}, {"enter", "open"}, {"esc", "back"}}
	case "jump":
		hints = [][2]string{{"0–79", "position"}, {"enter", "jump"}, {"esc", "cancel"}}
	case "command":
		hints = [][2]string{{"enter", "run"}, {"tab", "complete"}, {"pgup/dn", "scroll"}, {"esc", "back"}}
	case "name":
		hints = [][2]string{{"enter", "save"}, {"empty", "remove name"}, {"esc", "cancel"}}
	case "output":
		hints = [][2]string{{"↑↓", "scroll"}, {"pgup/dn", "page"}, {"esc", "back"}}
	case "confirm-clear", "confirm-flash":
		hints = [][2]string{{"y", "confirm"}, {"n / esc", "cancel"}}
	default:
		if m.screen == "library" {
			hints = [][2]string{{"↑↓", "choose"}, {"/", "find"}, {"enter", "details"}, {"tab", "keyboard"}, {"ctrl+p", "actions"}}
		} else {
			hints = [][2]string{{"↑↓←→", "move"}, {"l", "layers"}, {"g", "position"}, {"/", "find"}, {"n", "name"}, {"tab", "definitions"}}
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
