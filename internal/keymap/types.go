// Package keymap reads and safely edits the native ZMK configuration.
package keymap

const KeyCount = 80

// Behavior is the parsed ZMK behavior. Type determines which remaining fields apply.
type Behavior struct {
	Type         string
	KeyCode      string
	Action       string
	Direction    string
	Button       string
	MacroName    string
	Name         string
	Param        string
	Param1       string
	Param2       string
	LayerIndex   int
	ProfileIndex *int
	Precision    bool
}

type Key struct {
	Tap Behavior
	// A nil Hold means holding repeats the tap behavior.
	Hold *Behavior
}

type Layer struct {
	Name string
	Keys []Key
}

type MacroStep struct {
	Directive string
	Bindings  []string
}

type MacroDefinition struct {
	Name  string
	Label string
	// BindingCells is zero for parameterless macros, otherwise one or two.
	BindingCells int
	// Optional timing fields are milliseconds; nil preserves absence, unlike zero.
	WaitMs *int
	TapMs  *int
	Steps  []MacroStep
}

type ModMorphDefinition struct {
	Name           string
	Label          string
	DefaultBinding string
	MorphBinding   string
	Mods           []string
}

type HoldTapDefinition struct {
	Name                    string
	Label                   string
	Flavor                  string
	TappingTermMs           int
	QuickTapMs              *int
	RequirePriorIdleMs      *int
	HoldBinding             string
	TapBinding              string
	HoldTriggerKeyPositions []int
	HoldTriggerOnRelease    bool
}

type TapDanceDefinition struct {
	Name          string
	Label         string
	TappingTermMs *int
	Bindings      []string
}

type ComboDefinition struct {
	Name               string
	KeyPositions       []int
	Binding            string
	TimeoutMs          *int
	RequirePriorIdleMs *int
	// Nil Layers means all layers; an explicitly empty list remains non-nil.
	Layers []int
}

type ConditionalLayerDefinition struct {
	Name      string
	IfLayers  []int
	ThenLayer int
}

// Keymap is a read model. Native files are the only serialized configuration.
type Keymap struct {
	Layers            []Layer
	Macros            []MacroDefinition
	ModMorphs         []ModMorphDefinition
	HoldTaps          []HoldTapDefinition
	TapDances         []TapDanceDefinition
	Combos            []ComboDefinition
	ConditionalLayers []ConditionalLayerDefinition
}

// BindingSource uses byte offsets into Sources, including for Unicode files.
type BindingSource struct {
	File       string
	Start, End int
	// Editable is false for references produced by a shared object macro.
	Editable bool
}

// Document retains every source and resolved include path for stale-write checks.
type Document struct {
	Path        string
	Config      Keymap
	Sources     map[string]string
	Resolutions map[string]string
	Bindings    [][]BindingSource
}
