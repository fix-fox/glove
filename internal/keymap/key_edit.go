package keymap

import (
	"fmt"
	"regexp"
	"strings"
)

// KeyEdit contains the simple actions the key editor can safely change.
// A nil Hold keeps the normal press, release, and repeat behavior of Tap.
type KeyEdit struct {
	Name string
	Tap  KeyAction
	Hold *KeyAction
}

type KeyActionKind string

const (
	KeyPress       KeyActionKind = "key"
	LayerWhileHeld KeyActionKind = "layer-held"
	LayerToggle    KeyActionKind = "layer-toggle"
	LayerSwitch    KeyActionKind = "layer-switch"
	KeyDisabled    KeyActionKind = "disabled"
	KeyTransparent KeyActionKind = "transparent"
)

// KeyAction uses Code only for KeyPress and Layer only for layer actions.
type KeyAction struct {
	Kind  KeyActionKind
	Code  string
	Layer int
}

var literalBehavior = regexp.MustCompile(`^&\s*([A-Za-z_]\w*)`)
var editorModifier = regexp.MustCompile(`^(LC|RC|LA|RA|LS|RS|LG|RG)\((.+)\)$`)
var editorKeyCode = regexp.MustCompile(`^[A-Z][A-Z0-9_]*$`)

// IsModifierKey includes the ZMK aliases used by existing native keymaps.
func IsModifierKey(code string) bool {
	switch code {
	case "LSHIFT", "RSHIFT", "LSHFT", "RSHFT", "LEFT_SHIFT", "RIGHT_SHIFT",
		"LCTRL", "RCTRL", "LCTL", "RCTL", "LEFT_CTRL", "RIGHT_CTRL", "LEFT_CONTROL", "RIGHT_CONTROL",
		"LALT", "RALT", "LEFT_ALT", "RIGHT_ALT", "LGUI", "RGUI", "LEFT_GUI", "RIGHT_GUI":
		return true
	}
	return false
}

func simpleKeyCode(code string) bool {
	for {
		match := editorModifier.FindStringSubmatch(code)
		if match == nil {
			return editorKeyCode.MatchString(code)
		}
		code = match[2]
	}
}

func simpleAction(b Behavior) (KeyAction, bool) {
	switch b.Type {
	case "kp":
		return KeyAction{Kind: KeyPress, Code: b.KeyCode}, simpleKeyCode(b.KeyCode)
	case "mo":
		return KeyAction{Kind: LayerWhileHeld, Layer: b.LayerIndex}, true
	case "tog":
		return KeyAction{Kind: LayerToggle, Layer: b.LayerIndex}, true
	case "to":
		return KeyAction{Kind: LayerSwitch, Layer: b.LayerIndex}, true
	case "none":
		return KeyAction{Kind: KeyDisabled}, true
	case "trans":
		return KeyAction{Kind: KeyTransparent}, true
	}
	return KeyAction{}, false
}

func validHold(action KeyAction) bool {
	return action.Kind == LayerWhileHeld || action.Kind == KeyPress && IsModifierKey(action.Code)
}

// ReadKeyEdit refuses complex behaviors rather than discarding hidden actions.
func ReadKeyEdit(document *Document, layer, position int) (KeyEdit, error) {
	_, _, err := editableBinding(document, layer, position)
	if err != nil {
		return KeyEdit{}, err
	}
	original := document.Config.Layers[layer].Keys[position]
	edit := KeyEdit{Name: original.Name}
	ok := false
	if original.Tap.Type == "hold_tap" {
		b := original.Tap
		for _, def := range document.Config.HoldTaps {
			if def.Name != b.Name || def.TapBinding != "&kp" {
				continue
			}
			// These home-row wrappers also activate the layout's modifier layer.
			// Retain their behavior reference, trigger positions, and timing.
			homeRow := (def.Name == "hml" || def.Name == "hmr") && def.HoldBinding == "&mod_activate"
			if def.HoldBinding == "&kp" || homeRow {
				edit.Tap = KeyAction{Kind: KeyPress, Code: b.Param2}
				edit.Hold = &KeyAction{Kind: KeyPress, Code: b.Param1}
				ok = simpleKeyCode(b.Param2) && validHold(*edit.Hold)
			}
		}
	} else {
		edit.Tap, ok = simpleAction(original.Tap)
		if ok && original.Hold != nil {
			hold, supported := simpleAction(*original.Hold)
			edit.Hold = &hold
			ok = supported && validHold(hold) && edit.Tap.Kind == KeyPress
		}
	}
	if !ok {
		return KeyEdit{}, fmt.Errorf("This key uses a custom action. Open Neovim with Shift+E to edit it.")
	}
	binding := document.Bindings[layer][position]
	raw := document.Sources[binding.File][binding.Start:binding.End]
	if literalBehavior.FindStringSubmatch(raw) == nil || strings.Contains(raw, "/*") || strings.Contains(raw, "//") {
		return KeyEdit{}, fmt.Errorf("This binding contains comments or shared syntax. Open Neovim with Shift+E to preserve it.")
	}
	return edit, nil
}

func validateKeyAction(action KeyAction, layers int) error {
	switch action.Kind {
	case KeyPress:
		if !simpleKeyCode(action.Code) || action.Layer != 0 {
			return fmt.Errorf("Choose a key or shortcut from the action list")
		}
	case LayerWhileHeld, LayerToggle, LayerSwitch:
		if action.Layer < 0 || action.Layer >= layers || action.Code != "" {
			return fmt.Errorf("Choose an existing layer")
		}
	case KeyDisabled, KeyTransparent:
		if action.Code != "" || action.Layer != 0 {
			return fmt.Errorf("A disabled or transparent key cannot include another action")
		}
	default:
		return fmt.Errorf("Unsupported key action")
	}
	return nil
}

// ValidateKeyEdit checks the restricted tap/hold combinations before saving.
func ValidateKeyEdit(edit KeyEdit, layers int) error {
	if _, err := normalizeKeyName(edit.Name); err != nil {
		return err
	}
	if err := validateKeyAction(edit.Tap, layers); err != nil {
		return err
	}
	if edit.Hold != nil {
		if err := validateKeyAction(*edit.Hold, layers); err != nil {
			return err
		}
		if edit.Tap.Kind != KeyPress || !validHold(*edit.Hold) {
			return fmt.Errorf("Tap/hold keys need a key or shortcut on tap and a modifier or layer on hold")
		}
	}
	return nil
}

func sameKeyActions(a, b KeyEdit) bool {
	if a.Tap != b.Tap || (a.Hold == nil) != (b.Hold == nil) {
		return false
	}
	return a.Hold == nil || *a.Hold == *b.Hold
}

func keyActionBinding(document *Document, action KeyAction) string {
	switch action.Kind {
	case KeyPress:
		return "&kp " + action.Code
	case LayerWhileHeld:
		return "&mo " + document.LayerReferences[action.Layer]
	case LayerToggle:
		return "&tog " + document.LayerReferences[action.Layer]
	case LayerSwitch:
		return "&to " + document.LayerReferences[action.Layer]
	case KeyTransparent:
		return "&trans"
	default:
		return "&none"
	}
}

// SaveKeyEdit writes the name and actions together, after validating the whole config.
func SaveKeyEdit(document *Document, layer, position int, edit KeyEdit) (*Document, error) {
	original, err := ReadKeyEdit(document, layer, position)
	if err != nil {
		return nil, err
	}
	if err := ValidateKeyEdit(edit, len(document.Config.Layers)); err != nil {
		return nil, err
	}
	edit.Name, _ = normalizeKeyName(edit.Name)
	binding := document.Bindings[layer][position]
	source := document.Sources[binding.File]
	raw := source[binding.Start:binding.End]
	replacement := raw
	if !sameKeyActions(original, edit) {
		replacement = keyActionBinding(document, edit.Tap)
		if edit.Hold != nil {
			behavior, parameter := "mt", edit.Hold.Code
			if edit.Hold.Kind == LayerWhileHeld {
				behavior, parameter = "lt", document.LayerReferences[edit.Hold.Layer]
			}
			tapCode := edit.Tap.Code
			if original.Hold != nil && original.Hold.Kind == edit.Hold.Kind {
				behavior = literalBehavior.FindStringSubmatch(raw)[1]
				// Keep unchanged arguments as written, including shared constants.
				args := bindingsIn(tokenize(raw, binding.File, source, binding.Start))[0].args
				if len(args) == 2 {
					if *original.Hold == *edit.Hold {
						parameter = args[0]
					}
					if original.Tap == edit.Tap {
						tapCode = args[1]
					}
				}
			}
			replacement = fmt.Sprintf("&%s %s %s", behavior, parameter, tapCode)
		}
	}
	updated := source[:binding.Start] + replacement + source[binding.End:]
	if edit.Name != original.Name {
		start, end := binding.NameStart, binding.NameEnd
		name := ""
		if edit.Name != "" {
			name = "/* @name " + edit.Name + " */"
		}
		if start == end {
			start, end = binding.Start, binding.Start
			if name != "" {
				name += " "
			}
		} else if name == "" {
			end = nameRemovalEnd(binding, source)
		}
		updated = updated[:start] + name + updated[end:]
	}
	return writeEdit(document, binding.File, updated)
}
