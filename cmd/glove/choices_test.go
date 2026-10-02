package main

import (
	"fmt"
	"strconv"
	"strings"
	"testing"

	"charm.land/bubbles/v2/list"
	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"
	"github.com/fix-fox/glove/internal/keymap"
)

func typeText(m model, text string) model {
	for _, r := range text {
		m, _ = press(m, r)
	}
	return m
}

func TestLayerPickerFiltersImmediatelyAndOneEnterNavigates(t *testing.T) {
	m := loadedModel(t)
	m, _ = press(m, 'l')
	if m.mode != "picker" || m.pickerKind != "layer" || !m.input.Focused() {
		t.Fatal("l did not open a focused layer picker")
	}
	m = typeText(m, "cursor")
	if len(m.picker.Items()) != 1 || m.picker.SelectedItem().(menuItem).title != "cursor" {
		t.Fatal("typing did not synchronously filter layers")
	}
	m, _ = press(m, tea.KeyEnter)
	if m.mode != "" || m.screen != "keyboard" || m.data.Layers[m.layer].Name != "cursor" {
		t.Fatal("one Enter did not navigate to the layer")
	}
	m, _ = press(m, 'l')
	m = typeText(m, "no such layer")
	m, _ = press(m, tea.KeyEnter)
	if m.mode != "picker" || len(m.picker.Items()) != 0 {
		t.Fatal("empty results activated a stale item")
	}
	m, _ = press(m, tea.KeyEscape)
	if m.mode != "" {
		t.Fatal("Escape should close the picker in one press")
	}
}

func TestPaletteExecutesFilteredChoiceWithOneEnterAndKeepsConfirmation(t *testing.T) {
	m := loadedModel(t)
	updated, _ := m.Update(tea.KeyPressMsg{Code: 'p', Mod: tea.ModCtrl})
	m = updated.(model)
	if m.mode != "picker" || m.pickerKind != "action" || !m.input.Focused() {
		t.Fatal("palette did not focus filtering")
	}
	m = typeText(m, "clear")
	if m.picker.SelectedItem().(menuItem).action != "clear" || len(m.picker.Items()) >= len(m.pickerItems) {
		t.Fatal("palette did not filter")
	}
	m, cmd := press(m, tea.KeyEnter)
	if m.mode != "confirm-clear" || cmd != nil {
		t.Fatal("palette must open confirmation without writing")
	}
	m, _ = press(m, tea.KeyEscape)
	m.openPalette()
	m = typeText(m, "reload")
	m, cmd = press(m, tea.KeyEnter)
	if !m.busy || m.mode != "" || cmd == nil || m.status != "Validating config…" {
		t.Fatal("one Enter did not execute reload")
	}
}

func TestLiveSearchHandlesSingleCharactersEditsPasteAndExactNavigation(t *testing.T) {
	m := loadedModel(t)
	m.side = "right"
	m, _ = press(m, '/')
	m = typeText(m, "c")
	if len(m.picker.Items()) == 0 || m.busy {
		t.Fatal("single character search did not produce live results")
	}
	m, _ = press(m, tea.KeyBackspace)
	if len(m.picker.Items()) != 0 {
		t.Fatal("clearing the query retained stale results")
	}
	updated, _ := m.Update(tea.PasteMsg{Content: "Cmd+C"})
	m = updated.(model)
	if len(m.picker.Items()) == 0 {
		t.Fatal("pasted input did not refresh results")
	}
	target := m.picker.SelectedItem().(searchItem).Target
	if target.Kind != "key" {
		t.Fatal("expected a binding result")
	}
	m, _ = press(m, tea.KeyEnter)
	if m.mode != "" || m.screen != "keyboard" || m.layer != target.LayerIndex || m.selected != target.Position || m.side != "left" {
		t.Fatal("Enter did not navigate to the exact key on the other half")
	}
	m, _ = press(m, '/')
	m = typeText(m, "nothing matches this")
	previous := m.selected
	m, _ = press(m, tea.KeyEnter)
	if m.selected != previous || m.mode != "search" {
		t.Fatal("empty search should not navigate")
	}
}

func TestLiveSearchNavigatesToDefinitions(t *testing.T) {
	m := loadedModel(t)
	m, _ = press(m, '/')
	m = typeText(m, "dictation")
	index := -1
	for i, item := range m.picker.Items() {
		if target := item.(searchItem).Target; target.Kind == "definition" && target.EntityKind == "macro" && target.EntityName == "dictation" {
			index = i
			break
		}
	}
	if index < 0 {
		t.Fatal("definition missing from live results")
	}
	m.picker.Select(index)
	m, _ = press(m, tea.KeyEnter)
	if m.mode != "" || m.screen != "library" || m.library.SelectedItem().(menuItem).title != "dictation" {
		t.Fatal("definition result did not navigate")
	}
}

func TestPositionOverlayReplacesSecondaryLabelsAndRestoresOnCancel(t *testing.T) {
	m := loadedModel(t)
	m, _ = press(m, 'g')
	if m.mode != "jump" || m.screen != "keyboard" || !m.input.Focused() {
		t.Fatal("g did not enter position mode")
	}
	for position, key := range m.data.Layers[m.layer].Keys {
		lines := strings.Split(ansi.Strip(m.keyCell(key, 10)), "\n")
		if strings.Trim(lines[2], " │") != strconv.Itoa(position) {
			t.Fatalf("key %d did not show its position on the second line: %q", position, lines[2])
		}
	}
	previous := m.selected
	m = typeText(m, "57")
	m, _ = press(m, tea.KeyEscape)
	if m.mode != "" || m.selected != previous {
		t.Fatal("canceling position mode moved the selection")
	}
	key := m.selectedBinding()
	if !strings.Contains(ansi.Strip(m.keyCell(key, 10)), key.Hold) {
		t.Fatal("canceling position mode lost the hold label")
	}
	m.side = "left"
	m, _ = press(m, 'g')
	m = typeText(m, "57")
	m, _ = press(m, tea.KeyEnter)
	if m.mode != "" || m.selected != 57 || m.side != "right" {
		t.Fatal("numeric jump did not select the key on the other half")
	}
	m, _ = press(m, 'g')
	m = typeText(m, "80")
	m, _ = press(m, tea.KeyEnter)
	if m.mode != "jump" || m.selected != 57 || !strings.Contains(m.status, "0–79") {
		t.Fatal("out-of-range position was accepted")
	}
	m, _ = press(m, tea.KeyEscape)
	m, _ = press(m, '/')
	m = typeText(m, "screenshot")
	if m.input.Value() != "screenshot" {
		t.Fatal("numeric input constraints leaked into search")
	}
}

func TestSelectionNeverAddsPositionsOrChangesSemanticLabelColors(t *testing.T) {
	m := loadedModel(t)
	for _, kind := range []struct{ name, color string }{{"key", "38;2;231;233;240"}, {"modifier", "38;2;197;176;255"}, {"layer", "38;2;150;199;242"}, {"macro", "38;2;237;172;199"}} {
		for _, selected := range []int{25, 26} {
			m.selected = selected
			key := binding{Position: 25, Name: "25", Tap: "Label", Hold: "Hold", TapKind: kind.name, HoldKind: kind.name}
			lines := strings.Split(m.keyCell(key, 12), "\n")
			for _, line := range lines[1:3] {
				if !strings.Contains(line, kind.color) {
					t.Fatalf("%s label lost its color with selection %d: %q", kind.name, selected, line)
				}
			}
			key.Hold = ""
			if lines := strings.Split(ansi.Strip(m.keyCell(key, 12)), "\n"); strings.Trim(lines[2], " │") != "" {
				t.Fatal("selection added a key position to the keycap")
			}
		}
	}
}

func TestArrowNavigationDoesNotUseLetterKeys(t *testing.T) {
	for _, screen := range []string{"keyboard", "library"} {
		m := loadedModel(t)
		m.screen = screen
		for _, letter := range "hjk" {
			beforeKey, beforeItem := m.selected, m.library.Index()
			m, _ = press(m, letter)
			if m.selected != beforeKey || m.library.Index() != beforeItem {
				t.Fatalf("%c still navigates %s", letter, screen)
			}
		}
		m, _ = press(m, 'l')
		if m.mode != "picker" || m.pickerKind != "layer" {
			t.Fatal("l should open layers instead of navigating")
		}
	}
}

func TestChoicePanelsKeepFinalItemVisibleAtEverySize(t *testing.T) {
	for _, size := range [][2]int{{150, 46}, {80, 24}, {40, 22}} {
		m := loadedModel(t)
		m.width, m.height = size[0], size[1]
		items := []list.Item{}
		for i := range 30 {
			items = append(items, menuItem{fmt.Sprintf("Choice %d", i), "Description", "side"})
		}
		items = append(items, menuItem{"FINAL CHOICE", "FINAL DETAIL", "side"})
		m.openPicker("action", "Commands", items)
		m.picker.Select(len(items) - 1)
		frame := ansi.Strip(m.render())
		if !strings.Contains(frame, "FINAL CHOICE") || !strings.Contains(frame, "FINAL DETAIL") {
			t.Fatalf("final choice clipped at %v:\n%s", size, frame)
		}
	}
}

func TestInvalidJumpDiagnosticIsVisibleAtEverySize(t *testing.T) {
	for _, size := range [][2]int{{150, 46}, {80, 24}, {40, 22}} {
		m := loadedModel(t)
		m.width, m.height = size[0], size[1]
		m, _ = press(m, 'g')
		m = typeText(m, "99")
		m, _ = press(m, tea.KeyEnter)
		if !strings.Contains(ansi.Strip(m.render()), "Position must be 0–79") {
			t.Fatalf("jump diagnostic clipped at %v", size)
		}
	}
}

func TestReloadPreservesDefinitionIdentityAndRepairsRemovedSelection(t *testing.T) {
	m := loadedModel(t)
	document := nativeFixture(t, "A", "base").document
	document.Config.Macros = []keymap.MacroDefinition{{Name: "alpha"}, {Name: "beta"}}
	m.setDocument(document)
	m.screen = "library"
	m.library.Select(1)
	next := *document
	next.Config.Macros = []keymap.MacroDefinition{{Name: "beta"}, {Name: "alpha"}}
	m.setDocument(&next)
	if m.library.Index() != 0 || m.library.SelectedItem().(menuItem).title != "beta" {
		t.Fatal("reload lost selected definition identity")
	}
	next.Config.Macros = []keymap.MacroDefinition{{Name: "alpha"}}
	m.setDocument(&next)
	if m.library.Index() != 0 || m.library.SelectedItem().(menuItem).title != "alpha" {
		t.Fatal("removed definition left an invalid selection")
	}
	next.Config.Macros = nil
	m.setDocument(&next)
	m.output = "stale detail"
	m, _ = press(m, tea.KeyEnter)
	if m.mode != "" {
		t.Fatal("empty library opened a stale detail")
	}
}
