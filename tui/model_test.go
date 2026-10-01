package main

import (
	"errors"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"charm.land/bubbles/v2/list"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"
)

var fixtureOnce sync.Once
var fixture *snapshot
var fixtureErr error

func loadedModel(t *testing.T) model {
	t.Helper()
	root, err := filepath.Abs("..")
	if err != nil {
		t.Fatal(err)
	}
	fixtureOnce.Do(func() {
		result, err := callBridge(root, request{Action: "snapshot"})
		fixture, fixtureErr = result.Snapshot, err
	})
	if fixtureErr != nil {
		t.Fatal(fixtureErr)
	}
	if fixture == nil {
		t.Fatal("missing snapshot")
	}
	m := newModel(root, "studio", "tiles")
	m.setSnapshot(fixture)
	m.busy = false
	return m
}

func press(m model, code rune) (model, tea.Cmd) {
	key := tea.KeyPressMsg{Code: code}
	if code >= 32 && code <= 0x10FFFF {
		key.Text = string(code)
	}
	updated, cmd := m.Update(key)
	return updated.(model), cmd
}

// deliver executes only Bubbles list commands; it never executes config or process commands.
func deliver(m model, cmd tea.Cmd) model {
	if cmd == nil {
		return m
	}
	msg := cmd()
	if batch, ok := msg.(tea.BatchMsg); ok {
		for _, child := range batch {
			m = deliver(m, child)
		}
		return m
	}
	if _, ok := msg.(list.FilterMatchesMsg); ok {
		updated, _ := m.Update(msg)
		return updated.(model)
	}
	return m
}

func TestDesignSwitchesAndInputsChangeReturnedModel(t *testing.T) {
	m := loadedModel(t)
	m, _ = press(m, 'v')
	if m.layout != "focus" {
		t.Fatal("layout toggle was lost")
	}
	m, _ = press(m, 'd')
	if m.density != "compact" {
		t.Fatal("density toggle was lost")
	}
	m, _ = press(m, '/')
	if m.mode != "search" || !m.input.Focused() {
		t.Fatal("search input did not open")
	}
	m, _ = press(m, tea.KeyEscape)
	m, _ = press(m, ':')
	if m.mode != "command" {
		t.Fatal("command input did not open")
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

func TestClearRequiresConfirmationAndCarriesDisplayedRevision(t *testing.T) {
	m := loadedModel(t)
	m, cmd := press(m, 'x')
	if cmd != nil || m.mode != "confirm-clear" {
		t.Fatal("clear should only open confirmation")
	}
	if m.confirmation.Revision != m.data.Revision || m.confirmation.Position != 37 {
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

func TestFailedReloadKeepsLastValidSnapshotAndFullError(t *testing.T) {
	m := loadedModel(t)
	previous := m.data
	updated, _ := m.Update(bridgeMsg{err: errors.New("bad include: config/example.h:12")})
	m = updated.(model)
	if m.data != previous || m.mode != "output" || !strings.Contains(m.output, "example.h:12") {
		t.Fatal("reload error discarded the usable map or diagnostic")
	}
}

func TestPaletteAndLibraryReceiveAsynchronousFilterResults(t *testing.T) {
	for _, screen := range []string{"picker", "library"} {
		t.Run(screen, func(t *testing.T) {
			m := loadedModel(t)
			if screen == "picker" {
				m.openPalette()
			} else {
				m.screen = "library"
			}
			var cmd tea.Cmd
			m, cmd = press(m, '/')
			m = deliver(m, cmd)
			term := "flash"
			if screen == "library" {
				term = "copy"
			}
			for _, r := range term {
				m, cmd = press(m, r)
				m = deliver(m, cmd)
			}
			menu := m.picker
			if screen == "library" {
				menu = m.library
			}
			if len(menu.VisibleItems()) == 0 || len(menu.VisibleItems()) == len(menu.Items()) {
				t.Fatal("filter did not change the list")
			}
			item := menu.SelectedItem().(menuItem)
			if !strings.Contains(strings.ToLower(item.FilterValue()), term) {
				t.Fatalf("unexpected selection: %s", item.title)
			}
		})
	}
}

func TestFramesFitTerminalAndRenderEveryPhysicalRow(t *testing.T) {
	for _, size := range [][2]int{{150, 46}, {100, 46}, {80, 24}, {40, 22}, {110, 36}} {
		for _, layout := range []string{"studio", "focus"} {
			for _, density := range []string{"tiles", "compact"} {
				m := loadedModel(t)
				m.width, m.height, m.layout, m.density = size[0], size[1], layout, density
				m.resize()
				frame := m.render()
				if lipgloss.Width(frame) != m.width || lipgloss.Height(frame) != m.height {
					t.Fatalf("%v %s %s frame size %dx%d", size, layout, density, lipgloss.Width(frame), lipgloss.Height(frame))
				}
				grid := m.keyboardGrid(m.width - 4)
				if lipgloss.Height(grid) != len(m.data.Grid)*m.keyRows() {
					t.Fatalf("key cell wrapping broke geometry at %v", size)
				}
				if !strings.Contains(ansi.Strip(frame), "GLOVE") {
					t.Fatal("missing frame content")
				}
			}
		}
	}
}

func TestBridgeCommandsUseSnapshotRevision(t *testing.T) {
	m := loadedModel(t)
	result, err := callBridge(m.root, request{Action: "command", Command: "find Cmd+C", Layer: 0, Side: "both", Revision: m.data.Revision})
	if err != nil || result.Result == nil || result.Result.Kind != "output" || result.Result.Error || !strings.Contains(result.Result.Text, "LG(C)") {
		t.Fatalf("valid search failed: %+v %v", result, err)
	}
	_, err = callBridge(m.root, request{Action: "command", Command: "layer 1", Layer: 0, Side: "both", Revision: strings.Repeat("0", 64)})
	if err == nil || !strings.Contains(err.Error(), "Reload before running") {
		t.Fatalf("stale command was not rejected: %v", err)
	}
}

func TestFlashSelectionRequiresConfirmation(t *testing.T) {
	m := loadedModel(t)
	m, cmd := press(m, 'f')
	if cmd != nil || m.pickerKind != "flash" {
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
	updated := *m.data
	updated.Layers = updated.Layers[:1]
	m.layer = 17
	m.setSnapshot(&updated)
	if m.layer != 0 || m.mode != "" || m.library.FilterState() != list.Unfiltered {
		t.Fatal("reload retained stale layer indexes or definition filter")
	}
	if len(m.library.VisibleItems()) != len(updated.Entities) {
		t.Fatal("reload lost definitions")
	}
}
