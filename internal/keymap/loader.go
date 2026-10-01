package keymap

import (
	"path/filepath"
	"slices"
	"strings"
)

type definition struct {
	node  *keymapNode
	kind  string
	cells int
}

type loader struct {
	config          Keymap
	keymapNode      *keymapNode
	definitions     map[string]definition
	definitionNames []string
}

// Load validates the entire native include graph before returning a usable document.
func Load(path string) (*Document, error) { return load(path, nil) }

func load(path string, replacements map[string]string) (document *Document, err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			if failure, ok := recovered.(parseFailure); ok {
				document = nil
				err = failure.error
			} else {
				panic(recovered)
			}
		}
	}()
	if path == "" {
		path = "config/glove80.keymap"
	}
	path, err = filepath.Abs(path)
	if err != nil {
		return nil, err
	}
	source := readKeymapSource(path, replacements)
	nodes := parseKeymapNodes(source.tokens)
	var root *keymapNode
	for _, node := range nodes {
		if node.name == "/" && !node.reference {
			if root != nil {
				fail(path + ": Expected one root / { ... } node")
			}
			root = node
		}
	}
	if root == nil {
		fail(path + ": Expected one root / { ... } node")
	}
	allowedProperties(root)
	sections := map[string]*keymapNode{}
	for _, section := range root.children {
		if !slices.Contains([]string{"macros", "behaviors", "combos", "conditional_layers", "keymap"}, section.name) {
			sourceError(section.token, "Unsupported section %s", section.name)
		}
		if sections[section.name] != nil {
			sourceError(section.token, "Duplicate section %s", section.name)
		}
		sections[section.name] = section
	}
	keymapNode := sections["keymap"]
	if keymapNode == nil {
		fail(path + ": Missing keymap node")
	}
	for _, node := range root.children {
		expected := map[string]string{"keymap": "zmk,keymap", "combos": "zmk,combos", "conditional_layers": "zmk,conditional-layers"}[node.name]
		if expected == "" {
			allowedProperties(node)
		} else {
			allowedProperties(node, "compatible")
			if textProperty(node, "compatible") != expected {
				sourceError(node.token, "Expected compatible = %s", expected)
			}
		}
	}
	l := loader{keymapNode: keymapNode, definitions: map[string]definition{}, config: Keymap{
		Layers: []Layer{}, Macros: []MacroDefinition{}, ModMorphs: []ModMorphDefinition{}, HoldTaps: []HoldTapDefinition{}, TapDances: []TapDanceDefinition{}, Combos: []ComboDefinition{}, ConditionalLayers: []ConditionalLayerDefinition{},
	}}
	for _, sectionName := range []string{"macros", "behaviors"} {
		section := sections[sectionName]
		if section == nil {
			continue
		}
		for _, node := range section.children {
			if node.label == "" {
				sourceError(node.token, "Behavior needs a node label before ':'")
			}
			_, defined := l.definitions[node.label]
			_, builtin := builtinCells[node.label]
			if defined || builtin || node.label == "bt" {
				sourceError(node.token, "Duplicate or reserved behavior label %s", node.label)
			}
			if len(node.children) > 0 {
				sourceError(node.token, "Nested behavior nodes are not supported")
			}
			kind := textProperty(node, "compatible")
			cells := numberProperty(node, "#binding-cells")
			expected := map[string]int{"zmk,behavior-macro": 0, "zmk,behavior-macro-one-param": 1, "zmk,behavior-macro-two-param": 2, "zmk,behavior-hold-tap": 2, "zmk,behavior-mod-morph": 0, "zmk,behavior-tap-dance": 0}
			count, ok := expected[kind]
			if !ok {
				sourceError(node.token, "Unsupported behavior compatible %s", kind)
			}
			if cells != count {
				sourceError(node.token, "Wrong #binding-cells for %s", kind)
			}
			l.definitions[node.label] = definition{node: node, kind: kind, cells: cells}
			l.definitionNames = append(l.definitionNames, node.label)
		}
	}
	visited := map[string]bool{}
	for _, name := range l.definitionNames {
		l.checkCycle(name, nil, visited)
	}
	for _, node := range nodes {
		if node == root {
			continue
		}
		if !node.reference || node.name != "lt" || len(node.children) > 0 {
			sourceError(node.token, "Only the built-in &lt override is supported at the top level")
		}
		if hasProperty(node, "compatible") || hasProperty(node, "#binding-cells") {
			sourceError(node.token, "The built-in &lt type and #binding-cells cannot be changed")
		}
		for _, d := range l.config.HoldTaps {
			if d.Name == "lt" {
				sourceError(node.token, "Duplicate &lt override")
			}
		}
		if hasProperty(node, "bindings") {
			sourceError(node.token, "Changing built-in &lt bindings is not supported; define a named behavior")
		}
		l.parseHoldTap(node, "lt", true)
	}
	for _, name := range l.definitionNames {
		l.parseDefinition(name)
	}
	layerBindings := [][]BindingSource{}
	layerNames := map[string]bool{}
	for _, node := range keymapNode.children {
		allowedProperties(node, "bindings")
		if len(node.children) > 0 {
			sourceError(node.token, "Nested layer nodes are not supported")
		}
		name := node.displayLabel
		if name == "" {
			name = node.name
		}
		constantName := "LAYER_" + strings.ToUpper(node.name)
		if constant, ok := source.constants[constantName]; ok {
			if len(constant) != 1 || nonnegative(constant[0].text, node.token) != len(l.config.Layers) {
				sourceError(node.token, "%s must equal declaration index %d; update layer constants when reordering layers", constantName, len(l.config.Layers))
			}
		}
		if layerNames[strings.ToLower(name)] {
			sourceError(node.token, "Duplicate layer name %s", name)
		}
		layerNames[strings.ToLower(name)] = true
		bindings := flatBindings(l.checkedBindings(node))
		if len(bindings) != KeyCount {
			sourceError(node.token, "Layer %s needs 80 bindings, got %d", name, len(bindings))
		}
		layer := Layer{Name: name, Keys: make([]Key, len(bindings))}
		ranges := make([]BindingSource, len(bindings))
		for i, binding := range bindings {
			layer.Keys[i] = l.key(binding)
			ranges[i] = binding.source
		}
		l.config.Layers = append(l.config.Layers, layer)
		layerBindings = append(layerBindings, ranges)
	}
	if len(l.config.Layers) == 0 {
		sourceError(keymapNode.token, "Keymap needs at least one layer")
	}
	if section := sections["combos"]; section != nil {
		for _, node := range section.children {
			if len(node.children) > 0 {
				sourceError(node.token, "Nested combo nodes are not supported")
			}
			allowedProperties(node, "key-positions", "bindings", "timeout-ms", "require-prior-idle-ms", "layers")
			bindings := flatBindings(l.checkedBindings(node))
			positions := numbers(node, "key-positions")
			seen := map[int]bool{}
			valid := true
			for _, pos := range positions {
				if pos >= KeyCount || seen[pos] {
					valid = false
				}
				seen[pos] = true
			}
			if len(bindings) != 1 || len(positions) < 2 || !valid {
				sourceError(node.token, "Combo needs one binding and distinct valid key positions")
			}
			var layers []int
			if hasProperty(node, "layers") {
				layers = numbers(node, "layers")
				for _, layer := range layers {
					if layer >= len(l.config.Layers) {
						sourceError(node.token, "Combo layer index out of range")
					}
				}
			}
			l.config.Combos = append(l.config.Combos, ComboDefinition{Name: node.name, KeyPositions: positions, Binding: bindingText(bindings[0]), TimeoutMs: optionalNumber(node, "timeout-ms"), RequirePriorIdleMs: optionalNumber(node, "require-prior-idle-ms"), Layers: layers})
		}
	}
	if section := sections["conditional_layers"]; section != nil {
		for _, node := range section.children {
			if len(node.children) > 0 {
				sourceError(node.token, "Nested conditional layer nodes are not supported")
			}
			allowedProperties(node, "if-layers", "then-layer")
			ifLayers := numbers(node, "if-layers")
			thenLayer := numberProperty(node, "then-layer")
			valid := len(ifLayers) >= 2 && thenLayer < len(l.config.Layers)
			for _, layer := range ifLayers {
				if layer >= len(l.config.Layers) {
					valid = false
				}
			}
			if !valid {
				sourceError(node.token, "Conditional layer indices must refer to existing layers")
			}
			l.config.ConditionalLayers = append(l.config.ConditionalLayers, ConditionalLayerDefinition{Name: node.name, IfLayers: ifLayers, ThenLayer: thenLayer})
		}
	}
	return &Document{Path: path, Config: l.config, Sources: source.sources, Resolutions: source.resolutions, Bindings: layerBindings}, nil
}

func (l *loader) checkCycle(name string, stack []string, visited map[string]bool) {
	node := l.definitions[name].node
	if slices.Contains(stack, name) {
		sourceError(node.token, "Recursive behavior reference: %s", strings.Join(append(slices.Clone(stack), name), " -> "))
	}
	if visited[name] {
		return
	}
	if len(stack) > 256 {
		sourceError(node.token, "Behavior nesting limit exceeded")
	}
	for _, group := range groups(node, "bindings") {
		for _, binding := range bindingsIn(group) {
			if _, ok := l.definitions[binding.name]; ok {
				l.checkCycle(binding.name, append(slices.Clone(stack), name), visited)
			}
		}
	}
	visited[name] = true
}

func (l *loader) cells(name string) (int, bool) {
	if d, ok := l.definitions[name]; ok {
		return d.cells, true
	}
	value, ok := builtinCells[name]
	return value, ok
}

func (l *loader) validateBinding(b binding) {
	if b.name == "bt" && !slices.Contains([]string{"BT_SEL", "BT_CLR", "BT_CLR_ALL", "BT_NXT", "BT_PRV", "BT_DISC"}, argumentAt(b, 0)) {
		sourceError(b.token, "Unknown Bluetooth action %s", argumentAt(b, 0))
	}
	if b.name == "out" && !slices.Contains([]string{"OUT_BLE", "OUT_USB"}, argumentAt(b, 0)) {
		sourceError(b.token, "Unknown output %s", argumentAt(b, 0))
	}
	cells, known := l.cells(b.name)
	if b.name == "bt" {
		known = true
		cells = 1
		if slices.Contains([]string{"BT_SEL", "BT_DISC"}, argumentAt(b, 0)) {
			cells = 2
		}
	}
	if !known {
		sourceError(b.token, "Unknown behavior &%s", b.name)
	}
	if len(b.args) != cells {
		sourceError(b.token, "&%s expects %d arguments, got %d", b.name, cells, len(b.args))
	}
	if slices.Contains([]string{"mo", "to", "sl", "tog", "lt"}, b.name) && len(b.args) > 0 {
		layer := nonnegative(b.args[0], b.token)
		if layer >= len(l.keymapNode.children) {
			sourceError(b.token, "Layer index out of range: %d", layer)
		}
	}
	if b.name == "bt" && len(b.args) > 1 {
		nonnegative(b.args[1], b.token)
	}
	if custom, ok := l.definitions[b.name]; ok && custom.kind == "zmk,behavior-hold-tap" {
		index := 0
		for _, group := range groups(custom.node, "bindings") {
			for _, target := range bindingsIn(group) {
				if slices.Contains([]string{"mo", "to", "sl", "tog"}, target.name) {
					forwarded := b
					forwarded.name = target.name
					forwarded.args = []string{argumentAt(b, index)}
					l.validateBinding(forwarded)
				}
				index++
			}
		}
	}
}

func (l *loader) checkedBindings(node *keymapNode) [][]binding {
	result := [][]binding{}
	for _, group := range groups(node, "bindings") {
		values := bindingsIn(group)
		if len(values) == 0 {
			sourceError(node.token, "Empty bindings group")
		}
		for _, binding := range values {
			l.validateBinding(binding)
		}
		result = append(result, values)
	}
	return result
}

func (l *loader) parseHoldTap(node *keymapNode, name string, inherited bool) {
	allowedProperties(node, "compatible", "#binding-cells", "flavor", "tapping-term-ms", "quick-tap-ms", "require-prior-idle-ms", "bindings", "hold-trigger-key-positions", "hold-trigger-on-release")
	flavor := textProperty(node, "flavor")
	if !slices.Contains([]string{"balanced", "tap-preferred", "hold-preferred"}, flavor) {
		sourceError(node.token, "Unsupported hold-tap flavor %s", flavor)
	}
	bindings := []string{"&mo", "&kp"}
	if !inherited {
		bindings = nil
		for _, group := range groups(node, "bindings") {
			values := bindingsIn(group)
			if len(values) != 1 || len(values[0].args) != 0 {
				sourceError(node.token, "Hold-tap bindings must be two parameterless behavior references")
			}
			binding := values[0]
			cells, known := l.cells(binding.name)
			if !known || cells > 1 {
				sourceError(binding.token, "Hold-tap target must take zero or one argument")
			}
			bindings = append(bindings, bindingText(binding))
		}
	}
	if len(bindings) != 2 {
		sourceError(node.token, "Hold-tap requires two bindings")
	}
	var positions []int
	if hasProperty(node, "hold-trigger-key-positions") {
		positions = numbers(node, "hold-trigger-key-positions")
		for _, pos := range positions {
			if pos >= KeyCount {
				sourceError(node.token, "Hold trigger position out of range")
			}
		}
	}
	if len(node.properties["hold-trigger-on-release"]) > 0 {
		sourceError(node.token, "hold-trigger-on-release is a boolean property")
	}
	l.config.HoldTaps = append(l.config.HoldTaps, HoldTapDefinition{Name: name, Label: node.displayLabel, Flavor: flavor, TappingTermMs: numberProperty(node, "tapping-term-ms"), HoldBinding: bindings[0], TapBinding: bindings[1], QuickTapMs: optionalNumber(node, "quick-tap-ms"), RequirePriorIdleMs: optionalNumber(node, "require-prior-idle-ms"), HoldTriggerKeyPositions: positions, HoldTriggerOnRelease: hasProperty(node, "hold-trigger-on-release")})
}

func (l *loader) parseDefinition(name string) {
	d := l.definitions[name]
	node := d.node
	switch {
	case strings.HasPrefix(d.kind, "zmk,behavior-macro"):
		allowedProperties(node, "compatible", "#binding-cells", "bindings", "wait-ms", "tap-ms")
		steps := []MacroStep{}
		for _, group := range l.checkedBindings(node) {
			directive := strings.TrimPrefix(group[0].name, "macro_")
			step := MacroStep{Directive: directive}
			if slices.Contains([]string{"tap", "press", "release"}, directive) {
				if len(group) < 2 {
					sourceError(node.token, "Macro action requires bindings")
				}
				for _, binding := range group[1:] {
					step.Bindings = append(step.Bindings, bindingText(binding))
				}
			} else {
				if !slices.Contains([]string{"pause_for_release", "param_1to1", "param_2to1"}, directive) || len(group) != 1 {
					sourceError(node.token, "Unsupported macro directive group &%s", group[0].name)
				}
				if directive == "param_1to1" && d.cells < 1 || directive == "param_2to1" && d.cells < 2 {
					sourceError(node.token, "Macro parameter control exceeds #binding-cells")
				}
			}
			steps = append(steps, step)
		}
		l.config.Macros = append(l.config.Macros, MacroDefinition{Name: name, Label: node.displayLabel, Steps: steps, BindingCells: d.cells, WaitMs: optionalNumber(node, "wait-ms"), TapMs: optionalNumber(node, "tap-ms")})
	case d.kind == "zmk,behavior-hold-tap":
		l.parseHoldTap(node, name, false)
	case d.kind == "zmk,behavior-mod-morph":
		allowedProperties(node, "compatible", "#binding-cells", "bindings", "mods")
		bindings := flatBindings(l.checkedBindings(node))
		if len(bindings) != 2 {
			sourceError(node.token, "Mod-morph requires two bindings")
		}
		var expression strings.Builder
		for _, group := range groups(node, "mods") {
			for _, token := range group {
				expression.WriteString(token.text)
			}
		}
		mods := strings.Split(strings.TrimSuffix(strings.TrimPrefix(expression.String(), "("), ")"), "|")
		for _, mod := range mods {
			if !modifierPattern.MatchString(mod) {
				sourceError(node.token, "Expected modifier flags in mods")
			}
		}
		l.config.ModMorphs = append(l.config.ModMorphs, ModMorphDefinition{Name: name, Label: node.displayLabel, DefaultBinding: bindingText(bindings[0]), MorphBinding: bindingText(bindings[1]), Mods: mods})
	default:
		allowedProperties(node, "compatible", "#binding-cells", "bindings", "tapping-term-ms")
		bindings := []string{}
		for _, binding := range flatBindings(l.checkedBindings(node)) {
			bindings = append(bindings, bindingText(binding))
		}
		if len(bindings) < 2 {
			sourceError(node.token, "Tap dance requires at least two bindings")
		}
		l.config.TapDances = append(l.config.TapDances, TapDanceDefinition{Name: name, Label: node.displayLabel, Bindings: bindings, TappingTermMs: optionalNumber(node, "tapping-term-ms")})
	}
}

func (l *loader) behavior(b binding) Behavior {
	first, second := argumentAt(b, 0), argumentAt(b, 1)
	if d, ok := l.definitions[b.name]; ok {
		switch {
		case strings.HasPrefix(d.kind, "zmk,behavior-macro"):
			return Behavior{Type: "macro", MacroName: b.name, Param: first, Param2: second}
		case d.kind == "zmk,behavior-mod-morph":
			return Behavior{Type: "mod_morph", Name: b.name}
		case d.kind == "zmk,behavior-tap-dance":
			return Behavior{Type: "tap_dance", Name: b.name}
		case d.kind == "zmk,behavior-hold-tap":
			return Behavior{Type: "hold_tap", Name: b.name, Param1: first, Param2: second}
		}
	}
	switch b.name {
	case "kp":
		return Behavior{Type: "kp", KeyCode: first}
	case "mo", "to", "tog", "sl":
		return Behavior{Type: b.name, LayerIndex: nonnegative(first, b.token)}
	case "trans", "none", "bootloader", "sys_reset", "caps_word":
		return Behavior{Type: b.name}
	case "bt":
		value := Behavior{Type: "bt", Action: first}
		if second != "" {
			number := nonnegative(second, b.token)
			value.ProfileIndex = &number
		}
		return value
	case "rgb_ug", "out":
		return Behavior{Type: b.name, Action: first}
	case "mmv":
		if precise := preciseMovementPattern.FindStringSubmatch(first); precise != nil {
			// Only the sign is needed; preserve JavaScript's handling of negative zero.
			negative := strings.HasPrefix(precise[2], "-") && strings.Trim(precise[2], "-0") != ""
			direction := "RIGHT"
			if negative {
				direction = "LEFT"
			}
			if precise[1] == "Y" {
				direction = "DOWN"
				if negative {
					direction = "UP"
				}
			}
			return Behavior{Type: "mmv", Direction: "MOVE_" + direction, Precision: true}
		}
		return Behavior{Type: "mmv", Direction: first}
	case "msc":
		return Behavior{Type: "msc", Direction: first}
	case "mkp":
		return Behavior{Type: "mkp", Button: first}
	default:
		sourceError(b.token, "Behavior &%s cannot be used directly as a layer key", b.name)
	}
	panic("unreachable")
}

func (l *loader) key(b binding) Key {
	if b.name == "lt" {
		return Key{Tap: Behavior{Type: "kp", KeyCode: b.args[1]}, Hold: &Behavior{Type: "mo", LayerIndex: nonnegative(b.args[0], b.token)}}
	}
	if b.name == "mt" {
		return Key{Tap: Behavior{Type: "kp", KeyCode: b.args[1]}, Hold: &Behavior{Type: "kp", KeyCode: b.args[0]}}
	}
	for _, holdTap := range l.config.HoldTaps {
		if holdTap.Name != b.name || holdTap.HoldBinding != "&mo" {
			continue
		}
		layerIndex := nonnegative(b.args[0], b.token)
		if layerIndex >= len(l.keymapNode.children) {
			sourceError(b.token, "Layer index out of range: %d", layerIndex)
		}
		target := strings.TrimPrefix(holdTap.TapBinding, "&")
		cells, _ := l.cells(target)
		tapBinding := b
		tapBinding.name = target
		tapBinding.args = nil
		if cells != 0 {
			tapBinding.args = []string{b.args[1]}
		}
		tap := l.behavior(tapBinding)
		// Magic remains a named hold-tap in the display while its layer is validated.
		if b.name != "magic" {
			return Key{Tap: tap, Hold: &Behavior{Type: "mo", LayerIndex: layerIndex}}
		}
	}
	return Key{Tap: l.behavior(b)}
}
