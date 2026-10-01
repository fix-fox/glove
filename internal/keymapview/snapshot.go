package keymapview

import (
	"fmt"
	"path/filepath"
	"strings"
	"unicode"

	"github.com/charmbracelet/x/ansi"
	"github.com/fix-fox/glove/internal/keymap"
)

// Snapshot contains presentation data derived from a validated native document.
type Snapshot struct {
	Path     string
	Grid     [][]*int
	Layers   []Layer
	Entities []Entity
}
type Layer struct {
	Name string
	Keys []Binding
}
type Binding struct {
	Position                              int
	Name, Tap, Hold, Kind, Detail, Source string
	// Editable is false for shared macro references and bindings containing comments.
	Editable bool
}
type Entity struct{ Kind, Name, Detail string }

// DisplayText removes terminal controls from configuration text, preserving only requested newlines.
func DisplayText(value string, multiline bool) string {
	return strings.Map(func(r rune) rune {
		if multiline && r == '\n' {
			return r
		}
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, ansi.Strip(value))
}

func relativePath(root, path string) string {
	rel, err := filepath.Rel(root, path)
	if err != nil {
		return path
	}
	return rel
}

func keyKind(key keymap.Key) string {
	if (key.Tap.Type == "none" || key.Tap.Type == "trans") && key.Hold == nil {
		return "empty"
	}
	switch key.Tap.Type {
	case "mo", "to", "tog", "sl":
		return "layer"
	case "macro":
		return "macro"
	case "hold_tap", "mod_morph":
		return "modifier"
	}
	if key.Hold != nil {
		return "modifier"
	}
	return "key"
}

func definitionEntities(config keymap.Keymap) []Entity {
	entities := []Entity{}
	for _, def := range config.Macros {
		detail := MacroDetail(def, "")
		if def.BindingCells > 0 {
			detail += fmt.Sprintf("\n  parameters: %d", def.BindingCells)
		}
		entities = append(entities, Entity{"macro", def.Name, detail})
	}
	for _, def := range config.Combos {
		detail := ComboDetail(config, def)
		if def.RequirePriorIdleMs != nil {
			detail += fmt.Sprintf("\n  prior idle: %dms", *def.RequirePriorIdleMs)
		}
		entities = append(entities, Entity{"combo", def.Name, detail})
	}
	for _, def := range config.HoldTaps {
		lines := []string{"hold-tap " + annotation(def.Name, def.Label), "  hold: " + def.HoldBinding, "  tap: " + def.TapBinding, "  flavor: " + def.Flavor, fmt.Sprintf("  tapping term: %dms", def.TappingTermMs)}
		if def.QuickTapMs != nil {
			lines = append(lines, fmt.Sprintf("  quick tap: %dms", *def.QuickTapMs))
		}
		if def.RequirePriorIdleMs != nil {
			lines = append(lines, fmt.Sprintf("  prior idle: %dms", *def.RequirePriorIdleMs))
		}
		if def.HoldTriggerKeyPositions != nil {
			names := []string{}
			for _, pos := range def.HoldTriggerKeyPositions {
				names = append(names, positionName(pos))
			}
			lines = append(lines, "  hold trigger keys: "+strings.Join(names, ", "))
		}
		if def.HoldTriggerOnRelease {
			lines = append(lines, "  hold trigger on release: true")
		}
		entities = append(entities, Entity{"hold-tap", def.Name, strings.Join(lines, "\n")})
	}
	for _, def := range config.ModMorphs {
		entities = append(entities, Entity{"mod-morph", def.Name, strings.Join([]string{"mod-morph " + annotation(def.Name, def.Label), "  default: " + def.DefaultBinding, "  with " + strings.Join(def.Mods, "+") + ": " + def.MorphBinding}, "\n")})
	}
	for _, def := range config.ConditionalLayers {
		names := []string{}
		for _, index := range def.IfLayers {
			names = append(names, layerName(config, index))
		}
		entities = append(entities, Entity{"conditional", def.Name, "conditional layer " + def.Name + "\n  when: " + strings.Join(names, " + ") + "\n  activate: " + layerName(config, def.ThenLayer)})
	}
	for _, def := range config.TapDances {
		lines := []string{"tap-dance " + annotation(def.Name, def.Label)}
		if def.TappingTermMs != nil {
			lines = append(lines, fmt.Sprintf("  tapping term: %dms", *def.TappingTermMs))
		}
		for i, binding := range def.Bindings {
			plural := "s"
			if i == 0 {
				plural = ""
			}
			lines = append(lines, fmt.Sprintf("  %d tap%s: %s", i+1, plural, binding))
		}
		entities = append(entities, Entity{"tap-dance", def.Name, strings.Join(lines, "\n")})
	}
	for i := range entities {
		entities[i].Name = DisplayText(entities[i].Name, false)
		entities[i].Detail = DisplayText(entities[i].Detail, true)
	}
	return entities
}

// SnapshotFrom keeps native source locations alongside labels so every inspector links to its editable binding.
func SnapshotFrom(doc *keymap.Document, root string) *Snapshot {
	snapshot := &Snapshot{Path: DisplayText(relativePath(root, doc.Path), false), Entities: definitionEntities(doc.Config)}
	for _, row := range Geometry {
		cells := make([]*int, len(row))
		for column, position := range row {
			if position >= 0 {
				p := position
				cells[column] = &p
			}
		}
		snapshot.Grid = append(snapshot.Grid, cells)
	}
	for layerIndex, layer := range doc.Config.Layers {
		view := Layer{Name: DisplayText(layer.Name, false)}
		hebrew := strings.Contains(strings.ToLower(layer.Name), "hebrew")
		for position, key := range layer.Keys {
			tap := BehaviorLabel(key.Tap, doc.Config, hebrew)
			if key.Tap.Type == "trans" {
				tap = "·"
			}
			hold := ""
			if key.Tap.Type == "hold_tap" {
				hold = HoldTapSecondaryLabel(key.Tap.Name, key.Tap.Param1)
			} else if key.Hold != nil {
				hold = BehaviorLabel(*key.Hold, doc.Config, hebrew)
			}
			binding := Binding{Position: position, Name: positionName(position), Tap: DisplayText(tap, false), Hold: DisplayText(hold, false), Kind: keyKind(key), Detail: DisplayText(KeyDetail(doc.Config, layerIndex, position), true)}
			if layerIndex < len(doc.Bindings) && position < len(doc.Bindings[layerIndex]) {
				source := doc.Bindings[layerIndex][position]
				contents := doc.Sources[source.File]
				if source.Start >= 0 && source.Start <= source.End && source.End <= len(contents) {
					line := strings.Count(contents[:source.Start], "\n") + 1
					binding.Source = DisplayText(fmt.Sprintf("%s:%d", relativePath(root, source.File), line), false)
					raw := contents[source.Start:source.End]
					binding.Editable = source.Editable && !strings.Contains(raw, "/*") && !strings.Contains(raw, "//")
				}
			}
			view.Keys = append(view.Keys, binding)
		}
		snapshot.Layers = append(snapshot.Layers, view)
	}
	return snapshot
}
