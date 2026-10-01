package main

import (
	"bufio"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/term"
	"github.com/fix-fox/glove/internal/editor"
	"github.com/fix-fox/glove/internal/keymap"
	"github.com/fix-fox/glove/internal/keymapview"
)

func main() {
	interactive := term.IsTerminal(os.Stdin.Fd()) && term.IsTerminal(os.Stdout.Fd())
	if err := run(os.Args[1:], os.Stdin, os.Stdout, os.Stderr, interactive); err != nil {
		fmt.Fprintln(os.Stderr, "glove:", err)
		os.Exit(1)
	}
}

func run(args []string, input io.Reader, output, diagnostics io.Writer, interactive bool) error {
	flags := flag.NewFlagSet("glove", flag.ContinueOnError)
	flags.SetOutput(diagnostics)
	root := flags.String("root", ".", "checkout containing config/ and scripts/")
	check := flags.Bool("check-config", false, "validate native ZMK configuration and exit")
	frame := flags.Bool("snapshot", false, "print a styled terminal frame and exit")
	width := flags.Int("width", 150, "snapshot width in terminal columns")
	height := flags.Int("height", 46, "snapshot height in terminal rows")
	layer := flags.Int("layer", 0, "initial layer index")
	flags.Usage = func() {
		fmt.Fprintln(diagnostics, "Usage: glove [options] [command [arguments...]]\n\nWithout a command, open the TUI or read commands from stdin.")
		flags.PrintDefaults()
	}
	if err := flags.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return nil
		}
		return err
	}
	if (*check || *frame) && flags.NArg() != 0 || *check && *frame {
		return fmt.Errorf("check-config and snapshot must be used alone")
	}
	if *width < 40 || *height < 22 || *width > 500 || *height > 200 {
		return fmt.Errorf("snapshot size must be 40..500 columns and 22..200 rows")
	}
	absRoot, err := filepath.Abs(*root)
	if err != nil {
		return err
	}
	if interactive && flags.NArg() == 0 && !*frame && !*check {
		m := newModel(absRoot)
		m.layer = *layer
		_, err = tea.NewProgram(m).Run()
		return err
	}
	document, err := keymap.Load(filepath.Join(absRoot, "config", "glove80.keymap"))
	if err != nil {
		return fmt.Errorf("Unable to load keymap: %w", err)
	}
	if *layer < 0 || *layer >= len(document.Config.Layers) {
		return fmt.Errorf("layer index out of range")
	}
	if *check {
		config := document.Config
		definitions := len(config.Macros) + len(config.ModMorphs) + len(config.HoldTaps) + len(config.TapDances) + len(config.Combos) + len(config.ConditionalLayers)
		fmt.Fprintf(output, "Valid keymap: %d layers, %d definitions (%s).\n", len(config.Layers), definitions, document.Path)
		return nil
	}
	if *frame {
		m := newModel(absRoot)
		m.width, m.height, m.layer = *width, *height, *layer
		m.setDocument(document)
		m.busy, m.status = false, "Config loaded"
		fmt.Fprintln(output, m.render())
		return nil
	}
	session := commandSession{root: absRoot, document: document, layer: *layer, side: "both", input: input, output: output, diagnostics: diagnostics, interactive: interactive}
	if flags.NArg() != 0 {
		_, err := session.execute(strings.Join(flags.Args(), " "))
		return err
	}
	scanner := bufio.NewScanner(input)
	scanner.Buffer(make([]byte, 4096), 1024*1024)
	failed := false
	for scanner.Scan() {
		quit, err := session.execute(scanner.Text())
		if err != nil {
			fmt.Fprintln(diagnostics, err)
			failed = true
		}
		if quit {
			break
		}
	}
	if err := scanner.Err(); err != nil {
		return err
	}
	if failed {
		return fmt.Errorf("one or more commands failed")
	}
	return nil
}

type commandSession struct {
	root                string
	document            *keymap.Document
	layer               int
	side                string
	input               io.Reader
	output, diagnostics io.Writer
	interactive         bool
}

// layerAfterReload keeps the selected layer by name when declarations move.
func layerAfterReload(previous *keymap.Document, selected int, next *keymap.Document) int {
	if previous != nil && selected >= 0 && selected < len(previous.Config.Layers) {
		name := previous.Config.Layers[selected].Name
		for i, layer := range next.Config.Layers {
			if layer.Name == name {
				return i
			}
		}
	}
	return min(max(0, selected), len(next.Config.Layers)-1)
}

func (s *commandSession) adopt(document *keymap.Document) {
	s.layer = layerAfterReload(s.document, s.layer, document)
	s.document = document
}

func (s *commandSession) reload() error {
	document, err := keymap.Load(s.document.Path)
	if err == nil {
		s.adopt(document)
	}
	return err
}

func flashCommand(root string, args []string) (*exec.Cmd, error) {
	if _, err := keymap.Load(filepath.Join(root, "config", "glove80.keymap")); err != nil {
		return nil, err
	}
	cmd := exec.Command("bash", append([]string{filepath.Join(root, "scripts", "glove-flash.sh")}, args...)...)
	cmd.Dir = root
	return cmd, nil
}

func (s *commandSession) external(cmd *exec.Cmd, name string) error {
	cmd.Stdin, cmd.Stdout, cmd.Stderr = s.input, s.output, s.diagnostics
	if err := cmd.Run(); err != nil {
		var exit *exec.ExitError
		if errors.As(err, &exit) {
			return fmt.Errorf("%s exited with code %d", name, exit.ExitCode())
		}
		return fmt.Errorf("could not start %s: %w", name, err)
	}
	return nil
}

// execute shares semantic commands with the TUI and preserves a failed session's last good document.
func (s *commandSession) execute(line string) (bool, error) {
	result := keymapview.Dispatch(s.document.Config, line, s.layer, s.side)
	text := result.Text
	switch result.Kind {
	case "quit":
		return true, nil
	case "show-layer":
		s.layer, s.side = result.Index, result.Side
	case "clear-key":
		document, err := keymap.Clear(s.document, result.LayerIndex, result.Position)
		if err != nil {
			return false, err
		}
		if document != s.document {
			text += " (saved native config)"
		}
		s.adopt(document)
	case "reload":
		if err := s.reload(); err != nil {
			return false, err
		}
		text = "Reloaded " + s.document.Path
	case "edit":
		if !s.interactive {
			return false, fmt.Errorf("edit requires an interactive terminal; edit the config directly, then run reload")
		}
		cmd, err := editor.Command(s.document.Path)
		if err != nil {
			return false, err
		}
		cmd.Dir = s.root
		if err := s.external(cmd, "Editor"); err != nil {
			return false, err
		}
		if err := s.reload(); err != nil {
			return false, err
		}
		text = "Reloaded " + s.document.Path
	case "flash":
		if err := s.reload(); err != nil {
			return false, err
		}
		cmd, err := flashCommand(s.root, result.Args)
		if err != nil {
			return false, err
		}
		if err := s.external(cmd, "Flash"); err != nil {
			return false, err
		}
		text = "Flash done"
	case "output":
		if result.Error {
			return false, fmt.Errorf("%s", result.Text)
		}
	default:
		return false, fmt.Errorf("unhandled command action %q", result.Kind)
	}
	if text != "" {
		fmt.Fprintln(s.output, text)
	}
	return false, nil
}
