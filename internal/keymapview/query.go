package keymapview

import (
	"fmt"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/fix-fox/glove/internal/keymap"
)

var digits = regexp.MustCompile(`^\d+$`)

func ResolveLayer(config keymap.Keymap, ref string) (int, error) {
	if digits.MatchString(ref) {
		index, err := strconv.Atoi(ref)
		if err != nil || index >= len(config.Layers) {
			return 0, fmt.Errorf("Layer index %s out of range (0-%d)", ref, len(config.Layers)-1)
		}
		return index, nil
	}
	lower := strings.ToLower(ref)
	names := []string{}
	matches := []int{}
	for i, layer := range config.Layers {
		if strings.EqualFold(layer.Name, ref) {
			return i, nil
		}
		names = append(names, layer.Name)
		if strings.HasPrefix(strings.ToLower(layer.Name), lower) {
			matches = append(matches, i)
		}
	}
	if len(matches) == 1 {
		return matches[0], nil
	}
	if len(matches) > 1 {
		names = nil
		for _, index := range matches {
			names = append(names, config.Layers[index].Name)
		}
		return 0, fmt.Errorf("Ambiguous layer %q: %s", ref, strings.Join(names, ", "))
	}
	return 0, fmt.Errorf("Unknown layer %q. Layers: %s", ref, strings.Join(names, ", "))
}

func ResolvePosition(ref string) (int, error) {
	if digits.MatchString(ref) {
		pos, err := strconv.Atoi(ref)
		if err != nil || pos >= keymap.KeyCount {
			return 0, fmt.Errorf("Position %s out of range (0-79)", ref)
		}
		return pos, nil
	}
	for i, name := range KeyNames {
		if strings.EqualFold(name, ref) {
			return i, nil
		}
	}
	return 0, fmt.Errorf("Unknown key position %q: expected 0-79", ref)
}

type FindQuery struct {
	Mods []string
	Key  string
}
type FindMatch struct{ Location, Binding, Note string }
type TextSearchResult struct {
	Entity         string
	Matches        []FindMatch
	Target         SearchTarget
	bindingMatches []bindingSearchMatch
}

var modifierWords = map[string]string{"cmd": "LG", "command": "LG", "gui": "LG", "win": "LG", "lg": "LG", "rcmd": "RG", "rgui": "RG", "rg": "RG", "ctrl": "LC", "control": "LC", "lc": "LC", "rctrl": "RC", "rc": "RC", "alt": "LA", "opt": "LA", "option": "LA", "la": "LA", "ralt": "RA", "ropt": "RA", "ra": "RA", "shift": "LS", "ls": "LS", "rshift": "RS", "rs": "RS"}

func ParseFindQuery(input string) *FindQuery {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" {
		return nil
	}
	key, mods := ParseModifiedKeyCode(strings.ToUpper(trimmed))
	if len(mods) > 0 {
		slices.Sort(mods)
		return &FindQuery{mods, key}
	}
	rest := []rune(trimmed)
	mods = []string{}
	symbols := map[rune]string{'⌘': "LG", '⌥': "LA", '⌃': "LC", '⇧': "LS"}
	for len(rest) > 0 && symbols[rest[0]] != "" {
		mods = append(mods, symbols[rest[0]])
		rest = rest[1:]
	}
	tokens := []string{}
	for _, part := range strings.Split(string(rest), "+") {
		if part = strings.TrimSpace(part); part != "" {
			tokens = append(tokens, part)
		}
	}
	if len(tokens) == 0 {
		return nil
	}
	for _, token := range tokens[:len(tokens)-1] {
		mod := modifierWords[strings.ToLower(token)]
		if mod == "" {
			return nil
		}
		mods = append(mods, mod)
	}
	slices.Sort(mods)
	return &FindQuery{mods, strings.ToUpper(tokens[len(tokens)-1])}
}

var kpBinding = regexp.MustCompile(`&kp\s+(\S+)`)

func ExtractKpCodes(binding string) []string {
	codes := []string{}
	for _, m := range kpBinding.FindAllStringSubmatch(binding, -1) {
		codes = append(codes, m[1])
	}
	return codes
}

// behaviorKeyCodes includes referenced morph branches; seen prevents malformed model cycles.
func behaviorKeyCodes(b keymap.Behavior, config keymap.Keymap, seen map[string]bool) []string {
	switch b.Type {
	case "kp":
		return []string{b.KeyCode}
	case "hold_tap":
		return []string{b.Param1, b.Param2}
	case "mod_morph":
		if seen[b.Name] {
			return nil
		}
		seen[b.Name] = true
		defer delete(seen, b.Name)
		for _, def := range config.ModMorphs {
			if def.Name == b.Name {
				codes := []string{}
				for _, binding := range []string{def.DefaultBinding, def.MorphBinding} {
					codes = append(codes, ExtractKpCodes(binding)...)
					parts := strings.Fields(binding)
					if len(parts) == 1 && strings.HasPrefix(parts[0], "&") {
						codes = append(codes, behaviorKeyCodes(keymap.Behavior{Type: "mod_morph", Name: strings.TrimPrefix(parts[0], "&")}, config, seen)...)
					}
				}
				return codes
			}
		}
	}
	return nil
}

func FindBindings(config keymap.Keymap, q FindQuery) []FindMatch {
	results := []FindMatch{}
	for _, match := range findBindingMatches(config, q) {
		results = append(results, match.FindMatch)
	}
	return results
}

func findBindingMatches(config keymap.Keymap, q FindQuery) []bindingSearchMatch {
	results := []bindingSearchMatch{}
	add := func(location, code string, target SearchTarget, kind string) {
		key, mods := ParseModifiedKeyCode(code)
		slices.Sort(mods)
		if key != q.Key {
			return
		}
		note := ""
		if len(q.Mods) == 0 {
			if len(mods) > 0 {
				note = "with " + strings.Join(mods, "+")
			}
		} else if !slices.Equal(mods, q.Mods) {
			return
		}
		results = append(results, bindingSearchMatch{FindMatch{location, code, note}, target, kind})
	}
	for layerIndex, layer := range config.Layers {
		for pos, key := range layer.Keys {
			slots := []struct {
				name     string
				behavior *keymap.Behavior
			}{{"tap", &key.Tap}, {"hold", key.Hold}}
			for _, slot := range slots {
				if slot.behavior == nil {
					continue
				}
				for _, code := range behaviorKeyCodes(*slot.behavior, config, map[string]bool{}) {
					add(fmt.Sprintf("layer %s · position %d · %s", layer.Name, pos, slot.name), code, SearchTarget{Kind: "key", LayerIndex: layerIndex, Position: pos}, bindingCodeKind(*slot.behavior, code, config))
				}
			}
		}
	}
	for _, def := range config.Macros {
		for i, step := range def.Steps {
			for _, code := range ExtractKpCodes(strings.Join(step.Bindings, " ")) {
				add(fmt.Sprintf("macro %s · step %d (%s)", def.Name, i+1, step.Directive), code, definitionTarget("macro", def.Name), "macro")
			}
		}
	}
	for _, def := range config.Combos {
		for _, code := range ExtractKpCodes(def.Binding) {
			add("combo "+def.Name, code, definitionTarget("combo", def.Name), "key")
		}
	}
	for _, def := range config.ModMorphs {
		for _, code := range ExtractKpCodes(def.DefaultBinding) {
			add("mod-morph "+def.Name+" · default", code, definitionTarget("mod-morph", def.Name), "modifier")
		}
		for _, code := range ExtractKpCodes(def.MorphBinding) {
			add("mod-morph "+def.Name+" · morph", code, definitionTarget("mod-morph", def.Name), "modifier")
		}
	}
	for _, def := range config.HoldTaps {
		for _, code := range ExtractKpCodes(def.TapBinding + " " + def.HoldBinding) {
			add("hold-tap "+def.Name+" · binding", code, definitionTarget("hold-tap", def.Name), "modifier")
		}
	}
	for _, def := range config.TapDances {
		for i, binding := range def.Bindings {
			for _, code := range ExtractKpCodes(binding) {
				add(fmt.Sprintf("tap-dance %s · tap %d", def.Name, i+1), code, definitionTarget("tap-dance", def.Name), "modifier")
			}
		}
	}
	return results
}

func TextSearch(config keymap.Keymap, query string) []TextSearchResult {
	q := strings.ToLower(strings.TrimSpace(query))
	results := []TextSearchResult{}
	if q == "" {
		return results
	}
	hit := func(s string) bool { return strings.Contains(strings.ToLower(s), q) }
	add := func(entity, kind, name string) {
		results = append(results, TextSearchResult{Entity: entity, Target: definitionTarget(kind, name)})
	}
	for _, def := range config.Macros {
		if hit(def.Name) || hit(def.Label) {
			s := fmt.Sprintf("macro %q", def.Name)
			if def.Label != "" {
				s += " (" + def.Label + ")"
			}
			add(s, "macro", def.Name)
		}
	}
	for _, def := range config.Combos {
		if hit(def.Name) {
			add(fmt.Sprintf("combo %q", def.Name), "combo", def.Name)
		}
	}
	for _, def := range config.ModMorphs {
		if hit(def.Name) || hit(def.Label) {
			add(fmt.Sprintf("mod-morph %q", def.Name), "mod-morph", def.Name)
		}
	}
	for _, def := range config.HoldTaps {
		if hit(def.Name) || hit(def.Label) {
			add(fmt.Sprintf("hold-tap %q", def.Name), "hold-tap", def.Name)
		}
	}
	for _, def := range config.TapDances {
		if hit(def.Name) || hit(def.Label) {
			add(fmt.Sprintf("tap-dance %q", def.Name), "tap-dance", def.Name)
		}
	}
	for _, def := range config.ConditionalLayers {
		if hit(def.Name) {
			add(fmt.Sprintf("conditional layer %q", def.Name), "conditional", def.Name)
		}
	}
	for i, layer := range config.Layers {
		if hit(layer.Name) {
			results = append(results, TextSearchResult{Entity: fmt.Sprintf("layer %d %q", i, layer.Name), Target: SearchTarget{Kind: "layer", LayerIndex: i}})
		}
	}
	for _, kc := range Keycodes {
		if hit(kc.Label) && !strings.EqualFold(kc.Label, kc.Code) {
			resolved := findBindingMatches(config, FindQuery{Key: kc.Code})
			matches := []FindMatch{}
			for _, match := range resolved {
				matches = append(matches, match.FindMatch)
			}
			if len(matches) > 0 {
				results = append(results, TextSearchResult{Entity: fmt.Sprintf("keycode %s %q", kc.Code, kc.Label), Matches: matches, bindingMatches: resolved})
			}
		}
	}
	return results
}

type FindAlias struct {
	Name    string
	Queries []string
	Hint    string
}

// Mac chords match docs/MAC_SETUP.md, including its Maccy and launcher settings.
var FindAliases = []FindAlias{
	{"screenshot", []string{"LG(LS(N5))", "LG(LS(N4))", "LG(LS(N3))", "PSCRN"}, "⌘⇧5 menu / ⌘⇧4 region / ⌘⇧3 full / PrtSc"},
	{"lock", []string{"LC(LG(Q))"}, "⌃⌘Q"}, {"emoji", []string{"LC(LG(SPACE))"}, "⌃⌘Space"}, {"launcher", []string{"LA(SPACE)"}, "⌥Space"},
	{"clipboard", []string{"LA(LS(V))"}, "⌥⇧V (Maccy)"}, {"alttab", []string{"LA(TAB)"}, "⌥Tab"}, {"lang", []string{"LC(SPACE)"}, "⌃Space input-source switch"},
	{"copy", []string{"LG(C)"}, "⌘C"}, {"paste", []string{"LG(V)"}, "⌘V"}, {"cut", []string{"LG(X)"}, "⌘X"}, {"undo", []string{"LG(Z)"}, "⌘Z"}, {"redo", []string{"LS(LG(Z))"}, "⌘⇧Z"},
	{"save", []string{"LG(S)"}, "⌘S"}, {"newtab", []string{"LG(T)"}, "⌘T"}, {"close", []string{"LG(W)"}, "⌘W"},
}

func LookupAlias(query string) *FindAlias {
	for i := range FindAliases {
		if strings.EqualFold(strings.TrimSpace(query), FindAliases[i].Name) {
			return &FindAliases[i]
		}
	}
	return nil
}
