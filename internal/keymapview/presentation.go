package keymapview

import (
	"strconv"
	"strings"

	"github.com/fix-fox/glove/internal/keymap"
)

type keyPresentation struct{ tap, hold, tapKind, holdKind string }

func keycodeKind(code string) string {
	_, mods := ParseModifiedKeyCode(code)
	if len(mods) > 0 {
		return "modifier"
	}
	label := KeyCodeLabel(code, false)
	if strings.ContainsAny(label, "⌘⌥⌃⇧") {
		return "modifier"
	}
	return "key"
}

func behaviorKind(behavior keymap.Behavior) string {
	switch behavior.Type {
	case "none", "trans":
		return "empty"
	case "kp":
		return keycodeKind(behavior.KeyCode)
	case "mo", "to", "sl", "tog":
		return "layer"
	case "macro":
		return "macro"
	case "hold_tap", "mod_morph", "caps_word":
		return "modifier"
	default:
		return "key"
	}
}

func bindingCodeKind(behavior keymap.Behavior, code string, config keymap.Keymap) string {
	if behavior.Type == "mod_morph" {
		if unpacked := UnpackModMorph(behavior, config.ModMorphs); unpacked != nil && code != unpacked.BaseKeyCode {
			return "modifier"
		}
	}
	if behavior.Type == "hold_tap" {
		labels := presentation(keymap.Key{Tap: behavior}, config, false)
		if code == behavior.Param1 {
			return labels.holdKind
		}
		if code == behavior.Param2 {
			return labels.tapKind
		}
	}
	return keycodeKind(code)
}

// definitionBinding resolves a hold-tap's parameter into the behavior displayed on that line.
func definitionBinding(binding, parameter string, config keymap.Keymap) keymap.Behavior {
	parts := strings.Fields(binding)
	if len(parts) == 0 {
		return keymap.Behavior{Type: "none"}
	}
	name := strings.TrimPrefix(parts[0], "&")
	argument := parameter
	if len(parts) > 1 {
		argument = parts[1]
	}
	switch name {
	case "kp":
		return keymap.Behavior{Type: "kp", KeyCode: argument}
	case "mo", "to", "sl", "tog":
		index, _ := strconv.Atoi(argument)
		return keymap.Behavior{Type: name, LayerIndex: index}
	case "none", "trans", "caps_word", "bootloader", "sys_reset":
		return keymap.Behavior{Type: name}
	}
	for _, def := range config.Macros {
		if def.Name == name {
			return keymap.Behavior{Type: "macro", MacroName: name}
		}
	}
	for _, def := range config.ModMorphs {
		if def.Name == name {
			return keymap.Behavior{Type: "mod_morph", Name: name}
		}
	}
	for _, def := range config.TapDances {
		if def.Name == name {
			return keymap.Behavior{Type: "tap_dance", Name: name}
		}
	}
	return keymap.Behavior{Type: name}
}

// presentation separates tap and hold semantics so highlighting does not recolor ordinary taps as modifiers.
func presentation(key keymap.Key, config keymap.Keymap, hebrew bool) keyPresentation {
	result := keyPresentation{tap: BehaviorLabel(key.Tap, config, hebrew), tapKind: behaviorKind(key.Tap), holdKind: "empty"}
	if key.Tap.Type == "trans" {
		result.tap = "·"
	}
	if key.Hold != nil {
		result.hold = BehaviorLabel(*key.Hold, config, hebrew)
		result.holdKind = behaviorKind(*key.Hold)
	}
	if key.Tap.Type == "mod_morph" {
		if unpacked := UnpackModMorph(key.Tap, config.ModMorphs); unpacked != nil {
			result.tapKind = keycodeKind(unpacked.BaseKeyCode)
			alternates := []string{}
			symbols := map[string]string{"shift": "⇧", "ctrl": "⌃", "alt": "⌥", "gui": "⌘"}
			for _, morph := range unpacked.Morphs {
				alternates = append(alternates, symbols[morph.Mod]+KeyCodeLabel(morph.KeyCode, hebrew))
			}
			if len(alternates) > 0 && key.Hold == nil {
				result.hold = strings.Join(alternates, " ")
				result.holdKind = "modifier"
			}
		}
	}
	if key.Tap.Type == "hold_tap" {
		result.hold = HoldTapSecondaryLabel(key.Tap.Name, key.Tap.Param1)
		result.holdKind = "modifier"
		for _, def := range config.HoldTaps {
			if def.Name != key.Tap.Name {
				continue
			}
			tap := definitionBinding(def.TapBinding, key.Tap.Param2, config)
			hold := definitionBinding(def.HoldBinding, key.Tap.Param1, config)
			result.tap = BehaviorLabel(tap, config, hebrew)
			result.tapKind = behaviorKind(tap)
			if tap.Type == "mod_morph" {
				if unpacked := UnpackModMorph(tap, config.ModMorphs); unpacked != nil {
					result.tapKind = keycodeKind(unpacked.BaseKeyCode)
				}
			}
			result.hold = BehaviorLabel(hold, config, hebrew)
			result.holdKind = behaviorKind(hold)
			if hold.Type == "kp" && result.holdKind == "modifier" {
				result.hold = HoldTapSecondaryLabel("hml", hold.KeyCode)
			}
			if (isHRM(key.Tap.Name) || strings.HasPrefix(key.Tap.Name, "mt_")) && keycodeKind(key.Tap.Param1) == "modifier" {
				// Home-row macros can also activate a helper layer; the held modifier remains the useful key label.
				result.hold = HoldTapSecondaryLabel(key.Tap.Name, key.Tap.Param1)
				result.holdKind = "modifier"
			}
			if key.Tap.Name == "magic" {
				result.tap = "magic-tap"
				result.hold = "magic-hold"
			}
			break
		}
	}
	result.tap = DisplayText(result.tap, false)
	result.hold = DisplayText(result.hold, false)
	return result
}
