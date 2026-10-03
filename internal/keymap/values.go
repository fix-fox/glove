package keymap

import (
	"encoding/json"
	"regexp"
	"slices"
	"strconv"
	"strings"
)

type binding struct {
	name    string
	keyName string
	args    []string
	token   sourceToken
	source  BindingSource
}

func property(node *keymapNode, name string) []sourceToken {
	value, ok := node.properties[name]
	if !ok {
		sourceError(node.token, "Missing %s in %s", name, node.name)
	}
	return value
}

func hasProperty(node *keymapNode, name string) bool { _, ok := node.properties[name]; return ok }

func textProperty(node *keymapNode, name string) string {
	value := property(node, name)
	if len(value) != 1 || !strings.HasPrefix(value[0].text, "\"") {
		sourceError(node.token, "%s must be one string", name)
	}
	var text string
	if err := json.Unmarshal([]byte(value[0].text), &text); err != nil {
		sourceError(value[0], "Invalid quoted string")
	}
	return text
}

// groups checks every delimiter rather than silently dropping unsupported syntax.
func groups(node *keymapNode, name string) [][]sourceToken {
	tokens := property(node, name)
	result := [][]sourceToken{}
	for index := 0; index < len(tokens); {
		if tokens[index].text != "<" {
			sourceError(tokens[index], "Expected < in %s", name)
		}
		index++
		group := []sourceToken{}
		for index < len(tokens) && tokens[index].text != ">" {
			group = append(group, tokens[index])
			index++
		}
		if index >= len(tokens) {
			sourceError(node.token, "Unclosed < in %s", name)
		}
		index++
		result = append(result, group)
		if index == len(tokens) {
			break
		}
		if tokens[index].text != "," || index+1 == len(tokens) {
			sourceError(node.token, "Expected another comma-separated <...> group in %s", name)
		}
		index++
	}
	if len(result) == 0 {
		sourceError(node.token, "Empty %s", name)
	}
	return result
}

var (
	argumentPattern        = regexp.MustCompile(`^(?:[A-Za-z_]\w*|\d+|0[xX][\da-fA-F]+|\()$`)
	digitsPattern          = regexp.MustCompile(`^\d+$`)
	integerPattern         = regexp.MustCompile(`^(?:0|[1-9]\d*|0[xX][\da-fA-F]+)$`)
	namePattern            = regexp.MustCompile(`^[A-Za-z_]\w*$`)
	modifierPattern        = regexp.MustCompile(`^MOD_[LR](SFT|CTL|ALT|GUI)$`)
	preciseMovementPattern = regexp.MustCompile(`^MOVE_([XY])\((-?\d+)\)$`)
)

// argumentsFrom keeps nested C modifier calls as a single semantic argument.
func argumentsFrom(tokens []sourceToken) []string {
	result := []string{}
	for index := 0; index < len(tokens); {
		token := tokens[index]
		index++
		text := token.text
		if text == "-" && index < len(tokens) && digitsPattern.MatchString(tokens[index].text) {
			text += tokens[index].text
			index++
		} else if !argumentPattern.MatchString(text) {
			sourceError(token, "Unsupported binding argument %s", text)
		}
		depth := 0
		if text == "(" {
			depth = 1
		}
		if depth == 0 && index < len(tokens) && tokens[index].text == "(" {
			text += "("
			index++
			depth = 1
		}
		var expr strings.Builder
		expr.WriteString(text)
		for depth > 0 {
			if index >= len(tokens) {
				sourceError(token, "Unclosed parenthesized argument")
			}
			next := tokens[index]
			index++
			if next.text == "(" {
				depth++
			}
			if next.text == ")" {
				depth--
			}
			if slices.Contains([]string{"&", "<", ">", ";"}, next.text) {
				sourceError(next, "Invalid argument expression")
			}
			expr.WriteString(next.text)
		}
		result = append(result, expr.String())
	}
	return result
}

func nonnegative(value string, token sourceToken) int {
	if !integerPattern.MatchString(value) {
		sourceError(token, "Expected a decimal or hexadecimal nonnegative integer without leading zeroes, got %s", value)
	}
	base, digits := 10, value
	if strings.HasPrefix(value, "0x") || strings.HasPrefix(value, "0X") {
		base, digits = 16, value[2:]
	}
	number, err := strconv.ParseUint(digits, base, 64)
	if err != nil || number > (1<<53)-1 || uint64(int(number)) != number {
		sourceError(token, "Integer out of range: %s", value)
	}
	return int(number)
}

func numbers(node *keymapNode, name string) []int {
	value := groups(node, name)
	if len(value) != 1 {
		sourceError(node.token, "%s requires one <...> group", name)
	}
	result := []int{}
	for _, v := range argumentsFrom(value[0]) {
		result = append(result, nonnegative(v, node.token))
	}
	return result
}

func numberProperty(node *keymapNode, name string) int {
	values := numbers(node, name)
	if len(values) != 1 {
		sourceError(node.token, "%s requires exactly one integer", name)
	}
	return values[0]
}

func optionalNumber(node *keymapNode, name string) *int {
	if !hasProperty(node, name) {
		return nil
	}
	value := numberProperty(node, name)
	return &value
}

func bindingsIn(group []sourceToken) []binding {
	result := []binding{}
	for index := 0; index < len(group); {
		token := group[index]
		index++
		var annotation sourceToken
		if isKeyName(token) {
			annotation = token
			if index >= len(group) {
				sourceError(token, "Orphan @name annotation: expected a literal layer binding")
			}
			token = group[index]
			index++
			if isKeyName(token) {
				sourceError(token, "Duplicate @name annotation for one binding")
			}
			if token.text != "&" {
				sourceError(token, "@name must appear immediately before a literal layer binding")
			}
		}
		if token.text != "&" {
			sourceError(token, "Expected a behavior reference beginning with &")
		}
		if index >= len(group) || !namePattern.MatchString(group[index].text) {
			sourceError(token, "Expected behavior name after &")
		}
		name := group[index]
		index++
		params := []sourceToken{}
		for index < len(group) && group[index].text != "&" && !isKeyName(group[index]) {
			params = append(params, group[index])
			index++
		}
		last := name
		if len(params) > 0 {
			last = params[len(params)-1]
		}
		source := BindingSource{File: token.file, Start: token.start, End: last.end, Editable: !token.expanded && !name.expanded && last.file == token.file}
		keyName := ""
		if isKeyName(annotation) {
			if !source.Editable || annotation.expanded || annotation.file != token.file || annotation.end > token.start {
				sourceError(annotation, "@name annotations cannot name a shared macro; use a literal layer binding")
			}
			keyName = strings.TrimPrefix(annotation.text, keyNamePrefix)
			source.NameStart, source.NameEnd = annotation.start, annotation.end
		}
		result = append(result, binding{name: name.text, keyName: keyName, args: argumentsFrom(params), token: token, source: source})
	}
	return result
}

func bindingText(binding binding) string {
	return strings.Join(append([]string{"&" + binding.name}, binding.args...), " ")
}

func allowedProperties(node *keymapNode, names ...string) {
	for _, name := range node.propertyNames {
		if !slices.Contains(names, name) {
			sourceError(node.token, "Unsupported property %s in %s", name, node.name)
		}
	}
}

var builtinCells = map[string]int{
	"kp": 1, "mo": 1, "to": 1, "sl": 1, "tog": 1, "trans": 0, "none": 0, "bootloader": 0,
	"sys_reset": 0, "caps_word": 0, "rgb_ug": 1, "out": 1, "mmv": 1, "msc": 1, "mkp": 1,
	"lt": 2, "mt": 2, "macro_tap": 0, "macro_press": 0, "macro_release": 0,
	"macro_pause_for_release": 0, "macro_param_1to1": 0, "macro_param_2to1": 0,
	"macro_wait_time": 1, "macro_tap_time": 1,
}

func argumentAt(b binding, index int) string {
	if index >= len(b.args) {
		return ""
	}
	return b.args[index]
}

func flatBindings(groups [][]binding) []binding {
	var result []binding
	for _, group := range groups {
		result = append(result, group...)
	}
	return result
}
