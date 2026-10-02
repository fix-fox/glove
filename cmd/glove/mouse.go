package main

import tea "charm.land/bubbletea/v2"

// boardGeometry is shared by drawing and hit tests, in zero-based terminal cells.
type boardGeometry struct {
	X, Y               int
	Width              int
	FirstRow, RowCount int
	StartCol, EndCol   int
	CellWidth          int
}

func (m model) boardGeometry() boardGeometry {
	g := boardGeometry{X: 2, Y: 7, Width: m.width - 4, EndCol: 19}
	if g.Width >= 140 {
		g.Width -= 28
	}
	switch m.effectiveSide() {
	case "left":
		g.EndCol = 9
	case "right":
		g.StartCol = 10
	}
	g.CellWidth = max(3, min(12, g.Width/(g.EndCol-g.StartCol)))
	if m.data != nil {
		g.FirstRow, g.RowCount = m.visibleRows(m.height - 10)
	}
	return g
}

func (g boardGeometry) contains(x, y int) bool {
	return x >= g.X && x < g.X+(g.EndCol-g.StartCol)*g.CellWidth && y >= g.Y && y < g.Y+g.RowCount*4
}

func (m model) keyAt(x, y int) (int, bool) {
	g := m.boardGeometry()
	if m.data == nil || !g.contains(x, y) {
		return 0, false
	}
	row := g.FirstRow + (y-g.Y)/4
	column := g.StartCol + (x-g.X)/g.CellWidth
	position := m.data.Grid[row][column]
	if position == nil {
		return 0, false
	}
	return *position, true
}

// choiceAt excludes row spacing, pagination, and unused rows on the final page.
func (m model) choiceAt(x, y int) (int, bool) {
	const top = 12
	if x < 2 || x >= m.width-2 || y < top || y >= min(top+m.picker.Height(), m.height-5) {
		return 0, false
	}
	row := (y - top) / 3
	if (y-top)%3 == 2 || row >= m.picker.Paginator.PerPage {
		return 0, false
	}
	index := m.picker.Paginator.Page*m.picker.Paginator.PerPage + row
	return index, index >= 0 && index < len(m.picker.VisibleItems())
}

// handleMouse activates only button presses; release and motion never repeat an action.
func (m model) handleMouse(msg tea.MouseMsg) (tea.Model, tea.Cmd) {
	if m.width < 40 || m.height < 22 || m.busy || m.mode == "confirm-clear" || m.mode == "confirm-flash" {
		return m, nil
	}
	mouse := msg.Mouse()
	if mouse.X < 0 || mouse.X >= m.width || mouse.Y < 0 || mouse.Y >= m.height {
		return m, nil
	}
	switch msg.(type) {
	case tea.MouseWheelMsg:
		direction := 0
		switch mouse.Button {
		case tea.MouseWheelUp:
			direction = -1
		case tea.MouseWheelDown:
			direction = 1
		}
		if direction != 0 {
			m.scrollMouse(mouse.X, mouse.Y, direction)
		}
		return m, nil
	case tea.MouseClickMsg:
		if mouse.Button != tea.MouseLeft {
			return m, nil
		}
	default:
		return m, nil
	}
	if m.mode == "picker" || m.mode == "search" {
		if index, ok := m.choiceAt(mouse.X, mouse.Y); ok {
			m.picker.Select(index)
			return m.activateChoice()
		}
		return m, nil
	}
	if m.mode != "" || m.data == nil {
		return m, nil
	}
	if mouse.Y == 3 {
		switch {
		case mouse.X >= 2 && mouse.X < 14:
			m.screen = "keyboard"
		case mouse.X >= 16 && mouse.X < 31:
			m.screen = "library"
		default:
			return m, nil
		}
		m.resize()
		return m, nil
	}
	if m.screen == "keyboard" {
		if position, ok := m.keyAt(mouse.X, mouse.Y); ok {
			m.chooseKey(m.layer, position)
		}
	}
	return m, nil
}

func (m *model) scrollMouse(x, y, direction int) {
	if x < 2 || x >= m.width-2 || y < 5 || y >= m.height-5 {
		return
	}
	switch m.mode {
	case "picker", "search":
		if len(m.picker.VisibleItems()) > 0 {
			m.picker.Select(min(max(0, m.picker.Index()+direction), len(m.picker.VisibleItems())-1))
		}
	case "output", "command":
		m.scrollDetails(direction)
	case "":
		if m.data == nil {
			return
		}
		if m.screen == "keyboard" {
			if m.boardGeometry().contains(x, y) {
				m.move(0, direction)
			}
			return
		}
		if m.width < 90 || x < 2+m.library.Width() {
			if direction < 0 {
				m.library.CursorUp()
			} else {
				m.library.CursorDown()
			}
			m.refreshViewport()
			m.viewport.GotoTop()
		} else if x >= 2+m.library.Width()+4 {
			m.scrollDetails(direction)
		}
	}
}

func (m *model) scrollDetails(direction int) {
	if direction < 0 {
		m.viewport.ScrollUp(3)
	} else {
		m.viewport.ScrollDown(3)
	}
}
