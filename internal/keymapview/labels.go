package keymapview

import (
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/fix-fox/glove/internal/keymap"
)

var modifiedCode = regexp.MustCompile(`^(LC|RC|LA|RA|LS|RS|LG|RG)\((.+)\)$`)

func ParseModifiedKeyCode(code string) (key string, mods []string) {
	mods = []string{}
	for {
		m := modifiedCode.FindStringSubmatch(code)
		if m == nil {
			return code, mods
		}
		mods = append(mods, m[1])
		code = m[2]
	}
}

func KeyCodeLabel(code string, hebrew bool) string {
	if hebrew {
		if label, ok := hebrewLabels[code]; ok {
			return label
		}
	}
	if label, ok := displayOverrides[code]; ok {
		return label
	}
	key, mods := ParseModifiedKeyCode(code)
	if len(mods) > 0 {
		var symbols string
		for _, mod := range mods {
			symbols += modifierSymbols[mod]
		}
		return symbols + KeyCodeLabel(key, hebrew)
	}
	for _, kc := range Keycodes {
		if kc.Code == code {
			return kc.Label
		}
	}
	return code
}

type Morph struct{ Mod, KeyCode string }
type UnpackedKey struct {
	BaseKeyCode string
	Morphs      []Morph
}

// UnpackModMorph follows default bindings to the base key and returns morphs inside-out.
func UnpackModMorph(behavior keymap.Behavior, definitions []keymap.ModMorphDefinition) *UnpackedKey {
	if behavior.Type != "mod_morph" {
		return nil
	}
	flags := map[string]string{"MOD_LSFT": "shift", "MOD_RSFT": "shift", "MOD_LCTL": "ctrl", "MOD_RCTL": "ctrl", "MOD_LALT": "alt", "MOD_RALT": "alt", "MOD_LGUI": "gui", "MOD_RGUI": "gui"}
	name := behavior.Name
	var morphs []Morph
	seen := map[string]bool{}
	for {
		if seen[name] {
			return nil
		}
		seen[name] = true
		var def *keymap.ModMorphDefinition
		for i := range definitions {
			if definitions[i].Name == name {
				def = &definitions[i]
				break
			}
		}
		if def == nil {
			return nil
		}
		m := strings.Fields(def.MorphBinding)
		if len(m) != 2 || m[0] != "&kp" {
			return nil
		}
		mod := ""
		for _, flag := range def.Mods {
			if flags[flag] != "" {
				mod = flags[flag]
				break
			}
		}
		if mod == "" {
			return nil
		}
		morphs = append(morphs, Morph{mod, m[1]})
		base := strings.Fields(def.DefaultBinding)
		if len(base) == 2 && base[0] == "&kp" {
			slices.Reverse(morphs)
			return &UnpackedKey{base[1], morphs}
		}
		if len(base) != 1 || !strings.HasPrefix(base[0], "&") {
			return nil
		}
		name = strings.TrimPrefix(base[0], "&")
	}
}

func isHRM(name string) bool {
	return name == "hml" || name == "hmr" || strings.HasPrefix(name, "hml_") || strings.HasPrefix(name, "hmr_")
}

func HoldTapSecondaryLabel(name, param string) string {
	if name == "magic" {
		return "magic-hold"
	}
	if isHRM(name) || strings.HasPrefix(name, "mt_") {
		symbols := map[string]string{"LGUI": "⌘", "RGUI": "⌘", "LALT": "⌥", "RALT": "⌥", "LCTRL": "⌃", "RCTRL": "⌃", "LSHIFT": "⇧", "RSHIFT": "⇧"}
		key, mods := ParseModifiedKeyCode(param)
		parts := []string{}
		for _, mod := range mods {
			symbol := modifierSymbols[mod]
			if !slices.Contains(parts, symbol) {
				parts = append(parts, symbol)
			}
		}
		base := symbols[key]
		if base == "" {
			base = key
		}
		if !slices.Contains(parts, base) {
			parts = append(parts, base)
		}
		return strings.Join(parts, "")
	}
	if strings.HasPrefix(name, "lt") {
		return "◇" + param
	}
	return name
}

func layerName(config keymap.Keymap, index int) string {
	if index >= 0 && index < len(config.Layers) {
		return config.Layers[index].Name
	}
	return strconv.Itoa(index)
}

func BehaviorLabel(b keymap.Behavior, config keymap.Keymap, hebrew bool) string {
	switch b.Type {
	case "kp":
		return KeyCodeLabel(b.KeyCode, hebrew)
	case "mo", "to", "sl", "tog":
		name := DisplayText(layerName(config, b.LayerIndex), false)
		if len([]rune(name)) > 3 {
			runes := []rune(strings.ReplaceAll(name, "_", ""))
			if len(runes) > 3 {
				runes = runes[:3]
			}
			name = strings.ToUpper(string(runes))
		}
		return map[string]string{"mo": "◇ ", "to": "⇨ ", "sl": "◆ ", "tog": "⇄ "}[b.Type] + name
	case "none", "trans":
		return ""
	case "bootloader":
		return "BOOT"
	case "sys_reset":
		return "RESET"
	case "bt":
		if b.Action == "BT_SEL" {
			profile := 0
			if b.ProfileIndex != nil {
				profile = *b.ProfileIndex
			}
			return "BT SEL " + strconv.Itoa(profile)
		}
		return strings.Replace(b.Action, "BT_", "BT ", 1)
	case "caps_word":
		return "CAPS"
	case "rgb_ug":
		return b.Action
	case "out":
		if b.Action == "OUT_BLE" {
			return "BLE"
		}
		return "USB"
	case "mmv", "msc":
		label := strings.NewReplacer("MOVE_", "M_", "SCRL_", "SC_", "DOWN", "DN", "RIGHT", "RHT").Replace(b.Direction)
		if b.Precision {
			label = "p" + label
		}
		return label
	case "mkp":
		return b.Button
	case "macro":
		return b.MacroName
	case "mod_morph":
		if u := UnpackModMorph(b, config.ModMorphs); u != nil {
			return KeyCodeLabel(u.BaseKeyCode, hebrew)
		}
		return b.Name
	case "hold_tap":
		if b.Name == "magic" {
			return "magic-tap"
		}
		if isHRM(b.Name) || strings.HasPrefix(b.Name, "mt_") {
			for _, def := range config.HoldTaps {
				if def.Name == b.Name && def.TapBinding != "&kp" {
					if u := UnpackModMorph(keymap.Behavior{Type: "mod_morph", Name: strings.TrimPrefix(def.TapBinding, "&")}, config.ModMorphs); u != nil {
						return KeyCodeLabel(u.BaseKeyCode, hebrew)
					}
				}
			}
			return KeyCodeLabel(b.Param2, hebrew)
		}
		if strings.HasPrefix(b.Name, "lt") {
			return KeyCodeLabel(b.Param2, hebrew)
		}
		return b.Name
	case "tap_dance":
		return strings.TrimPrefix(b.Name, "td_")
	}
	return b.Type
}
