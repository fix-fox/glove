package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"
	"github.com/fix-fox/glove/internal/keymap"
)

// editableModel copies the real config so integration tests never edit the checkout.
func editableModel(t *testing.T, position int) model {
	t.Helper()
	m := loadedModel(t)
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, "config"), 0755); err != nil {
		t.Fatal(err)
	}
	for source, contents := range m.document.Sources {
		if err := os.WriteFile(filepath.Join(root, "config", filepath.Base(source)), []byte(contents), 0640); err != nil {
			t.Fatal(err)
		}
	}
	doc, err := keymap.Load(filepath.Join(root, "config", "glove80.keymap"))
	if err != nil {
		t.Fatal(err)
	}
	m.root, m.selected = root, position
	m.setDocument(doc)
	return m
}

func editField(m model, field int) model {
	m.keyEditor.field = field
	m, _ = press(m, tea.KeyEnter)
	return m
}

func chooseKeyAction(t *testing.T, m model, query string) model {
	t.Helper()
	m = typeText(m, query)
	if len(m.picker.Items()) == 0 {
		t.Fatalf("no action matches %q", query)
	}
	m, _ = press(m, tea.KeyEnter)
	if m.keyEditor.page != "form" {
		t.Fatalf("choosing %q did not return to form", query)
	}
	return m
}

func TestKeyEditSpaceExampleWritesOnlySelectedTapAndRefreshesView(t *testing.T) {
	m := editableModel(t, 74)
	before, _ := os.ReadFile(m.document.Path)
	m, _ = press(m, 'e')
	if m.mode != "key-edit" || m.keyEditor.readOnly != "" || m.keyEditor.draft.Tap.Code != "SPACE" || m.keyEditor.draft.Hold.Layer != 5 {
		t.Fatalf("space key not editable: %+v", m.keyEditor)
	}
	m, _ = press(m, tea.KeyEnter)
	m = chooseKeyAction(t, m, "enter")
	if m.keyEditor.draft.Tap.Code != "RET" || m.keyEditor.draft.Hold.Layer != 5 {
		t.Fatalf("choosing Enter lost the Symbols hold: %+v", m.keyEditor.draft)
	}
	contents, _ := os.ReadFile(m.document.Path)
	if string(contents) != string(before) {
		t.Fatal("choosing an action wrote before Save")
	}
	for range 3 {
		m, _ = press(m, tea.KeyTab)
	}
	m, cmd := press(m, tea.KeyEnter)
	if !m.busy {
		t.Fatal("Save did not start a write")
	}
	stillSaving, _ := press(m, tea.KeyEscape)
	if stillSaving.mode != "key-edit" || !stillSaving.busy {
		t.Fatal("Escape closed a pending save")
	}
	m = finishNameSave(t, m, cmd)
	contents, _ = os.ReadFile(m.document.Path)
	want := strings.Replace(string(before), "&lt LAYER_SYMBOLS SPACE", "&lt LAYER_SYMBOLS RET", 1)
	if m.mode != "" || m.busy || string(contents) != want || m.selected != 74 || m.selectedBinding().Tap != "Enter" || !strings.Contains(m.status, "build and flash") {
		t.Fatalf("save did not refresh/preserve context: %s, %s", m.status, m.selectedBinding().Detail)
	}
}

func TestKeyEditShortcutHoldNameAndStandaloneActions(t *testing.T) {
	m := namingModel(t)
	m, _ = press(m, 'e')
	m = editField(m, 3)
	if !strings.Contains(ansi.Strip(m.picker.View()), "[x] Left Cmd") {
		t.Fatal("existing Cmd shortcut was not checked")
	}
	m, _ = press(m, tea.KeyDown)
	m, _ = press(m, ' ')
	m, _ = press(m, tea.KeyEscape)
	if m.keyEditor.draft.Tap.Code != "LG(LS(C))" {
		t.Fatalf("modifier toggle lost shortcut: %s", m.keyEditor.draft.Tap.Code)
	}
	m = editField(m, 2)
	m = chooseKeyAction(t, m, "left shift")
	if m.keyEditor.draft.Hold == nil || m.keyEditor.draft.Hold.Code != "LSHIFT" {
		t.Fatal("hold modifier was not selected")
	}
	m = editField(m, 0)
	updated, _ := m.Update(tea.PasteMsg{Content: "Copy special"})
	m = updated.(model)
	m, _ = press(m, tea.KeyEnter)
	m.keyEditor.field = 4
	m, cmd := press(m, tea.KeyEnter)
	m = finishNameSave(t, m, cmd)
	contents, _ := os.ReadFile(m.document.Path)
	if !strings.Contains(string(contents), "/* @name Copy special */ &mt LSHIFT LG(LS(C))") {
		t.Fatalf("name, hold, and shortcut not saved together: %s", contents)
	}
	m, _ = press(m, 'e')
	m = editField(m, 1)
	m = chooseKeyAction(t, m, "do nothing")
	if m.keyEditor.draft.Tap.Kind != keymap.KeyDisabled || m.keyEditor.draft.Hold != nil {
		t.Fatal("whole-key action retained a hidden hold")
	}
	m, _ = press(m, tea.KeyEscape)
	after, _ := os.ReadFile(m.document.Path)
	if m.mode != "" || string(after) != string(contents) {
		t.Fatal("cancel changed config")
	}
	m, _ = press(m, 'e')
	m = editField(m, 2)
	m = chooseKeyAction(t, m, "normal key behavior")
	if m.keyEditor.draft.Hold != nil {
		t.Fatal("normal key behavior retained the hold")
	}
}

func TestKeyEditPaletteCancelSearchAndFailedSaveKeepDraft(t *testing.T) {
	m := namingModel(t)
	m.openPalette()
	m = typeText(m, "edit selected key")
	m, _ = press(m, tea.KeyEnter)
	if m.mode != "key-edit" {
		t.Fatal("palette did not open editor")
	}
	m = editField(m, 1)
	m = typeText(m, "no-such-action-123")
	if len(m.picker.Items()) != 0 {
		t.Fatal("invalid query matched actions")
	}
	m, _ = press(m, tea.KeyEnter)
	if m.keyEditor.page != "tap" {
		t.Fatal("empty list changed draft")
	}
	m, _ = press(m, tea.KeyEscape)
	if m.keyEditor.page != "form" || m.keyEditor.draft.Tap.Code != "LG(C)" {
		t.Fatal("Escape lost the draft")
	}
	m = editField(m, 0)
	m = typeText(m, "Copy")
	m, _ = press(m, tea.KeyEnter)
	before, _ := os.ReadFile(m.document.Path)
	external := string(before) + "// edited elsewhere\n"
	if err := os.WriteFile(m.document.Path, []byte(external), 0640); err != nil {
		t.Fatal(err)
	}
	m.keyEditor.field = 4
	m, cmd := press(m, tea.KeyEnter)
	m = finishNameSave(t, m, cmd)
	after, _ := os.ReadFile(m.document.Path)
	if m.mode != "key-edit" || m.busy || m.keyEditor.draft.Name != "Copy" || !strings.Contains(m.output, "reload") || string(after) != external {
		t.Fatal("failed save lost draft or overwrote config")
	}
}

func TestKeyEditRealHomeRowPreservesBehaviorAndComplexKeysAreReadOnly(t *testing.T) {
	for _, position := range []int{35, 43} {
		m := editableModel(t, position)
		before, _ := os.ReadFile(m.document.Path)
		original := m.document.Config.Layers[0].Keys[position].Tap
		m, _ = press(m, 'e')
		if m.keyEditor.readOnly != "" || m.keyEditor.draft.Hold == nil {
			t.Fatalf("home row key %d not editable: %+v", position, m.keyEditor)
		}
		m = editField(m, 1)
		m = chooseKeyAction(t, m, "enter")
		m = editField(m, 2)
		m = chooseKeyAction(t, m, "right cmd")
		m.keyEditor.field = 4
		m, cmd := press(m, tea.KeyEnter)
		m = finishNameSave(t, m, cmd)
		after, _ := os.ReadFile(m.document.Path)
		if string(after) != strings.Replace(string(before), "&"+original.Name+" "+original.Param1+" "+original.Param2, "&"+original.Name+" RGUI RET", 1) {
			t.Fatal("home row behavior was replaced instead of preserved")
		}
	}
	for _, position := range []int{54, 69, 72, 73, 75} {
		m := editableModel(t, position)
		m, _ = press(m, 'e')
		if m.keyEditor.readOnly == "" || !strings.Contains(ansi.Strip(m.render()), "read only") {
			t.Fatalf("complex key %d should require Neovim", position)
		}
		m, cmd := press(m, 'E')
		if cmd == nil || m.mode != "" {
			t.Fatal("Shift+E did not open Neovim from read-only editor")
		}
	}
}

func TestKeyEditFramesAndMouseActionsFitSupportedSizes(t *testing.T) {
	for _, size := range [][2]int{{150, 46}, {100, 30}, {80, 24}, {40, 22}} {
		m := namingModel(t)
		m.width, m.height = size[0], size[1]
		m, _ = press(m, 'e')
		for _, field := range []int{-1, 0, 1, 2, 3} {
			if field >= 0 {
				m = editField(m, field)
			}
			frame := ansi.Strip(m.render())
			if lipgloss.Width(frame) != size[0] || lipgloss.Height(frame) != size[1] {
				t.Fatalf("editor page %s does not fit %v:\n%s", m.keyEditor.page, size, frame)
			}
			if field == -1 && (!strings.Contains(frame, "[ Save ]") || !strings.Contains(frame, "[ Cancel ]") || !strings.Contains(frame, "On hold")) {
				t.Fatalf("form controls missing at %v:\n%s", size, frame)
			}
			if field >= 0 {
				m, _ = press(m, tea.KeyEscape)
			}
		}
		m, _ = clickAt(m, 8, 9)
		if m.keyEditor.page != "tap" {
			t.Fatal("tap field was not clickable")
		}
		m = typeText(m, "enter")
		m, _ = clickAt(m, 5, 12)
		if m.keyEditor.page != "form" || m.keyEditor.draft.Tap.Code != "LG(RET)" {
			t.Fatal("click did not select the action while preserving shortcut modifiers")
		}
		m, _ = clickAt(m, 5, 11)
		m, _ = clickAt(m, 5, 8)
		if m.keyEditor.draft.Tap.Code != "RET" {
			t.Fatal("modifier checkbox was not clickable")
		}
		m, _ = press(m, tea.KeyEscape)
		m, cmd := clickAt(m, 5, 13)
		m = finishNameSave(t, m, cmd)
		if m.selectedBinding().Tap != "Enter" {
			t.Fatal("Save button did not save the draft")
		}
	}
}
