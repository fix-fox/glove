package keymapview

import (
	"fmt"
	"regexp"
	"slices"
	"strings"

	"github.com/charmbracelet/x/ansi"
	"github.com/fix-fox/glove/internal/keymap"
)

// Intent describes an action for the application to perform; dispatch never writes files or launches processes.
type Intent struct {
	Kind, Text                  string
	Error                       bool
	Index, LayerIndex, Position int
	Side                        string
	Args                        []string
}

var Commands = []string{"layers", "layer", "left", "right", "both", "key", "rm", "macros", "macro", "combos", "combo", "holdtaps", "morphs", "condlayers", "tapdances", "find", "flash", "reload", "edit", "help", "quit", "exit"}
var FlashFlags = []string{"--local", "--remote", "--full"}
var usage = map[string]string{
	"layers": "layers: list all layers",
	"layer":  "layer <name|index>: display a layer, e.g. `layer symbols`",
	"left":   "left: show only the left half of the board",
	"right":  "right: show only the right half of the board",
	"both":   "both: show the full board",
	"key":    "key <pos>: key detail on the displayed layer, e.g. `key RM4` or `key 43` (a bare position works too)",
	"macros": "macros: list all macros", "macro": "macro <name>: full macro definition",
	"combos": "combos: list all combos", "combo": "combo <name>: full combo definition",
	"holdtaps": "holdtaps: list hold-tap definitions", "morphs": "morphs: list mod-morph definitions", "condlayers": "condlayers: list conditional layers", "tapdances": "tapdances: list tap-dance definitions",
	"find":   "find <query>: reverse lookup: keycodes (`find Cmd+C`), concepts (`find screenshot`), names/labels (`find print`)",
	"rm":     "rm <pos>: clear a key on the displayed layer: none on the base layer, trans elsewhere, e.g. `rm RM4`",
	"reload": "reload: reread the native config files; keep the last valid keymap if loading fails",
	"edit":   "edit: open the keymap in $VISUAL or $EDITOR, then reload it",
	"flash":  "flash [--local|--remote] [--full]: validate, build, and flash via scripts/glove-flash.sh",
	"help":   "help [command]: show help", "quit": "quit: exit Glove",
}

func Help() string {
	lines := []string{}
	for _, cmd := range Commands {
		if text, ok := usage[cmd]; ok {
			lines = append(lines, text)
		}
	}
	return strings.Join(lines, "\n")
}

func levenshtein(a, b string) int {
	previous := make([]int, len(b)+1)
	for j := range previous {
		previous[j] = j
	}
	for i := 1; i <= len(a); i++ {
		current := make([]int, len(b)+1)
		current[0] = i
		for j := 1; j <= len(b); j++ {
			cost := 0
			if a[i-1] != b[j-1] {
				cost = 1
			}
			current[j] = min(previous[j]+1, current[j-1]+1, previous[j-1]+cost)
		}
		previous = current
	}
	return previous[len(b)]
}

func unknownCommand(cmd string) string {
	closest := ""
	distance := 3
	for _, candidate := range Commands {
		if candidate == "exit" {
			continue
		}
		d := levenshtein(candidate, strings.ToLower(cmd))
		if d < distance {
			closest = candidate
			distance = d
		}
	}
	hint := ""
	if closest != "" {
		hint = " Did you mean `" + closest + "`?"
	}
	return fmt.Sprintf("Unknown command %q.%s Type `help` for commands.", cmd, hint)
}

func formatFindMatches(matches []FindMatch) string {
	width := 0
	for _, match := range matches {
		width = max(width, ansi.StringWidth(DisplayText(match.Location, false)))
	}
	lines := []string{}
	for _, match := range matches {
		location := DisplayText(match.Location, false)
		line := location + strings.Repeat(" ", max(0, width-ansi.StringWidth(location))) + " → " + match.Binding
		if match.Note != "" {
			line += " (" + match.Note + ")"
		}
		lines = append(lines, line)
	}
	return strings.Join(lines, "\n")
}

func find(config keymap.Keymap, raw string) string {
	sections := []string{}
	if q := ParseFindQuery(raw); q != nil {
		matches := FindBindings(config, *q)
		if len(matches) > 0 {
			sections = append(sections, formatFindMatches(matches))
		}
	}
	if alias := LookupAlias(raw); alias != nil {
		for _, query := range alias.Queries {
			q := ParseFindQuery(query)
			if q == nil {
				continue
			}
			matches := FindBindings(config, *q)
			if len(matches) > 0 {
				sections = append(sections, fmt.Sprintf("%s ≈ %s — %s:\n%s", strings.ToLower(strings.TrimSpace(raw)), alias.Hint, query, formatFindMatches(matches)))
			}
		}
	}
	if len(sections) == 0 {
		for _, result := range TextSearch(config, raw) {
			text := result.Entity
			if len(result.Matches) > 0 {
				text += ":\n" + formatFindMatches(result.Matches)
			}
			sections = append(sections, text)
		}
	}
	if len(sections) == 0 {
		return "No bindings found for " + raw + "."
	}
	return strings.Join(sections, "\n\n")
}

func Dispatch(config keymap.Keymap, line string, layerIndex int, side string) (result Intent) {
	// A single boundary sanitizes every config-derived command output, including errors.
	defer func() { result.Text = DisplayText(result.Text, true) }()
	out := func(text string) Intent { return Intent{Kind: "output", Text: text} }
	fail := func(text string) Intent { return Intent{Kind: "output", Text: text, Error: true} }
	tokens := strings.Fields(line)
	if len(tokens) == 0 {
		return out("")
	}
	cmd := strings.ToLower(tokens[0])
	args := tokens[1:]
	if side == "" {
		side = "both"
	}
	if layerIndex < 0 || layerIndex >= len(config.Layers) {
		return fail("Layer is out of range. Reload the keymap.")
	}
	if len(args) == 0 {
		if position, err := ResolvePosition(tokens[0]); err == nil {
			return out(KeyDetail(config, layerIndex, position))
		}
	}
	switch cmd {
	case "quit", "exit":
		return Intent{Kind: "quit"}
	case "help":
		if len(args) > 0 {
			if text, ok := usage[strings.ToLower(args[0])]; ok {
				return out(text)
			}
		}
		return out(Help())
	case "layers":
		return out(strings.Join(listLayers(config), "\n"))
	case "macros", "combos", "holdtaps", "morphs", "condlayers", "tapdances":
		lines := listDefinitions(config, cmd)
		if len(lines) == 0 {
			nouns := map[string]string{"macros": "macros", "combos": "combos", "holdtaps": "hold-taps", "morphs": "mod-morphs", "condlayers": "conditional layers", "tapdances": "tap-dances"}
			return out("No " + nouns[cmd] + " defined.")
		}
		return out(strings.Join(lines, "\n"))
	case "layer":
		if len(args) != 1 {
			return fail(usage[cmd])
		}
		index, err := ResolveLayer(config, args[0])
		if err != nil {
			return fail(err.Error())
		}
		return Intent{Kind: "show-layer", Index: index, Side: side, Text: RenderLayer(config, index, side)}
	case "left", "right", "both":
		if len(args) != 0 {
			return fail(usage[cmd])
		}
		return Intent{Kind: "show-layer", Index: layerIndex, Side: cmd, Text: RenderLayer(config, layerIndex, cmd)}
	case "key", "rm":
		if len(args) != 1 {
			return fail(usage[cmd])
		}
		position, err := ResolvePosition(args[0])
		if err != nil {
			return fail(err.Error())
		}
		if cmd == "key" {
			return out(KeyDetail(config, layerIndex, position))
		}
		layer := config.Layers[layerIndex]
		if position >= len(layer.Keys) {
			return fail(fmt.Sprintf("Position %d not found", position))
		}
		key := layer.Keys[position]
		previous := strings.SplitN(DescribeBehavior(key.Tap, config, "", false), "\n", 2)[0]
		label := fmt.Sprintf("%s (pos %d)", positionName(position), position)
		clearType := "none"
		if layerIndex != 0 {
			clearType = "trans"
		}
		text := "removed " + label + ", was " + previous
		if key.Tap.Type == clearType && key.Hold == nil {
			text = label + " was already clear (" + previous + ")."
		}
		return Intent{Kind: "clear-key", LayerIndex: layerIndex, Position: position, Text: text}
	case "macro":
		if len(args) != 1 {
			return fail(usage[cmd])
		}
		names := []string{}
		for _, def := range config.Macros {
			if def.Name == args[0] {
				return out(MacroDetail(def, ""))
			}
			names = append(names, def.Name)
		}
		suffix := "No macros defined."
		if len(names) > 0 {
			suffix = "Macros: " + strings.Join(names, ", ")
		}
		return fail(fmt.Sprintf("Unknown macro %q. %s", args[0], suffix))
	case "combo":
		if len(args) != 1 {
			return fail(usage[cmd])
		}
		names := []string{}
		for _, def := range config.Combos {
			if def.Name == args[0] {
				return out(ComboDetail(config, def))
			}
			names = append(names, def.Name)
		}
		suffix := "No combos defined."
		if len(names) > 0 {
			suffix = "Combos: " + strings.Join(names, ", ")
		}
		return fail(fmt.Sprintf("Unknown combo %q. %s", args[0], suffix))
	case "find":
		if len(args) == 0 {
			return fail(usage[cmd])
		}
		return out(find(config, strings.Join(args, " ")))
	case "reload", "edit":
		if len(args) != 0 {
			return fail(usage[cmd])
		}
		return Intent{Kind: cmd}
	case "flash":
		for _, arg := range args {
			if !slices.Contains(FlashFlags, arg) {
				return fail("Unknown flash flag " + arg + ". " + usage[cmd])
			}
		}
		if slices.Contains(args, "--local") && slices.Contains(args, "--remote") {
			return fail("Choose --local or --remote. " + usage[cmd])
		}
		return Intent{Kind: "flash", Args: args}
	default:
		return fail(unknownCommand(tokens[0]))
	}
}

var whitespace = regexp.MustCompile(`\s+`)

func Complete(config keymap.Keymap, line string) (matches []string, completeOn string) {
	parts := whitespace.Split(line, -1)
	last := parts[len(parts)-1]
	candidates := []string{}
	cmd := strings.ToLower(parts[0])
	if len(parts) <= 1 {
		candidates = Commands
	} else {
		switch {
		case cmd == "layer" && len(parts) == 2:
			for _, layer := range config.Layers {
				candidates = append(candidates, layer.Name)
			}
		case (cmd == "key" || cmd == "rm") && len(parts) == 2:
			candidates = KeyNames
		case cmd == "macro" && len(parts) == 2:
			for _, def := range config.Macros {
				candidates = append(candidates, def.Name)
			}
		case cmd == "combo" && len(parts) == 2:
			for _, def := range config.Combos {
				candidates = append(candidates, def.Name)
			}
		case cmd == "flash":
			candidates = FlashFlags
		case cmd == "help" && len(parts) == 2:
			candidates = Commands
		case cmd == "find" && len(parts) == 2:
			for _, alias := range FindAliases {
				candidates = append(candidates, alias.Name)
			}
		}
	}
	matches = []string{}
	for _, candidate := range candidates {
		if strings.HasPrefix(strings.ToLower(candidate), strings.ToLower(last)) {
			matches = append(matches, candidate)
		}
	}
	return matches, last
}
