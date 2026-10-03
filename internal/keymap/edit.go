package keymap

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// AssertUnchanged refuses edits when any source or include destination changed.
func AssertUnchanged(document *Document) error {
	if document == nil {
		return fmt.Errorf("No keymap is loaded")
	}
	for requested, target := range document.Resolutions {
		current, err := filepath.EvalSymlinks(requested)
		if err != nil {
			return err
		}
		if current != target {
			return fmt.Errorf("%s changed its symlink target. Run reload before editing.", requested)
		}
	}
	for path, source := range document.Sources {
		current, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		if string(current) != source {
			return fmt.Errorf("%s changed on disk. Run reload before editing.", path)
		}
	}
	return nil
}

// Clear replaces one literal reference after validating the complete candidate.
// Byte ranges preserve all other text, and the temporary file is fsynced before
// an atomic rename. Shared macros and comments inside a binding require an editor.
func Clear(document *Document, layerIndex, position int) (*Document, error) {
	binding, source, err := editableBinding(document, layerIndex, position)
	if err != nil {
		return nil, err
	}
	original := source[binding.Start:binding.End]
	if !strings.HasPrefix(original, "&") || strings.Contains(original, "/*") || strings.Contains(original, "//") {
		return nil, fmt.Errorf("This binding contains comments or shared syntax. Use edit to preserve it.")
	}
	replacement := "&none"
	if layerIndex != 0 {
		replacement = "&trans"
	}
	updated := source[:binding.Start] + replacement + source[binding.End:]
	if binding.NameEnd > binding.NameStart {
		end := nameRemovalEnd(binding, source)
		updated = updated[:binding.NameStart] + updated[end:]
	}
	return writeEdit(document, binding.File, updated)
}

// RenameKey sets a per-binding display name; an empty name removes the annotation.
func RenameKey(document *Document, layerIndex, position int, name string) (*Document, error) {
	name, err := normalizeKeyName(name)
	if err != nil {
		return nil, err
	}
	binding, source, err := editableBinding(document, layerIndex, position)
	if err != nil {
		return nil, err
	}
	if source[binding.Start] != '&' {
		return nil, fmt.Errorf("This binding contains shared syntax. Use edit to preserve it.")
	}
	start, end := binding.NameStart, binding.NameEnd
	replacement := ""
	if name != "" {
		replacement = "/* @name " + name + " */"
	}
	if end == start {
		start, end = binding.Start, binding.Start
		if replacement != "" {
			replacement += " "
		}
	} else if name == "" {
		end = nameRemovalEnd(binding, source)
	} else {
		// Change only the name's text inside a human-formatted annotation.
		comment := source[start:end]
		marker := strings.Index(comment, "@name")
		if !strings.HasPrefix(comment, "/*") || !strings.HasSuffix(comment, "*/") || marker < 0 {
			return nil, fmt.Errorf("Invalid key name source range. Run reload before editing.")
		}
		value := comment[marker+len("@name") : len(comment)-2]
		trimmed := strings.TrimSpace(value)
		valueStart := strings.Index(value, trimmed)
		start += marker + len("@name") + valueStart
		end = start + len(trimmed)
		replacement = name
	}
	updated := source[:start] + replacement + source[end:]
	return writeEdit(document, binding.File, updated)
}

// nameRemovalEnd also removes the single separator used by RenameKey's canonical form.
func nameRemovalEnd(binding BindingSource, source string) int {
	end := binding.NameEnd
	if end+1 == binding.Start && source[end:binding.Start] == " " {
		return binding.Start
	}
	return end
}

// editableBinding checks both the selected source range and the complete include graph.
func editableBinding(document *Document, layerIndex, position int) (BindingSource, string, error) {
	if layerIndex < 0 || position < 0 {
		return BindingSource{}, "", fmt.Errorf("Invalid layer or key position")
	}
	if document == nil || layerIndex >= len(document.Bindings) || position >= len(document.Bindings[layerIndex]) {
		return BindingSource{}, "", fmt.Errorf("Layer or key position is out of range")
	}
	binding := document.Bindings[layerIndex][position]
	if !binding.Editable {
		return BindingSource{}, "", fmt.Errorf("This binding comes from a shared macro. Use edit to change it explicitly.")
	}
	if err := AssertUnchanged(document); err != nil {
		return BindingSource{}, "", err
	}
	source, ok := document.Sources[binding.File]
	if !ok || binding.Start < 0 || binding.End > len(source) || binding.Start >= binding.End {
		return BindingSource{}, "", fmt.Errorf("Invalid binding source range. Run reload before editing.")
	}
	if binding.NameStart < 0 || binding.NameEnd < binding.NameStart || binding.NameEnd > binding.Start ||
		(binding.NameStart == binding.NameEnd && binding.NameEnd != 0) {
		return BindingSource{}, "", fmt.Errorf("Invalid key name source range. Run reload before editing.")
	}
	return binding, source, nil
}

// writeEdit validates the candidate, then atomically replaces one unchanged source file.
func writeEdit(document *Document, path, updated string) (*Document, error) {
	if updated == document.Sources[path] {
		return document, nil
	}
	candidate, err := load(document.Path, map[string]string{path: updated})
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	temporary, err := os.CreateTemp(filepath.Dir(path), "."+filepath.Base(path)+".*.tmp")
	if err != nil {
		return nil, err
	}
	defer os.Remove(temporary.Name())
	if err := writeTemporary(temporary, updated, info.Mode().Perm()); err != nil {
		return nil, err
	}
	// Recheck the entire include graph immediately before replacing its one file.
	if err := AssertUnchanged(document); err != nil {
		return nil, err
	}
	if err := os.Rename(temporary.Name(), path); err != nil {
		return nil, err
	}
	return candidate, nil
}

func writeTemporary(file *os.File, text string, mode os.FileMode) (err error) {
	defer func() {
		if closeErr := file.Close(); err == nil {
			err = closeErr
		}
	}()
	if err = file.Chmod(mode); err != nil {
		return err
	}
	if _, err = file.WriteString(text); err != nil {
		return err
	}
	return file.Sync()
}
