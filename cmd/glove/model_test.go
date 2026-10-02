package main

import (
	"errors"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"unicode"

	"charm.land/bubbles/v2/list"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"
	"github.com/fix-fox/glove/internal/keymap"
)

var fixtureOnce sync.Once
var fixture *keymap.Document
var fixtureErr error

func loadedModel(t *testing.T) model {
	t.Helper()
	root, err := filepath.Abs("../..")
	if err != nil {
		t.Fatal(err)
	}
	fixtureOnce.Do(func() {
		fixture, fixtureErr = keymap.Load(filepath.Join(root, "config", "glove80.keymap"))
	})
	if fixtureErr != nil {
		t.Fatal(fixtureErr)
	}
	if fixture == nil {
		t.Fatal("missing snapshot")
	}
	m := newModel(root)
	m.setDocument(fixture)
	m.busy = false
	return m
}

func press(m model, code rune) (model, tea.Cmd) {
	key := tea.KeyPressMsg{Code: code}
	if unicode.IsPrint(code) {
		key.Text = string(code)
	}
	updated, cmd := m.Update(key)
	return updated.(model), cmd
}

func TestSearchAndCommandInputsChangeReturnedModel(t *testing.T) {
	m := loadedModel(t)
	m, _ = press(m, '/')
	if m.mode != "search" || !m.input.Focused() {
		t.Fatal("search did not open")
	}
	m, _ = press(m, tea.KeyEscape)
	m, _ = press(m, ':')
	if m.mode != "command" {
		t.Fatal("command entry did not open")
	}
}

func TestGeometryNavigationReachesEveryKeyAndRespectsExplicitHalf(t *testing.T) {
	for _, side := range []string{"both", "left", "right"} {
		t.Run(side, func(t *testing.T) {
			m := loadedModel(t)
			m.side = side
			m.ensureVisibleSelection()
			seen := map[int]bool{m.selected: true}
			queue := []int{m.selected}
			for len(queue) > 0 {
				current := queue[0]
				queue = queue[1:]
				for _, direction := range [][2]int{{1, 0}, {-1, 0}, {0, 1}, {0, -1}} {
					m.selected = current
					m.move(direction[0], direction[1])
					if !seen[m.selected] {
						seen[m.selected] = true
						queue = append(queue, m.selected)
					}
				}
			}
			want := 80
			if side != "both" {
				want = 40
			}
			if len(seen) != want {
				t.Fatalf("reached %d keys, want %d", len(seen), want)
			}
		})
	}
}

func TestClearRequiresConfirmationAndKeepsDisplayedDocument(t *testing.T) {
	m := loadedModel(t)
	m, cmd := press(m, 'x')
	if cmd != nil || m.mode != "confirm-clear" {
		t.Fatal("clear should only open confirmation")
	}
	if m.confirmation.document != m.document || m.confirmation.position != 37 {
		t.Fatal("clear lost displayed source context")
	}
	m, cmd = press(m, 'n')
	if cmd != nil || m.mode != "" {
		t.Fatal("cancel should not write")
	}
	m, _ = press(m, 'x')
	m, cmd = press(m, 'y')
	if cmd == nil || !m.busy || m.mode != "" {
		t.Fatal("confirmation should queue the checked edit")
	}
}

func TestConfirmationChoicesFitSmallTerminals(t *testing.T) {
	for _, size := range [][2]int{{150, 46}, {80, 24}, {40, 22}} {
		for _, mode := range []string{"confirm-clear", "confirm-flash"} {
			m := loadedModel(t)
			m.width, m.height, m.mode = size[0], size[1], mode
			m.confirmation = clearSelection{document: m.document, layer: m.layer, position: m.selected}
			m.flashArgs = []string{"--remote", "--full"}
			frame := ansi.Strip(m.confirmView(m.width-4, m.height-10))
			if lipgloss.Height(frame) > m.height-10 || lipgloss.Width(frame) > m.width-4 || !strings.Contains(frame, "y  confirm") || !strings.Contains(frame, "cancel") {
				t.Fatalf("%s confirmation does not fit %v:\n%s", mode, size, frame)
			}
		}
	}
}

func TestCompletedLayerCommandClearsBusyStatus(t *testing.T) {
	m := loadedModel(t)
	m.busy, m.status = true, "Searching config…"
	updated, _ := m.Update(m.command("layer symbols")())
	m = updated.(model)
	if m.busy || m.mode != "" || m.status != "Ready" || m.data.Layers[m.layer].Name != "symbols" {
		t.Fatal("layer command did not finish cleanly")
	}
}

func TestFailedReloadKeepsLastValidSnapshotAndFullError(t *testing.T) {
	m := loadedModel(t)
	previous := m.data
	updated, _ := m.Update(configMsg{err: errors.New("bad include: config/example.h:12")})
	m = updated.(model)
	if m.data != previous || m.mode != "output" || !strings.Contains(m.output, "example.h:12") {
		t.Fatal("reload error discarded the usable map or diagnostic")
	}
}

func TestTiledFramesFitTerminalAndKeepEverySelectedRowVisible(t *testing.T) {
	for _, size := range [][2]int{{150, 46}, {100, 46}, {80, 24}, {40, 22}, {110, 36}} {
		m := loadedModel(t)
		m.width, m.height = size[0], size[1]
		m.resize()
		for position := range 80 {
			m.selected = position
			first, count := m.visibleRows(m.height - 10)
			visible := false
			for _, row := range m.data.Grid[first : first+count] {
				for _, key := range row {
					if key != nil && *key == position {
						visible = true
					}
				}
			}
			if !visible {
				t.Fatalf("position %d lost at %v", position, size)
			}
			grid := m.keyboardGrid()
			if lipgloss.Height(grid) != count*4 {
				t.Fatalf("tile geometry wrapped at %v", size)
			}
			frame := m.render()
			if lipgloss.Width(frame) != m.width || lipgloss.Height(frame) != m.height {
				t.Fatalf("frame exceeds %v", size)
			}
			if !strings.Contains(ansi.Strip(frame), "╭") {
				t.Fatal("tiled keyboard disappeared")
			}
		}
	}
}

func TestCommandCompletionCyclesNativeMatches(t *testing.T) {
	m := loadedModel(t)
	m.openInput("command")
	m.input.SetValue("layer sym")
	m.input.CursorEnd()
	m, _ = press(m, tea.KeyTab)
	if m.input.Value() != "layer symbols" {
		t.Fatalf("layer completion failed: %q", m.input.Value())
	}
	m.input.SetValue("key 2")
	m.input.CursorEnd()
	m, _ = press(m, tea.KeyTab)
	first := m.input.Value()
	m, _ = press(m, tea.KeyTab)
	if m.input.Value() == first || !strings.HasPrefix(m.input.Value(), "key 2") {
		t.Fatal("completion did not cycle")
	}
}

func TestFlashSelectionRequiresConfirmation(t *testing.T) {
	m := loadedModel(t)
	m, cmd := press(m, 'f')
	if m.pickerKind != "flash" {
		t.Fatal("flash should open choice list")
	}
	m.picker.Select(3)
	m, cmd = press(m, tea.KeyEnter)
	if cmd != nil || m.mode != "confirm-flash" || strings.Join(m.flashArgs, " ") != "--remote --full" {
		t.Fatal("flash started without confirmation or lost flags")
	}
	m, cmd = press(m, tea.KeyEscape)
	if cmd != nil || m.mode != "" {
		t.Fatal("flash cancellation failed")
	}
}

func TestReloadInvalidatesPickersAndResetsDefinitionFilter(t *testing.T) {
	m := loadedModel(t)
	m.screen = "library"
	m.library.SetFilterText("copy")
	m.openLayers()
	next := nativeFixture(t, "B", "base")
	m.layer = 17
	m.setDocument(next.document)
	if m.layer != 0 || m.mode != "" || m.library.FilterState() != list.Unfiltered {
		t.Fatal("reload retained stale layer indexes or definition filter")
	}
	if len(m.library.VisibleItems()) != len(m.data.Entities) {
		t.Fatal("reload lost definitions")
	}
}

func TestScrolledResultsExposeTheFinalLineAtEverySupportedSize(t *testing.T) {
	for _, size := range [][2]int{{150, 46}, {80, 24}, {40, 22}} {
		for _, mode := range []string{"command", "output"} {
			m := loadedModel(t)
			m.width, m.height, m.mode = size[0], size[1], mode
			m.output = strings.Repeat("earlier result\n", 100) + "FINAL RESULT"
			m.resize()
			m.viewport.GotoBottom()
			if !strings.Contains(ansi.Strip(m.render()), "FINAL RESULT") {
				t.Fatalf("bottom result clipped for %s at %v", mode, size)
			}
		}
	}
}

func TestExternalFailureAndReloadFailureAreBothReportedImmediately(t *testing.T) {
	m := loadedModel(t)
	m.processError = errors.New("editor exited with code 7")
	updated, _ := m.Update(configMsg{err: errors.New("invalid native config")})
	m = updated.(model)
	if m.processError != nil || !strings.Contains(m.output, "code 7") || !strings.Contains(m.output, "invalid native config") {
		t.Fatal("external or reload error was hidden")
	}
}

func TestEveryLayerAndHalfRendersWithinTheTerminal(t *testing.T) {
	m := loadedModel(t)
	for layer := range m.data.Layers {
		for _, side := range []string{"both", "left", "right"} {
			for _, size := range [][2]int{{150, 46}, {100, 46}, {80, 24}} {
				m.layer, m.side, m.width, m.height = layer, side, size[0], size[1]
				m.ensureVisibleSelection()
				m.resize()
				frame := m.render()
				if lipgloss.Width(frame) != size[0] || lipgloss.Height(frame) != size[1] {
					t.Fatalf("layer %d %s exceeds %v", layer, side, size)
				}
				if strings.Contains(frame, "�") {
					t.Fatalf("layer %d broke Unicode rendering", layer)
				}
			}
		}
	}
}
