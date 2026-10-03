package keymap_test

import (
	"reflect"
	"strings"
	"testing"

	"github.com/fix-fox/glove/internal/keymap"
	"github.com/fix-fox/glove/internal/keymapview"
)

func TestCursorNavigationAndDefaultEnterBindings(t *testing.T) {
	doc, err := keymap.Load("../../config/glove80.keymap")
	if err != nil {
		t.Fatal(err)
	}
	cursor, mouse := -1, -1
	for index, layer := range doc.Config.Layers {
		switch layer.Name {
		case "cursor":
			cursor = index
		case "mouse":
			mouse = index
		}
	}
	if cursor < 0 || mouse < 0 {
		t.Fatal("Cursor and Mouse layers must exist")
	}
	left, right := map[int]bool{}, map[int]bool{}
	for _, row := range keymapview.Geometry {
		for column, position := range row {
			if position < 0 {
				continue
			}
			isLeft := column < len(row)/2
			if isLeft != strings.HasPrefix(keymapview.KeyNames[position], "L") {
				t.Fatalf("position %d geometry disagrees with its name", position)
			}
			if isLeft {
				left[position] = true
			} else {
				right[position] = true
			}
		}
	}
	if len(left) != 40 || len(right) != 40 {
		t.Fatalf("expected 40 physical positions per half, got left=%d right=%d", len(left), len(right))
	}
	t.Run("left half has plain modifiers and Command shortcuts on Z X C D V", func(t *testing.T) {
		keycodes := map[int]string{35: "LCTRL", 36: "LALT", 37: "LGUI", 38: "LSHIFT", 47: "LG(Z)", 48: "LG(X)", 49: "LG(C)", 50: "LG(D)", 51: "LG(V)"}
		for position, letter := range map[int]string{35: "A", 36: "R", 37: "S", 38: "T"} {
			if !left[position] || doc.Config.Layers[0].Keys[position].Tap.Param2 != letter {
				t.Fatalf("position %d no longer matches the default %s home-row key", position, letter)
			}
		}
		for position := range left {
			want := keymap.Key{Tap: keymap.Behavior{Type: "trans"}}
			if code := keycodes[position]; code != "" {
				want.Tap = keymap.Behavior{Type: "kp", KeyCode: code}
			}
			if got := doc.Config.Layers[cursor].Keys[position]; !reflect.DeepEqual(got, want) {
				t.Errorf("Cursor %s (%d): got %+v, want %+v", keymapview.KeyNames[position], position, got, want)
			}
		}
	})
	t.Run("right half retains navigation and the user's cleared bindings", func(t *testing.T) {
		keycodes := map[int]string{29: "PG_UP", 30: "UP", 31: "PG_DN", 41: "LEFT", 42: "DOWN", 43: "RIGHT", 59: "LG(LEFT)", 61: "LG(RIGHT)", 74: "ENTER"}
		for position := range right {
			want := keymap.Key{Tap: keymap.Behavior{Type: "trans"}}
			if code := keycodes[position]; code != "" {
				want.Tap = keymap.Behavior{Type: "kp", KeyCode: code}
			}
			if got := doc.Config.Layers[cursor].Keys[position]; !reflect.DeepEqual(got, want) {
				t.Errorf("Cursor %s (%d): got %+v, want %+v", keymapview.KeyNames[position], position, got, want)
			}
		}
	})
	t.Run("default RH3 taps Enter and holds Mouse", func(t *testing.T) {
		want := keymap.Key{Tap: keymap.Behavior{Type: "kp", KeyCode: "ENTER"}, Hold: &keymap.Behavior{Type: "mo", LayerIndex: mouse}}
		if got := doc.Config.Layers[0].Keys[57]; keymapview.KeyNames[57] != "RH3" || !reflect.DeepEqual(got, want) {
			t.Fatalf("default key 57: got %+v, want %+v", got, want)
		}
		binding := doc.Bindings[0][57]
		if raw := doc.Sources[binding.File][binding.Start:binding.End]; raw != "&lt LAYER_MOUSE ENTER" {
			t.Fatalf("default key 57 should preserve the shared Mouse layer constant, got %s", raw)
		}
	})
}
