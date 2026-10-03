package main

import (
	"os"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"
	"github.com/fix-fox/glove/internal/keymap"
)

func namingModel(t *testing.T) model {
	t.Helper()
	s := nativeFixture(t, "LG(C)", "base")
	m := newModel(s.root)
	m.selected, m.busy = 0, false
	m.setDocument(s.document)
	return m
}

// finishNameSave delivers the asynchronous write result without running spinner ticks.
func finishNameSave(t *testing.T, m model, cmd tea.Cmd) model {
	t.Helper()
	if cmd == nil {
		t.Fatal("no save command")
	}
	for _, child := range cmd().(tea.BatchMsg) {
		if msg, ok := child().(configMsg); ok {
			updated, _ := m.Update(msg)
			return updated.(model)
		}
	}
	t.Fatal("no name-save result")
	return m
}

func TestKeyNameInputSavesReloadsSearchesAndRemovesName(t *testing.T) {
	m := namingModel(t)
	m, _ = press(m, 'n')
	if m.mode != "name" || !m.input.Focused() || m.naming.document != m.document {
		t.Fatal("n did not focus a name input tied to the displayed document")
	}
	m = typeText(m, "Quick copy")
	m, cmd := press(m, tea.KeyEnter)
	m = finishNameSave(t, m, cmd)
	if m.mode != "" || m.busy || m.selectedBinding().Name != "Quick copy" || m.selectedBinding().Tap != "⌘C" {
		t.Fatalf("name save changed behavior or failed: %+v", m.selectedBinding())
	}
	doc, err := keymap.Load(m.document.Path)
	if err != nil || doc.Config.Layers[0].Keys[0].Name != "Quick copy" {
		t.Fatalf("name was not persisted: %v", err)
	}
	m, _ = press(m, '/')
	m = typeText(m, "quick")
	if len(m.picker.Items()) != 1 || m.picker.SelectedItem().(searchItem).Target.Position != 0 {
		t.Fatal("saved name not searchable")
	}
	m, _ = press(m, tea.KeyEnter)
	m, _ = press(m, 'n')
	if m.input.Value() != "Quick copy" {
		t.Fatal("reopening name did not preload saved name")
	}
	m.input.SetValue("")
	m, cmd = press(m, tea.KeyEnter)
	m = finishNameSave(t, m, cmd)
	contents, _ := os.ReadFile(m.document.Path)
	if m.selectedBinding().Name != "" || strings.Contains(string(contents), "@name") || !strings.Contains(string(contents), "&kp LG(C)") {
		t.Fatal("empty name did not remove only the annotation")
	}
}

func TestNameCancelPalettePasteAndFailedSaveKeepConfigSafe(t *testing.T) {
	m := namingModel(t)
	original, _ := os.ReadFile(m.document.Path)
	m.openPalette()
	m = typeText(m, "name selected")
	m, _ = press(m, tea.KeyEnter)
	if m.mode != "name" {
		t.Fatal("palette did not open key naming")
	}
	updated, _ := m.Update(tea.PasteMsg{Content: "העתק"})
	m = updated.(model)
	if m.input.Value() != "העתק" {
		t.Fatal("Unicode paste lost")
	}
	m, _ = press(m, tea.KeyEscape)
	contents, _ := os.ReadFile(m.document.Path)
	if string(contents) != string(original) || m.mode != "" {
		t.Fatal("cancel wrote config")
	}
	m, _ = press(m, 'n')
	m = typeText(m, "bad */ name")
	m, cmd := press(m, tea.KeyEnter)
	m = finishNameSave(t, m, cmd)
	if m.mode != "name" || m.busy || m.input.Value() != "bad */ name" || m.output == "" {
		t.Fatal("failed save should keep the draft open with an error")
	}
	contents, _ = os.ReadFile(m.document.Path)
	if string(contents) != string(original) {
		t.Fatal("invalid name changed source")
	}
	m.input.SetValue("Copy")
	if err := os.WriteFile(m.document.Path, append(original, []byte("// external edit\n")...), 0640); err != nil {
		t.Fatal(err)
	}
	m, cmd = press(m, tea.KeyEnter)
	m = finishNameSave(t, m, cmd)
	if m.mode != "name" || !strings.Contains(strings.ToLower(m.output), "reload") || m.selectedBinding().Name != "" {
		t.Fatal("stale save did not preserve last good document")
	}
}

func TestNamesAppearOnKeycapAndInspectorWithUnderlyingBehaviorColors(t *testing.T) {
	m := namingModel(t)
	doc, err := keymap.RenameKey(m.document, 0, 0, "Copy")
	if err != nil {
		t.Fatal(err)
	}
	m.setDocument(doc)
	key := m.selectedBinding()
	cell := m.keyCell(key, 10)
	if !strings.Contains(ansi.Strip(cell), "Copy") || strings.Contains(ansi.Strip(cell), "⌘C") || !strings.Contains(cell, "38;2;197;176;255") {
		t.Fatalf("name missing or modifier color lost: %q", cell)
	}
	for _, vertical := range []bool{true, false} {
		panel := ansi.Strip(m.inspector(80, 35, vertical))
		for _, expected := range []string{"Copy", "pos 0", "⌘C"} {
			if !strings.Contains(panel, expected) {
				t.Fatalf("inspector lost %q: %s", expected, panel)
			}
		}
	}
	m, _ = press(m, 'g')
	lines := strings.Split(ansi.Strip(m.keyCell(key, 10)), "\n")
	if !strings.Contains(lines[1], "Copy") || strings.Trim(lines[2], " │") != "0" {
		t.Fatal("position overlay lost name or position")
	}
	m, _ = press(m, tea.KeyEscape)
	for _, size := range [][2]int{{150, 46}, {100, 30}, {80, 24}, {40, 22}} {
		m.width, m.height = size[0], size[1]
		m, _ = press(m, 'n')
		frame := ansi.Strip(m.render())
		if lipgloss.Width(frame) != size[0] || lipgloss.Height(frame) != size[1] || !strings.Contains(frame, "Enter saves") || !strings.Contains(frame, "Copy") {
			t.Fatalf("name entry does not fit %v:\n%s", size, frame)
		}
		m, _ = press(m, tea.KeyEscape)
	}
}
