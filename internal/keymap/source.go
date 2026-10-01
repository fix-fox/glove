package keymap

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"unicode"
	"unicode/utf8"
)

type sourceToken struct {
	text, file, source string
	start, end         int
	expanded           bool
}

// parseFailure unwinds deeply nested validation while preserving ordinary Go panics.
type parseFailure struct{ error }

func fail(message string) { panic(parseFailure{fmt.Errorf("%s", message)}) }

func sourceError(token sourceToken, format string, args ...any) {
	start := min(token.start, len(token.source))
	prefix := token.source[:start]
	line := strings.Count(prefix, "\n") + 1
	column := utf8.RuneCountInString(prefix[strings.LastIndex(prefix, "\n")+1:]) + 1
	fail(fmt.Sprintf("%s:%d:%d: %s", token.file, line, column, fmt.Sprintf(format, args...)))
}

var (
	wordPattern          = regexp.MustCompile(`^(?:#[a-zA-Z_][\w-]*|[a-zA-Z_][\w-]*|0[xX][\da-fA-F]+|\d+)`)
	quotedPattern        = regexp.MustCompile(`^"(?:[^"\\]|\\.)*"`)
	labelPattern         = regexp.MustCompile(`^//\s*@label\s+(.+?)\s*$`)
	splicePattern        = regexp.MustCompile("\\\\\r?\n")
	commentSplicePattern = regexp.MustCompile("\\\\(?:\r?\n|\r?$)")
	directivePattern     = regexp.MustCompile(`(?m)^[ \t]*#`)
	includePattern       = regexp.MustCompile(`^#\s*include\s*(?:"([^"]+)"|<([^>]+)>)\s*$`)
	definePattern        = regexp.MustCompile(`^#\s*define\s+([A-Za-z_]\w*)(\s+)(.+?)\s*$`)
)

// tokenize retains byte ranges so edits never split UTF-8 text before a binding.
func tokenize(fragment, file, source string, offset int) []sourceToken {
	at := func(text string, start, end int) sourceToken {
		return sourceToken{text: text, file: file, source: source, start: offset + start, end: offset + end}
	}
	if splice := splicePattern.FindStringIndex(fragment); splice != nil {
		sourceError(at("\\", splice[0], splice[0]+1), "Line continuations are supported only inside preprocessor directives")
	}
	tokens := []sourceToken{}
	for index := 0; index < len(fragment); {
		rest := fragment[index:]
		r, n := utf8.DecodeRuneInString(rest)
		if unicode.IsSpace(r) || r == '\uFEFF' {
			index += n
			continue
		}
		switch {
		case strings.HasPrefix(rest, "//"):
			length := strings.IndexByte(rest, '\n')
			if length < 0 {
				length = len(rest)
			}
			if label := labelPattern.FindStringSubmatch(rest[:length]); label != nil {
				tokens = append(tokens, at("@label "+strings.TrimSpace(label[1]), index, index+length))
			}
			index += length
		case strings.HasPrefix(rest, "/*"):
			end := strings.Index(rest[2:], "*/")
			if end < 0 {
				sourceError(at("/*", index, index+2), "Unterminated comment")
			}
			index += end + 4
		case rest[0] == '"':
			value := quotedPattern.FindString(rest)
			if value == "" {
				sourceError(at("\"", index, index+1), "Unterminated string")
			}
			tokens = append(tokens, at(value, index, index+len(value)))
			index += len(value)
		default:
			value := wordPattern.FindString(rest)
			if value == "" && strings.ContainsRune("{};:=<>,&()|+-/", r) {
				value = string(r)
			}
			if value == "" {
				sourceError(at(string(r), index, index+n), "Unsupported character %q", r)
			}
			tokens = append(tokens, at(value, index, index+len(value)))
			index += len(value)
		}
	}
	return tokens
}

var systemIncludes = map[string]bool{
	"behaviors.dtsi": true, "dt-bindings/zmk/keys.h": true, "dt-bindings/zmk/bt.h": true,
	"dt-bindings/zmk/outputs.h": true, "dt-bindings/zmk/rgb.h": true, "dt-bindings/zmk/pointing.h": true,
}

type keymapSource struct {
	tokens               []sourceToken
	sources, resolutions map[string]string
	constants            map[string][]sourceToken
}

type sourceReader struct {
	keymapSource
	definitions     map[string][]sourceToken
	definitionNames []string
	replacements    map[string]string
	included        map[string]bool
	stack           []string
	expansionCount  int
}

func readKeymapSource(path string, replacements map[string]string) keymapSource {
	r := sourceReader{keymapSource: keymapSource{sources: map[string]string{}, resolutions: map[string]string{}, constants: map[string][]sourceToken{}}, definitions: map[string][]sourceToken{}, replacements: replacements, included: map[string]bool{}}
	r.tokens = r.read(path)
	for _, name := range r.definitionNames {
		r.constants[name] = r.expand(r.definitions[name], nil)
	}
	return r.keymapSource
}

func (r *sourceReader) expand(tokens []sourceToken, active []string) []sourceToken {
	result := []sourceToken{}
	for _, token := range tokens {
		definition, ok := r.definitions[token.text]
		if !ok {
			result = append(result, token)
			continue
		}
		if slices.Contains(active, token.text) {
			sourceError(token, "Recursive constant %s", strings.Join(append(slices.Clone(active), token.text), " -> "))
		}
		r.expansionCount++
		if r.expansionCount > 100000 || len(active) > 256 {
			sourceError(token, "Constant expansion limit exceeded")
		}
		expanded := make([]sourceToken, len(definition))
		for i, part := range definition {
			expanded[i] = token
			expanded[i].text = part.text
			expanded[i].expanded = true
		}
		result = append(result, r.expand(expanded, append(slices.Clone(active), token.text))...)
	}
	return result
}

// maskComments prevents commented directives from changing the include graph.
func maskComments(source, file string) string {
	masked := []byte(source)
	for index := 0; index < len(source); {
		rest := source[index:]
		if strings.HasPrefix(rest, "\"") {
			if value := quotedPattern.FindString(rest); value != "" {
				index += len(value)
				continue
			}
		}
		length := 0
		if strings.HasPrefix(rest, "//") {
			length = strings.IndexByte(rest, '\n')
			if length < 0 {
				length = len(rest)
			}
		}
		if strings.HasPrefix(rest, "/*") {
			if end := strings.Index(rest[2:], "*/"); end >= 0 {
				length = end + 4
			}
		}
		if length == 0 {
			index++
			continue
		}
		comment := source[index : index+length]
		if commentSplicePattern.MatchString(comment) {
			sourceError(sourceToken{file: file, source: source, start: index}, "Line continuations inside comments are not supported")
		}
		for i := index; i < index+length; i++ {
			if masked[i] != '\n' {
				masked[i] = ' '
			}
		}
		index += length
	}
	return string(masked)
}

func (r *sourceReader) read(requested string) []sourceToken {
	requested, err := filepath.Abs(requested)
	if err != nil {
		panic(parseFailure{err})
	}
	file, err := filepath.EvalSymlinks(requested)
	if err != nil {
		panic(parseFailure{err})
	}
	r.resolutions[requested] = file
	if slices.Contains(r.stack, file) {
		fail("Include cycle: " + strings.Join(append(slices.Clone(r.stack), file), " -> "))
	}
	if r.included[file] {
		fail("Duplicate include: " + file)
	}
	if len(r.stack) > 256 {
		fail("Include nesting limit exceeded: " + file)
	}
	r.included[file] = true
	r.stack = append(r.stack, file)
	source, replaced := r.replacements[file]
	if !replaced {
		data, err := os.ReadFile(file)
		if err != nil {
			panic(parseFailure{err})
		}
		source = string(data)
	}
	r.sources[file] = source
	masked := maskComments(source, file)
	result := []sourceToken{}
	previous := 0
	for _, match := range directivePattern.FindAllStringIndex(masked, -1) {
		start := match[0]
		if start < previous {
			continue
		}
		// #binding-cells is a devicetree property rather than a preprocessor directive.
		afterHash := masked[match[1]:]
		if strings.HasPrefix(afterHash, "binding-cells") && (len(afterHash) == len("binding-cells") || !isWord(afterHash[len("binding-cells")])) {
			continue
		}
		result = append(result, r.expand(tokenize(source[previous:start], file, source, previous), nil)...)
		end := strings.IndexByte(masked[start:], '\n')
		if end < 0 {
			end = len(masked)
		} else {
			end += start
		}
		for strings.HasSuffix(strings.TrimRightFunc(masked[start:end], unicode.IsSpace), "\\") && end < len(masked) {
			next := strings.IndexByte(masked[end+1:], '\n')
			if next < 0 {
				end = len(masked)
			} else {
				end += next + 1
			}
		}
		raw := source[start:end]
		line := strings.TrimSpace(splicePattern.ReplaceAllString(masked[start:end], " "))
		at := sourceToken{text: raw, file: file, source: source, start: start, end: end}
		include := includePattern.FindStringSubmatch(line)
		define := definePattern.FindStringSubmatch(line)
		switch {
		case include != nil && include[1] != "":
			included := include[1]
			if !filepath.IsAbs(included) {
				included = filepath.Join(filepath.Dir(file), included)
			}
			result = append(result, r.read(included)...)
		case include != nil && include[2] != "":
			if !systemIncludes[include[2]] {
				sourceError(at, "Unsupported system include <%s>; the TUI cannot infer its behaviors", include[2])
			}
		case define != nil:
			if _, ok := r.definitions[define[1]]; ok {
				sourceError(at, "Duplicate constant %s", define[1])
			}
			r.definitions[define[1]] = tokenize(define[3], file, source, start)
			r.definitionNames = append(r.definitionNames, define[1])
		default:
			sourceError(at, "Unsupported directive. Use quoted includes and object-like #define constants; conditionals and function-like macros are not supported by the TUI")
		}
		previous = end
	}
	result = append(result, r.expand(tokenize(source[previous:], file, source, previous), nil)...)
	r.stack = r.stack[:len(r.stack)-1]
	return result
}

func isWord(b byte) bool {
	return b >= 'a' && b <= 'z' || b >= 'A' && b <= 'Z' || b >= '0' && b <= '9' || b == '_'
}

type keymapNode struct {
	name, label, displayLabel string
	reference                 bool
	token                     sourceToken
	properties                map[string][]sourceToken
	propertyNames             []string
	children                  []*keymapNode
}

type nodeParser struct {
	tokens []sourceToken
	index  int
}

func (p *nodeParser) peek() string {
	if p.index >= len(p.tokens) {
		return ""
	}
	return p.tokens[p.index].text
}
func (p *nodeParser) take() sourceToken {
	if p.index >= len(p.tokens) {
		fail("Unexpected end of keymap")
	}
	t := p.tokens[p.index]
	p.index++
	return t
}
func (p *nodeParser) expect(text string) {
	t := p.take()
	if t.text != text {
		sourceError(t, "Expected %s, got %s", text, t.text)
	}
}

func (p *nodeParser) node(depth int) *keymapNode {
	if depth > 256 {
		fail("Node nesting limit exceeded")
	}
	n := &keymapNode{properties: map[string][]sourceToken{}}
	if strings.HasPrefix(p.peek(), "@label ") {
		n.displayLabel = strings.TrimPrefix(p.take().text, "@label ")
	}
	n.token = p.take()
	n.reference = n.token.text == "&"
	n.name = n.token.text
	if n.reference {
		n.name = p.take().text
	}
	if p.peek() == ":" {
		p.take()
		n.label = n.name
		n.name = p.take().text
	}
	p.expect("{")
	for p.peek() != "}" {
		if p.peek() == "" {
			fail("Unclosed node " + n.name)
		}
		next := ""
		if p.index+1 < len(p.tokens) {
			next = p.tokens[p.index+1].text
		}
		if strings.HasPrefix(p.peek(), "@label ") || next == "{" || next == ":" {
			child := p.node(depth + 1)
			for _, previous := range n.children {
				if previous.name == child.name {
					sourceError(child.token, "Duplicate node %s", child.name)
				}
			}
			n.children = append(n.children, child)
			continue
		}
		property := p.take()
		if _, ok := n.properties[property.text]; ok {
			sourceError(property, "Duplicate property %s", property.text)
		}
		value := []sourceToken{}
		if p.peek() == "=" {
			p.take()
			for p.peek() != ";" {
				part := p.take()
				if part.text == "{" || part.text == "}" {
					sourceError(part, "Missing semicolon after %s", property.text)
				}
				value = append(value, part)
			}
			if len(value) == 0 {
				sourceError(property, "Empty value for %s", property.text)
			}
		}
		p.expect(";")
		n.properties[property.text] = value
		n.propertyNames = append(n.propertyNames, property.text)
	}
	p.expect("}")
	p.expect(";")
	return n
}

func parseKeymapNodes(tokens []sourceToken) []*keymapNode {
	p := nodeParser{tokens: tokens}
	nodes := []*keymapNode{}
	for p.peek() != "" {
		nodes = append(nodes, p.node(0))
	}
	return nodes
}
