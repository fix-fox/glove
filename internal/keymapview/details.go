package keymapview

import (
	"fmt"
	"strings"

	"github.com/fix-fox/glove/internal/keymap"
)

func positionName(position int) string {
	return fmt.Sprint(position)
}

// PositionSide follows the physical grid, including thumb keys whose indices are interleaved.
func PositionSide(position int) string {
	for _, row := range Geometry {
		for column, value := range row {
			if value == position && value >= 0 {
				if column < len(row)/2 {
					return "left"
				}
				return "right"
			}
		}
	}
	return ""
}
func annotation(name, label string) string {
	if label != "" {
		return name + " (" + label + ")"
	}
	return name
}
func optionalMilliseconds(value *int) string {
	if value == nil {
		return "default"
	}
	return fmt.Sprint(*value)
}

func MacroDetail(def keymap.MacroDefinition, indent string) string {
	lines := []string{indent + "macro " + annotation(def.Name, def.Label)}
	if def.WaitMs != nil || def.TapMs != nil {
		lines = append(lines, fmt.Sprintf("%s  wait: %sms, tap: %sms", indent, optionalMilliseconds(def.WaitMs), optionalMilliseconds(def.TapMs)))
	}
	for i, step := range def.Steps {
		detail := step.Directive
		if len(step.Bindings) > 0 {
			detail += " " + strings.Join(step.Bindings, " ")
		}
		lines = append(lines, fmt.Sprintf("%s  %d. %s", indent, i+1, detail))
	}
	return strings.Join(lines, "\n")
}

func ComboDetail(config keymap.Keymap, def keymap.ComboDefinition) string {
	positions := []string{}
	for _, p := range def.KeyPositions {
		positions = append(positions, positionName(p))
	}
	layers := []string{}
	for _, i := range def.Layers {
		layers = append(layers, layerName(config, i))
	}
	if len(layers) == 0 {
		layers = []string{"all"}
	}
	lines := []string{"combo " + def.Name, "  keys: " + strings.Join(positions, " + "), "  binding: " + def.Binding, "  layers: " + strings.Join(layers, ", ")}
	if def.TimeoutMs != nil {
		lines = append(lines, fmt.Sprintf("  timeout: %dms", *def.TimeoutMs))
	}
	return strings.Join(lines, "\n")
}

func DescribeBehavior(b keymap.Behavior, config keymap.Keymap, indent string, hebrew bool) string {
	switch b.Type {
	case "kp":
		return fmt.Sprintf("kp %s — %s", b.KeyCode, KeyCodeLabel(b.KeyCode, hebrew))
	case "mo", "to", "sl", "tog":
		action := map[string]string{"mo": "momentary", "to": "switch to", "sl": "sticky", "tog": "toggle"}[b.Type]
		return fmt.Sprintf("%s %d — %s layer %q", b.Type, b.LayerIndex, action, DisplayText(layerName(config, b.LayerIndex), false))
	case "trans":
		return "trans — falls through to lower layer"
	case "none":
		return "none"
	case "macro":
		params := []string{}
		for _, v := range []string{b.Param, b.Param2} {
			if v != "" {
				params = append(params, v)
			}
		}
		head := "macro " + b.MacroName
		if len(params) > 0 {
			head += "(" + strings.Join(params, ", ") + ")"
		}
		for _, def := range config.Macros {
			if def.Name == b.MacroName {
				return head + "\n" + MacroDetail(def, indent+"  ")
			}
		}
		return head + " — definition not found"
	case "mod_morph":
		for _, def := range config.ModMorphs {
			if def.Name == b.Name {
				return strings.Join([]string{"mod-morph " + b.Name, indent + "  default: " + def.DefaultBinding, indent + "  with " + strings.Join(def.Mods, "+") + ": " + def.MorphBinding}, "\n")
			}
		}
		return "mod-morph " + b.Name + " — definition not found"
	case "hold_tap":
		head := fmt.Sprintf("hold-tap %s(%s, %s)", b.Name, b.Param1, b.Param2)
		for _, def := range config.HoldTaps {
			if def.Name != b.Name {
				continue
			}
			hold := def.HoldBinding
			switch hold {
			case "&kp", "&mo", "&to", "&tog", "&sl":
				hold += " " + b.Param1
			}
			tap := def.TapBinding
			if tap == "&kp" {
				tap += " " + b.Param2
			}
			return strings.Join([]string{head, indent + "  hold: " + hold, indent + "  tap:  " + tap, fmt.Sprintf("%s  flavor: %s, tapping-term: %dms", indent, def.Flavor, def.TappingTermMs)}, "\n")
		}
		return head + " — definition not found"
	default:
		label := BehaviorLabel(b, config, hebrew)
		if label != "" {
			return b.Type + " — " + label
		}
		return b.Type
	}
}

func KeyDetail(config keymap.Keymap, layerIndex, position int) string {
	if layerIndex < 0 || layerIndex >= len(config.Layers) {
		return fmt.Sprintf("Layer %d not found", layerIndex)
	}
	layer := config.Layers[layerIndex]
	if position < 0 || position >= len(layer.Keys) {
		return fmt.Sprintf("Position %d not found", position)
	}
	key := layer.Keys[position]
	hebrew := strings.Contains(strings.ToLower(layer.Name), "hebrew")
	hold := "(none)"
	if key.Hold != nil {
		hold = DescribeBehavior(*key.Hold, config, "  ", hebrew)
	}
	return fmt.Sprintf("Position %d on layer %d %q\n  tap:  %s\n  hold: %s", position, layerIndex, DisplayText(layer.Name, false), DescribeBehavior(key.Tap, config, "  ", hebrew), hold)
}

func listLayers(config keymap.Keymap) []string {
	lines := []string{}
	for i, layer := range config.Layers {
		bound := 0
		for _, key := range layer.Keys {
			if key.Tap.Type != "none" && key.Tap.Type != "trans" {
				bound++
			}
		}
		lines = append(lines, fmt.Sprintf("%2d: %s (%d keys bound)", i, layer.Name, bound))
	}
	return lines
}

func listDefinitions(config keymap.Keymap, kind string) []string {
	lines := []string{}
	switch kind {
	case "macros":
		for _, def := range config.Macros {
			plural := "s"
			if len(def.Steps) == 1 {
				plural = ""
			}
			line := fmt.Sprintf("%s — %d step%s", def.Name, len(def.Steps), plural)
			if def.Label != "" {
				line += " (" + def.Label + ")"
			}
			lines = append(lines, line)
		}
	case "combos":
		for _, def := range config.Combos {
			names := []string{}
			for _, pos := range def.KeyPositions {
				names = append(names, positionName(pos))
			}
			lines = append(lines, def.Name+": "+strings.Join(names, "+")+" → "+def.Binding)
		}
	case "holdtaps":
		for _, def := range config.HoldTaps {
			lines = append(lines, fmt.Sprintf("%s: %s, %dms, hold %s, tap %s", def.Name, def.Flavor, def.TappingTermMs, def.HoldBinding, def.TapBinding))
		}
	case "morphs":
		for _, def := range config.ModMorphs {
			lines = append(lines, def.Name+": "+def.DefaultBinding+" / "+strings.Join(def.Mods, "+")+" → "+def.MorphBinding)
		}
	case "condlayers":
		for _, def := range config.ConditionalLayers {
			names := []string{}
			for _, idx := range def.IfLayers {
				names = append(names, layerName(config, idx))
			}
			lines = append(lines, def.Name+": "+strings.Join(names, " + ")+" → "+layerName(config, def.ThenLayer))
		}
	case "tapdances":
		for _, def := range config.TapDances {
			lines = append(lines, annotation(def.Name, def.Label)+": "+strings.Join(def.Bindings, " / "))
		}
	}
	return lines
}

// RenderLayer is the plain-text command view, retaining every tap and hold without truncation.
func RenderLayer(config keymap.Keymap, layerIndex int, side string) string {
	if layerIndex < 0 || layerIndex >= len(config.Layers) {
		return fmt.Sprintf("Layer %d not found", layerIndex)
	}
	layer := config.Layers[layerIndex]
	title := fmt.Sprintf("Layer %d: %s", layerIndex, layer.Name)
	if side != "both" && side != "" {
		title += " (" + side + " half)"
	}
	lines := []string{title, ""}
	for _, row := range Geometry {
		for _, pos := range row {
			if pos < 0 || pos >= len(layer.Keys) {
				continue
			}
			if (side == "left" || side == "right") && side != PositionSide(pos) {
				continue
			}
			key := layer.Keys[pos]
			hebrew := strings.Contains(strings.ToLower(layer.Name), "hebrew")
			labels := presentation(key, config, hebrew)
			tap := labels.tap
			if tap == "" {
				tap = "(none)"
			}
			hold := labels.hold
			line := fmt.Sprintf("%2d  %s", pos, tap)
			if hold != "" {
				line += "  [hold: " + hold + "]"
			}
			lines = append(lines, line)
		}
		lines = append(lines, "")
	}
	return strings.TrimRight(strings.Join(lines, "\n"), "\n")
}
