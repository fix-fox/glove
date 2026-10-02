package main

import (
	"fmt"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
)

func mouseEvent(m model, event tea.MouseMsg) (model, tea.Cmd) {
	updated, cmd := m.handleMouse(event)
	return updated.(model), cmd
}

func clickAt(m model, x, y int) (model, tea.Cmd) {
	return mouseEvent(m, tea.MouseClickMsg{X: x, Y: y, Button: tea.MouseLeft})
}

func TestMouseHitsEveryVisibleKeyAndIgnoresPhysicalGaps(t *testing.T) {
	for _, size := range [][2]int{{150, 46}, {100, 46}, {80, 24}, {40, 22}, {110, 36}} {
		for _, side := range []string{"both", "left", "right"} {
			t.Run(fmt.Sprintf("%dx%d/%s", size[0], size[1], side), func(t *testing.T) {
				m := loadedModel(t)
				m.width, m.height, m.side = size[0], size[1], side
				m.ensureVisibleSelection()
				m.resize()
				g := m.boardGeometry()
				for row := g.FirstRow; row < g.FirstRow+g.RowCount; row++ {
					for column := g.StartCol; column < g.EndCol; column++ {
						x, y := g.X+(column-g.StartCol)*g.CellWidth, g.Y+(row-g.FirstRow)*4
						want := m.data.Grid[row][column]
						for _, point := range [][2]int{{x, y}, {x + g.CellWidth - 1, y + 3}} {
							position, ok := m.keyAt(point[0], point[1])
							if want == nil {
								if ok {
									t.Fatalf("gap at %v selected position %d", point, position)
								}
								continue
							}
							if !ok || position != *want {
								t.Fatalf("point %v hit %d/%v, want %d", point, position, ok, *want)
							}
							updated, cmd := clickAt(m, point[0], point[1])
							if updated.selected != *want || updated.layer != m.layer || cmd != nil {
								t.Fatalf("click selected %d on layer %d or started a command", updated.selected, updated.layer)
							}
						}
					}
				}
				for _, point := range [][2]int{{g.X - 1, g.Y}, {g.X, g.Y - 1}, {g.X + (g.EndCol-g.StartCol)*g.CellWidth, g.Y}, {g.X, g.Y + g.RowCount*4}} {
					if position, ok := m.keyAt(point[0], point[1]); ok {
						t.Fatalf("outside point %v selected %d", point, position)
					}
				}
			})
		}
	}
}

func TestMouseGeometryFollowsResizeAndAutomaticHalf(t *testing.T) {
	m := loadedModel(t)
	m.selected = 43
	for _, size := range [][2]int{{150, 46}, {80, 24}, {40, 22}, {150, 46}} {
		updated, _ := m.Update(tea.WindowSizeMsg{Width: size[0], Height: size[1]})
		m = updated.(model)
		g := m.boardGeometry()
		wantStart := 0
		if size[0] < 100 {
			wantStart = 10
		}
		if g.StartCol != wantStart {
			t.Fatalf("width %d uses first column %d, want %d", size[0], g.StartCol, wantStart)
		}
		found := false
		for row := g.FirstRow; row < g.FirstRow+g.RowCount; row++ {
			for column := g.StartCol; column < g.EndCol; column++ {
				if position := m.data.Grid[row][column]; position != nil && *position == m.selected {
					found = true
					got, ok := m.keyAt(g.X+(column-g.StartCol)*g.CellWidth+1, g.Y+(row-g.FirstRow)*4+1)
					if !ok || got != m.selected {
						t.Fatal("selected key was not clickable after resize")
					}
				}
			}
		}
		if !found {
			t.Fatal("selected key disappeared after resize")
		}
	}
}

func TestMouseTabsChangeScreensWithoutCommands(t *testing.T) {
	m := loadedModel(t)
	m, cmd := clickAt(m, 20, 3)
	if cmd != nil || m.screen != "library" {
		t.Fatal("definitions tab did not open")
	}
	m, cmd = clickAt(m, 5, 3)
	if cmd != nil || m.screen != "keyboard" {
		t.Fatal("keyboard tab did not open")
	}
	m, cmd = clickAt(m, 15, 3)
	if cmd != nil || m.screen != "keyboard" {
		t.Fatal("gap between tabs changed screens")
	}
}

func TestMouseIgnoresConfirmationMotionReleaseAndBusyStates(t *testing.T) {
	for _, mode := range []string{"", "confirm-clear", "confirm-flash", "output", "command"} {
		m := loadedModel(t)
		m.mode = mode
		for _, event := range []tea.MouseMsg{
			tea.MouseReleaseMsg{X: 3, Y: 8, Button: tea.MouseLeft},
			tea.MouseMotionMsg{X: 3, Y: 8, Button: tea.MouseLeft},
			tea.MouseClickMsg{X: 3, Y: 8, Button: tea.MouseRight},
		} {
			updated, cmd := mouseEvent(m, event)
			if cmd != nil || updated.mode != m.mode || updated.selected != m.selected {
				t.Fatalf("non-activation mouse event changed mode %s", mode)
			}
		}
		if mode != "" {
			updated, cmd := clickAt(m, 3, 8)
			if cmd != nil || updated.mode != m.mode || updated.selected != m.selected {
				t.Fatalf("click escaped mode %s", mode)
			}
		}
	}
	m := loadedModel(t)
	m.busy = true
	updated, cmd := clickAt(m, 3, 8)
	if cmd != nil || updated.selected != m.selected {
		t.Fatal("click changed a busy model")
	}
}

func TestMousePickerSelectionUsesCurrentPageAndIgnoresSpacing(t *testing.T) {
	m := loadedModel(t)
	m.openLayers()
	for _, mode := range []string{"picker", "search"} {
		m.mode = mode
		m.picker.SetSize(m.width-4, 14)
		m.picker.Select(m.picker.Paginator.PerPage)
		start := m.picker.Paginator.Page * m.picker.Paginator.PerPage
		for _, point := range [][2]int{{3, 12}, {3, 13}, {m.width - 3, 12}} {
			index, ok := m.choiceAt(point[0], point[1])
			if !ok || index != start {
				t.Fatalf("mode %s point %v selected %d/%v, want page start %d", mode, point, index, ok, start)
			}
		}
		for _, point := range [][2]int{{1, 12}, {m.width - 2, 12}, {3, 11}, {3, 14}, {3, 12 + m.picker.Paginator.PerPage*3}, {3, m.height - 4}} {
			if index, ok := m.choiceAt(point[0], point[1]); ok {
				t.Fatalf("mode %s non-entry point %v selected %d", mode, point, index)
			}
		}
		m.picker.Select(len(m.picker.Items()) - 1)
		remaining := len(m.picker.Items()) - m.picker.Paginator.Page*m.picker.Paginator.PerPage
		if index, ok := m.choiceAt(3, 12+remaining*3); ok {
			t.Fatalf("blank final-page row selected %d", index)
		}
	}
}

func TestMousePickerClickActivatesOnlyOnce(t *testing.T) {
	m := loadedModel(t)
	m.openLayers()
	m.picker.Select(0)
	m, cmd := clickAt(m, 5, 15)
	if cmd != nil || m.layer != 1 || m.mode != "" || m.screen != "keyboard" {
		t.Fatalf("layer click did not navigate once: layer %d, mode %s, screen %s", m.layer, m.mode, m.screen)
	}
	selected := m.selected
	m, cmd = mouseEvent(m, tea.MouseReleaseMsg{X: 5, Y: 15, Button: tea.MouseLeft})
	if cmd != nil || m.layer != 1 || m.selected != selected {
		t.Fatal("release repeated activation")
	}
}

func TestMouseSearchClickNavigatesToExactBinding(t *testing.T) {
	for _, size := range [][2]int{{150, 46}, {40, 22}} {
		m := loadedModel(t)
		m.width, m.height = size[0], size[1]
		m.openInput("search")
		m.input.SetValue("Cmd+C")
		m.refreshChoices()
		index := -1
		var target searchItem
		for i, item := range m.picker.Items() {
			result, ok := item.(searchItem)
			if ok && result.Target.Kind == "key" {
				index, target = i, result
				break
			}
		}
		if index < 0 {
			t.Fatal("fixture search has no binding target")
		}
		m.picker.Select(index)
		row := index % m.picker.Paginator.PerPage
		updated, cmd := clickAt(m, 4, 12+row*3)
		if cmd != nil || updated.layer != target.Target.LayerIndex || updated.selected != target.Target.Position || updated.mode != "" || updated.screen != "keyboard" {
			t.Fatalf("click missed the exact search target at %v: layer %d, position %d, mode %s", size, updated.layer, updated.selected, updated.mode)
		}
	}
}

func TestMouseWheelNavigatesKeyboardAndChoicesAndScrollsDetails(t *testing.T) {
	m := loadedModel(t)
	m.width, m.height = 80, 24
	m.resize()
	before := m.selected
	m, _ = mouseEvent(m, tea.MouseWheelMsg{X: 3, Y: 8, Button: tea.MouseWheelDown})
	if m.selected == before {
		t.Fatal("wheel did not move to the next keyboard row")
	}
	g := m.boardGeometry()
	visible := false
	for _, row := range m.data.Grid[g.FirstRow : g.FirstRow+g.RowCount] {
		for _, position := range row[g.StartCol:g.EndCol] {
			if position != nil && *position == m.selected {
				visible = true
			}
		}
	}
	if !visible {
		t.Fatal("wheel moved selection outside the visible physical rows")
	}
	m.openLayers()
	m.picker.Select(0)
	m, _ = mouseEvent(m, tea.MouseWheelMsg{X: 3, Y: 12, Button: tea.MouseWheelDown})
	if m.picker.Index() != 1 || m.mode != "picker" {
		t.Fatal("wheel should select a choice without activating it")
	}
	m.mode, m.output = "output", strings.Repeat("detail\n", 100)
	m.resize()
	m, _ = mouseEvent(m, tea.MouseWheelMsg{X: 3, Y: 8, Button: tea.MouseWheelDown})
	if m.viewport.YOffset() != 3 {
		t.Fatal("wheel did not scroll details")
	}
	m, _ = mouseEvent(m, tea.MouseWheelMsg{X: 3, Y: 8, Button: tea.MouseWheelUp})
	if m.viewport.YOffset() != 0 {
		t.Fatal("wheel did not scroll back to the top")
	}
}

func TestMouseLibraryWheelSeparatesListAndDetails(t *testing.T) {
	m := loadedModel(t)
	m.screen = "library"
	m.resize()
	m.library.Select(0)
	m, _ = mouseEvent(m, tea.MouseWheelMsg{X: 3, Y: 8, Button: tea.MouseWheelDown})
	if m.library.Index() != 1 {
		t.Fatal("wheel over library list did not select the next definition")
	}
	m.viewport.SetContent(strings.Repeat("detail\n", 100))
	m, _ = mouseEvent(m, tea.MouseWheelMsg{X: 2 + m.library.Width() + 4, Y: 8, Button: tea.MouseWheelDown})
	if m.library.Index() != 1 || m.viewport.YOffset() != 3 {
		t.Fatal("wheel over definition details changed the list or failed to scroll")
	}
}
