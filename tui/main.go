package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"

	tea "charm.land/bubbletea/v2"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "glove-tea:", err)
		os.Exit(1)
	}
}

func run() error {
	root := flag.String("root", ".", "repository containing config/ and scripts/")
	layout := flag.String("layout", "studio", "studio (side inspector) or focus (bottom inspector)")
	keys := flag.String("keys", "tiles", "tiles or compact")
	plainSnapshot := flag.Bool("snapshot", false, "print a styled frame without starting the TUI")
	width := flag.Int("width", 150, "snapshot width in terminal columns")
	height := flag.Int("height", 46, "snapshot height in terminal rows")
	layerIndex := flag.Int("layer", 0, "initial layer index")
	screen := flag.String("screen", "keyboard", "snapshot screen: keyboard, library, search, palette")
	query := flag.String("query", "copy", "initial search query for snapshots")
	flag.Parse()
	if flag.NArg() != 0 || (*layout != "studio" && *layout != "focus") || (*keys != "tiles" && *keys != "compact") {
		return fmt.Errorf("use --layout=studio|focus and --keys=tiles|compact; no positional arguments")
	}
	if *width < 40 || *height < 16 || *width > 500 || *height > 200 {
		return fmt.Errorf("snapshot size must be 40..500 columns and 16..200 rows")
	}
	if *screen != "keyboard" && *screen != "library" && *screen != "search" && *screen != "palette" {
		return fmt.Errorf("unknown screen %q", *screen)
	}
	absRoot, err := filepath.Abs(*root)
	if err != nil {
		return err
	}
	m := newModel(absRoot, *layout, *keys)
	m.width, m.height, m.layer = *width, *height, *layerIndex
	if *plainSnapshot {
		result, err := callBridge(absRoot, request{Action: "snapshot"})
		if err != nil {
			return err
		}
		if result.Snapshot == nil {
			return fmt.Errorf("config bridge returned no snapshot")
		}
		if *layerIndex < 0 || *layerIndex >= len(result.Snapshot.Layers) {
			return fmt.Errorf("layer index out of range")
		}
		m.setSnapshot(result.Snapshot)
		m.busy = false
		m.status = "Config loaded"
		switch *screen {
		case "library":
			m.screen = "library"
		case "palette":
			m.openPalette()
		case "search":
			m.mode = "search"
			m.input.SetValue(*query)
			result, err := callBridge(absRoot, request{Action: "command", Command: "find " + *query, Layer: m.layer, Side: m.side, Revision: m.data.Revision})
			if err != nil {
				return err
			}
			if result.Result != nil {
				m.output = result.Result.Text
			}
		}
		m.resize()
		fmt.Println(m.render())
		return nil
	}
	_, err = tea.NewProgram(m).Run()
	return err
}
