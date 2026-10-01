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
	if layerIndex < 0 || position < 0 {
		return nil, fmt.Errorf("Invalid layer or key position")
	}
	if document == nil || layerIndex >= len(document.Bindings) || position >= len(document.Bindings[layerIndex]) {
		return nil, fmt.Errorf("Layer or key position is out of range")
	}
	binding := document.Bindings[layerIndex][position]
	if !binding.Editable {
		return nil, fmt.Errorf("This binding comes from a shared macro. Use edit to change it explicitly.")
	}
	if err := AssertUnchanged(document); err != nil {
		return nil, err
	}
	source, ok := document.Sources[binding.File]
	if !ok || binding.Start < 0 || binding.End > len(source) || binding.Start >= binding.End {
		return nil, fmt.Errorf("Invalid binding source range. Run reload before editing.")
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
	if updated == source {
		return document, nil
	}
	candidate, err := load(document.Path, map[string]string{binding.File: updated})
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(binding.File)
	if err != nil {
		return nil, err
	}
	temporary, err := os.CreateTemp(filepath.Dir(binding.File), "."+filepath.Base(binding.File)+".*.tmp")
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
	if err := os.Rename(temporary.Name(), binding.File); err != nil {
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
