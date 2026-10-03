package keymapview

import (
	"fmt"
	"strings"

	"github.com/fix-fox/glove/internal/keymap"
)

// SearchTarget addresses a key, layer, or definition without interpreting presentation text.
type SearchTarget struct {
	Kind string
	// LayerIndex and Position apply to key targets; only LayerIndex applies to layer targets.
	LayerIndex, Position int
	// EntityKind and EntityName match Snapshot.Entities for definition targets.
	EntityKind, EntityName string
}

type SearchResult struct {
	Title, Description string
	// Kind is a semantic color category: key, modifier, layer, macro, or empty.
	Kind   string
	Target SearchTarget
}

type bindingSearchMatch struct {
	FindMatch
	target SearchTarget
	kind   string
}

func definitionTarget(kind, name string) SearchTarget {
	return SearchTarget{Kind: "definition", EntityKind: kind, EntityName: DisplayText(name, false)}
}

func definitionKind(kind string) string {
	switch kind {
	case "macro":
		return "macro"
	case "conditional":
		return "layer"
	case "mod-morph", "hold-tap", "tap-dance":
		return "modifier"
	default:
		return "key"
	}
}

// Search combines exact chords and concepts with live partial labels, deduplicated by navigation target.
func Search(config keymap.Keymap, query string) []SearchResult {
	query = DisplayText(strings.TrimSpace(query), false)
	results := []SearchResult{}
	if query == "" {
		return results
	}
	seen := map[SearchTarget]bool{}
	add := func(result SearchResult) {
		if seen[result.Target] {
			return
		}
		seen[result.Target] = true
		if target := result.Target; target.Kind == "key" {
			if name := config.Layers[target.LayerIndex].Keys[target.Position].Name; name != "" {
				result.Title = name + " · " + result.Title
			}
		}
		result.Title = DisplayText(result.Title, false)
		result.Description = DisplayText(result.Description, false)
		results = append(results, result)
	}
	addMatches := func(matches []bindingSearchMatch, hint string) {
		for _, match := range matches {
			description := match.Binding
			if match.Note != "" {
				description += " · " + match.Note
			}
			if hint != "" {
				description += " · " + hint
			}
			add(SearchResult{Title: match.Location, Description: description, Kind: match.kind, Target: match.target})
		}
	}
	if q := ParseFindQuery(query); q != nil {
		addMatches(findBindingMatches(config, *q), "")
	}
	for _, alias := range FindAliases {
		if !strings.Contains(alias.Name, strings.ToLower(query)) {
			continue
		}
		for _, code := range alias.Queries {
			if q := ParseFindQuery(code); q != nil {
				addMatches(findBindingMatches(config, *q), alias.Name+" · "+alias.Hint)
			}
		}
	}
	for _, result := range TextSearch(config, query) {
		if result.Target.Kind != "" {
			kind := definitionKind(result.Target.EntityKind)
			if result.Target.Kind == "layer" {
				kind = "layer"
			}
			add(SearchResult{Title: result.Entity, Kind: kind, Target: result.Target})
		}
		addMatches(result.bindingMatches, "")
	}
	lower := strings.ToLower(query)
	for layerIndex, layer := range config.Layers {
		hebrew := strings.Contains(strings.ToLower(layer.Name), "hebrew")
		for position, key := range layer.Keys {
			labels := presentation(key, config, hebrew)
			kind := labels.tapKind
			hit := strings.Contains(strings.ToLower(labels.tap), lower) || strings.Contains(strings.ToLower(DisplayText(key.Name, false)), lower)
			if !hit && labels.hold != "" && strings.Contains(strings.ToLower(labels.hold), lower) {
				hit = true
				kind = labels.holdKind
			}
			if query == positionName(position) {
				hit = true
			}
			if !hit {
				continue
			}
			description := labels.tap
			if description == "" {
				description = "(none)"
			}
			if labels.hold != "" {
				description += " · hold " + labels.hold
			}
			add(SearchResult{Title: fmt.Sprintf("layer %s · position %d", layer.Name, position), Description: description, Kind: kind, Target: SearchTarget{Kind: "key", LayerIndex: layerIndex, Position: position}})
		}
	}
	return results
}
