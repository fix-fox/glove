package keymap

import (
	"fmt"
	"strings"
	"unicode"
	"unicode/utf8"
)

const keyNamePrefix = "@name "

// normalizeKeyName rejects values that could alter a comment or hide its contents.
func normalizeKeyName(name string) (string, error) {
	if !utf8.ValidString(name) {
		return "", fmt.Errorf("Key name must be valid UTF-8")
	}
	for _, r := range name {
		if unicode.IsControl(r) || unicode.Is(unicode.Cf, r) || r == '\u2028' || r == '\u2029' {
			return "", fmt.Errorf("Key name cannot contain control characters or line breaks")
		}
	}
	if strings.Contains(name, "/*") || strings.Contains(name, "*/") {
		return "", fmt.Errorf("Key name cannot contain block-comment delimiters")
	}
	return strings.TrimSpace(name), nil
}

func isKeyName(token sourceToken) bool { return strings.HasPrefix(token.text, keyNamePrefix) }

// keyNameComment recognizes only a leading annotation, preserving ordinary comments.
func keyNameComment(comment string, token sourceToken) (sourceToken, bool) {
	body := comment[2:]
	block := strings.HasPrefix(comment, "/*")
	if block {
		body = body[:len(body)-2]
	}
	trimmed := strings.TrimSpace(body)
	if !strings.HasPrefix(trimmed, "@name") {
		return sourceToken{}, false
	}
	if !block || !strings.HasPrefix(trimmed, keyNamePrefix) {
		sourceError(token, "Key names require an inline block comment: /* @name Copy */")
	}
	if _, err := normalizeKeyName(body); err != nil {
		sourceError(token, "%s", err)
	}
	name, err := normalizeKeyName(strings.TrimPrefix(trimmed, keyNamePrefix))
	if err != nil {
		sourceError(token, "%s", err)
	}
	if name == "" {
		sourceError(token, "The @name annotation needs a nonempty key name")
	}
	token.text = keyNamePrefix + name
	return token, true
}

// validateKeyNameLocations rejects metadata on anything other than layer bindings.
func validateKeyNameLocations(nodes []*keymapNode, keymap *keymapNode) {
	layers := map[*keymapNode]bool{}
	for _, layer := range keymap.children {
		layers[layer] = true
	}
	var visit func(*keymapNode)
	visit = func(node *keymapNode) {
		for _, property := range node.propertyNames {
			for _, token := range node.properties[property] {
				if isKeyName(token) && (!layers[node] || property != "bindings") {
					sourceError(token, "@name annotations are supported only before literal layer bindings")
				}
			}
		}
		for _, child := range node.children {
			visit(child)
		}
	}
	for _, node := range nodes {
		visit(node)
	}
}
