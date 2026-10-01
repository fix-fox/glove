package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"
)

type binding struct {
	Position int    `json:"position"`
	Name     string `json:"name"`
	Tap      string `json:"tap"`
	Hold     string `json:"hold"`
	Kind     string `json:"kind"`
	Detail   string `json:"detail"`
	Source   string `json:"source"`
	Editable bool   `json:"editable"`
}

type layer struct {
	Name string    `json:"name"`
	Keys []binding `json:"keys"`
}

type entity struct {
	Kind   string `json:"kind"`
	Name   string `json:"name"`
	Detail string `json:"detail"`
}

type snapshot struct {
	Revision string   `json:"revision"`
	Path     string   `json:"path"`
	Grid     [][]*int `json:"grid"`
	Layers   []layer  `json:"layers"`
	Entities []entity `json:"entities"`
}

type request struct {
	Action   string `json:"action"`
	Command  string `json:"command,omitempty"`
	Layer    int    `json:"layer"`
	Position int    `json:"position"`
	Revision string `json:"revision,omitempty"`
	Side     string `json:"side,omitempty"`
}

type intent struct {
	Kind       string   `json:"kind"`
	Text       string   `json:"text"`
	Error      bool     `json:"error"`
	Index      int      `json:"index"`
	LayerIndex int      `json:"layerIndex"`
	Position   int      `json:"position"`
	Side       string   `json:"side"`
	Args       []string `json:"args"`
}

type response struct {
	Snapshot *snapshot `json:"snapshot"`
	Result   *intent   `json:"result"`
	Message  string    `json:"message"`
}

// callBridge keeps native ZMK parsing and safe source edits in one implementation.
func callBridge(root string, input request) (response, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	payload := map[string]any{"action": input.Action}
	switch input.Action {
	case "command":
		payload["command"], payload["layer"], payload["side"], payload["revision"] = input.Command, input.Layer, input.Side, input.Revision
	case "clear":
		payload["layer"], payload["position"], payload["revision"] = input.Layer, input.Position, input.Revision
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return response{}, err
	}
	cmd := exec.CommandContext(ctx, "node", "--no-deprecation", "--import=tsx", "scripts/tea-bridge.ts")
	cmd.Dir = root
	cmd.Stdin = bytes.NewReader(body)
	cmd.Env = append(os.Environ(), "NO_COLOR=1")
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	if err := cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return response{}, fmt.Errorf("config request timed out")
		}
		detail := strings.TrimSpace(stderr.String())
		if detail == "" {
			detail = err.Error()
		}
		return response{}, fmt.Errorf("%s", detail)
	}
	var result response
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		return response{}, fmt.Errorf("invalid config bridge response: %w", err)
	}
	if result.Snapshot != nil {
		if err := result.Snapshot.validate(); err != nil {
			return response{}, err
		}
	}
	return result, nil
}

// validate protects navigation and rendering from incomplete bridge snapshots.
func (s snapshot) validate() error {
	if len(s.Layers) == 0 || len(s.Grid) == 0 || s.Revision == "" {
		return fmt.Errorf("config bridge returned an incomplete snapshot")
	}
	seen := make(map[int]bool)
	for _, row := range s.Grid {
		if len(row) != 19 {
			return fmt.Errorf("config bridge returned invalid keyboard geometry")
		}
		for _, pos := range row {
			if pos == nil {
				continue
			}
			if *pos < 0 || *pos >= 80 || seen[*pos] {
				return fmt.Errorf("config bridge returned an invalid or duplicate position")
			}
			seen[*pos] = true
		}
	}
	if len(seen) != 80 {
		return fmt.Errorf("config bridge geometry must contain all 80 keys")
	}
	for _, layer := range s.Layers {
		if len(layer.Keys) != 80 {
			return fmt.Errorf("config bridge layer %s must have 80 keys", layer.Name)
		}
		for i, key := range layer.Keys {
			if key.Position != i {
				return fmt.Errorf("config bridge keys are out of order")
			}
		}
	}
	return nil
}
