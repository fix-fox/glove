package keymapview

import (
	"fmt"
	"reflect"
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"
	"github.com/fix-fox/glove/internal/keymap"
)

func TestDispatchCommandsAndErrors(t *testing.T) {
	config := fixture()
	for _, tc := range []struct {
		command, kind, contains string
		isError                 bool
	}{
		{"quit", "quit", "", false}, {"exit", "quit", "", false}, {"  ", "output", "", false},
		{"lyer default", "output", "Did you mean `layer`?", true}, {"layer", "output", "layer <name|index>", true}, {"key", "output", "key <pos>", true}, {"key symbols RM4", "output", "key <pos>", true},
		{"layer nope", "output", "Unknown layer", true}, {"key nope", "output", "Unknown key position", true},
		{"layers", "output", "default", false}, {"layer default", "show-layer", "Layer 0: default", false}, {"key RM4", "output", "kp LG(C)", false}, {"macro copy_url", "output", "1. tap", false}, {"combo esc_combo", "output", "keys: 22", false},
		{"macro nope", "output", "copy_url", true}, {"combo nope", "output", "esc_combo", true}, {"macro", "output", "macro <name>", true}, {"combo", "output", "combo <name>", true},
		{"find Cmd+C", "output", "layer default · position 43 · tap → LG(C)", false}, {"find foo+c", "output", "No bindings found", false}, {"find F24", "output", "No bindings found", false}, {"find", "output", "find <query>", true},
		{"flash --bogus", "output", "--local|--remote", true}, {"flash --local --remote", "output", "Choose --local or --remote", true},
		{"help", "output", "find <query>", false}, {"help find", "output", "reverse lookup", false}, {"help key", "output", "displayed layer", false}, {"help edit", "output", "$EDITOR", false}, {"help reload", "output", "last valid keymap", false}, {"help flash", "output", "validate, build, and flash", false},
		{"find copy", "output", "copy ≈ ⌘C", false}, {"find copy_u", "output", `macro "copy_url"`, false}, {"find backspace", "output", "keycode BSPC", false}, {"find frobnicate", "output", "No bindings found", false},
		{"RM4", "output", "kp LG(C)", false}, {"43", "output", "kp LG(C)", false}, {"rm4", "output", "kp LG(C)", false},
		{"up", "output", "Unknown command", true}, {"..", "output", "Unknown command", true}, {"esc", "output", "Unknown command", true},
		{"left foo", "output", "left half", true}, {"right foo", "output", "right half", true}, {"both foo", "output", "full board", true},
		{"rm nope", "output", "Unknown key position", true}, {"rm", "output", "rm <pos>", true},
		{"reload", "reload", "", false}, {"EDIT", "edit", "", false}, {"edit other.keymap", "output", "open the keymap", true}, {"reload other.keymap", "output", "reread the native config", true},
	} {
		t.Run(tc.command, func(t *testing.T) {
			result := Dispatch(config, tc.command, 0, "both")
			if result.Kind != tc.kind || result.Error != tc.isError || !strings.Contains(result.Text, tc.contains) {
				t.Fatalf("got %+v, want kind=%s error=%v text containing %q", result, tc.kind, tc.isError, tc.contains)
			}
		})
	}
	if result := Dispatch(config, "flash --remote --full", 0, "both"); result.Kind != "flash" || !reflect.DeepEqual(result.Args, []string{"--remote", "--full"}) {
		t.Fatal(result)
	}
	for _, command := range []string{"flash", "flash --local", "flash --full"} {
		if result := Dispatch(config, command, 0, "both"); result.Kind != "flash" || result.Error {
			t.Fatal(result)
		}
	}
	config.Macros = nil
	config.Combos = nil
	for _, command := range []string{"macro nope", "combo nope"} {
		if result := Dispatch(config, command, 0, "both"); !result.Error || !strings.Contains(result.Text, "No ") {
			t.Fatal(result)
		}
	}
}

func TestDispatchKeepsDisplayContextAndReturnsEditIntents(t *testing.T) {
	config := fixture()
	for _, command := range []string{"key RM4", "RM4"} {
		if result := Dispatch(config, command, 1, "both"); !strings.Contains(result.Text, `layer 1 "symbols"`) {
			t.Fatal(result)
		}
	}
	for _, tc := range []struct {
		command, side string
		index         int
	}{{"layer symbols", "right", 1}, {"left", "left", 0}, {"right", "right", 0}, {"both", "both", 0}} {
		result := Dispatch(config, tc.command, 0, "right")
		if result.Kind != "show-layer" || result.Index != tc.index || result.Side != tc.side {
			t.Fatal(result)
		}
		if (tc.side == "both") == strings.Contains(result.Text, "half") {
			t.Fatal(result.Text)
		}
	}
	if result := Dispatch(config, "left", 1, "both"); result.Index != 1 {
		t.Fatal(result)
	}
	before := config.Layers[0].Keys[43]
	clear := Dispatch(config, "rm RM4", 0, "both")
	if clear.Kind != "clear-key" || clear.LayerIndex != 0 || clear.Position != 43 || !strings.Contains(clear.Text, "LG(C)") || !reflect.DeepEqual(config.Layers[0].Keys[43], before) {
		t.Fatal(clear)
	}
	clear = Dispatch(config, "rm 0", 1, "both")
	if clear.Kind != "clear-key" || clear.LayerIndex != 1 || clear.Position != 0 || config.Layers[1].Keys[0].Tap.Type != "none" {
		t.Fatal(clear)
	}
	config.Layers[0].Keys[43] = keymap.Key{Tap: keymap.Behavior{Type: "none"}}
	clear = Dispatch(config, "rm RM4", 0, "both")
	if clear.Kind != "clear-key" || !strings.Contains(clear.Text, "already clear") {
		t.Fatal(clear)
	}
	if result := Dispatch(config, "rm RM4", 99, "both"); !result.Error || !strings.Contains(result.Text, "out of range") {
		t.Fatal(result)
	}
}

func TestDefinitionListsAndDetails(t *testing.T) {
	config := fixture()
	for _, tc := range []struct {
		command string
		parts   []string
	}{
		{"layers", []string{" 0: default (4 keys bound)", "symbols", "system"}},
		{"macros", []string{"copy_url", "2 steps", "CopyURL"}}, {"combos", []string{"esc_combo", "22+23", "&kp ESC"}}, {"holdtaps", []string{"hml_lgui", "balanced", "280ms", "hold &kp", "tap &kp"}}, {"morphs", []string{"mm_bspc_shift_del", "&kp BSPC", "MOD_LSFT", "&kp DEL"}}, {"condlayers", []string{"tri_layer", "symbols + system", "system"}},
		{"key 10", []string{"Position 10", "kp F5", "hold: mo 1", "symbols"}}, {"key 34", []string{"hold-tap hml_lgui(LGUI, A)", "hold: &kp LGUI", "tap:  &kp A", "280ms"}}, {"key 43", []string{"hold: (none)"}},
		{"macro copy_url", []string{"1. tap &kp LG(L)", "2. tap &kp LG(C)"}}, {"combo esc_combo", []string{"22 + 23", "binding: &kp ESC", "layers: all"}},
	} {
		result := Dispatch(config, tc.command, 0, "both")
		for _, part := range tc.parts {
			if !strings.Contains(result.Text, part) {
				t.Errorf("%s lacks %q: %s", tc.command, part, result.Text)
			}
		}
	}
	empty := keymap.Keymap{Layers: config.Layers}
	for _, command := range []string{"macros", "combos", "holdtaps", "morphs", "condlayers", "tapdances"} {
		result := Dispatch(empty, command, 0, "both")
		if !strings.HasPrefix(result.Text, "No ") || !strings.HasSuffix(result.Text, " defined.") {
			t.Fatal(result)
		}
	}
	config.Layers[0].Name = "hebrew"
	config.Layers[0].Keys[0].Tap = keymap.Behavior{Type: "kp", KeyCode: "A"}
	if text := KeyDetail(config, 0, 0); !strings.Contains(text, "ש") {
		t.Fatal(text)
	}
	wait, tap, timeout := 0, 30, 40
	config.Macros[0].WaitMs = &wait
	config.Macros[0].TapMs = &tap
	if text := MacroDetail(config.Macros[0], "  "); !strings.Contains(text, "wait: 0ms, tap: 30ms") || !strings.HasPrefix(text, "  macro") {
		t.Fatal(text)
	}
	config.Combos[0].Layers = []int{1}
	config.Combos[0].TimeoutMs = &timeout
	if text := ComboDetail(config, config.Combos[0]); !strings.Contains(text, "layers: symbols") || !strings.Contains(text, "timeout: 40ms") {
		t.Fatal(text)
	}
}

func TestPlainLayerOutputPreservesAllBindingsAndSelectedHalf(t *testing.T) {
	config := fixture()
	config.Layers[0].Keys[11].Tap = keymap.Behavior{Type: "macro", MacroName: "a_very_long_untruncated_macro_name"}
	for side, count := range map[string]int{"both": 80, "left": 40, "right": 40} {
		text := RenderLayer(config, 0, side)
		seen := 0
		for pos, name := range KeyNames {
			found := strings.Contains("\n"+text, fmt.Sprintf("\n%2d  ", pos))
			want := side == "both" || strings.HasPrefix(name, strings.ToUpper(side[:1]))
			if found != want {
				t.Errorf("%s: key %d %s found=%v", side, pos, name, found)
			}
			if found {
				seen++
			}
		}
		if seen != count {
			t.Errorf("%s: %d keys", side, seen)
		}
		if side != "right" {
			for _, label := range []string{"·", "F5", "hold: ◇ SYM", "hold: ⌘", "a_very_long_untruncated_macro_name"} {
				if !strings.Contains(text, label) {
					t.Errorf("%s missing %s", side, label)
				}
			}
		}
	}
	config.Layers[0].Name = "Hebrew"
	if text := RenderLayer(config, 0, "both"); !strings.Contains(text, "ש") {
		t.Fatal("Hebrew labels missing")
	}
}

func TestSearchAlignmentUsesTerminalColumns(t *testing.T) {
	config := fixture()
	config.Layers[0].Name = "שכבה"
	text := Dispatch(config, "find Cmd+C", 0, "both").Text
	arrow := -1
	for _, line := range strings.Split(text, "\n") {
		index := strings.Index(line, " → ")
		if index < 0 {
			continue
		}
		width := ansi.StringWidth(line[:index])
		if arrow < 0 {
			arrow = width
		} else if arrow != width {
			t.Fatalf("unaligned search: %s", text)
		}
	}
}
