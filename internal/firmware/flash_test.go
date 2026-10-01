package firmware

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"runtime"
	"strconv"
	"strings"
	"testing"
	"time"
)

type invocation struct {
	Command string   `json:"command"`
	Args    []string `json:"args"`
}

type flashFixture struct {
	t         *testing.T
	directory string
	log       string
	git       string
	env       []string
}

func repositoryRoot(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot locate repository")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(file), "../.."))
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}

func writeFile(t *testing.T, path, contents string, mode os.FileMode) {
	t.Helper()
	if err := os.WriteFile(path, []byte(contents), mode); err != nil {
		t.Fatal(err)
	}
}

func newFlashFixture(t *testing.T) *flashFixture {
	t.Helper()
	git, err := exec.LookPath("git")
	if err != nil {
		t.Fatal("firmware workflow tests require git:", err)
	}
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	for _, name := range []string{"bin", "scripts", "config"} {
		if err := os.Mkdir(filepath.Join(dir, name), 0755); err != nil {
			t.Fatal(err)
		}
	}
	script, err := os.ReadFile(filepath.Join(repositoryRoot(t), "scripts/glove-flash.sh"))
	if err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(dir, "scripts/glove-flash.sh"), string(script), 0755)
	f := &flashFixture{t: t, directory: dir, log: filepath.Join(dir, "commands.jsonl"), git: git}
	f.env = append(os.Environ(),
		"PATH="+filepath.Join(dir, "bin")+string(os.PathListSeparator)+os.Getenv("PATH"),
		// Each synchronous tool stub runs this test binary. Skip the race runtime's
		// one-second exit delay so dozens of stubs fit the workflow timeout.
		"GORACE="+os.Getenv("GORACE")+" atexit_sleep_ms=0",
		"GIT_CONFIG_GLOBAL=/dev/null", "GIT_CONFIG_SYSTEM=/dev/null",
		"GLOVE_FLASH_HELPER=1", "FLASH_TEST_LOG="+f.log, "FLASH_TEST_GIT="+git,
		"FLASH_TEST_OUTPUT="+filepath.Join(dir, "firmware-output"), "FLASH_TEST_SCENARIO=success",
	)
	f.runGit("init", "-b", "test-fixture")
	f.runGit("config", "user.name", "Flash workflow test")
	f.runGit("config", "user.email", "test@example.invalid")
	writeFile(t, filepath.Join(dir, "config/glove80.keymap"), "fixture\n", 0644)
	writeFile(t, filepath.Join(dir, "config/constants.h"), "#define TERM 250\n", 0644)
	f.runGit("add", "config")
	f.runGit("commit", "-m", "test(keymap): initial fixture")
	stub := func(path, command string) {
		writeFile(t, path, "#!/bin/sh\nexec "+shellQuote(executable)+" -test.run=^TestFlashCommandProcess$ -- "+shellQuote(command)+" \"$@\"\n", 0755)
	}
	for _, command := range []string{"git", "gh", "mktemp", "jq"} {
		stub(filepath.Join(dir, "bin", command), command)
	}
	stub(filepath.Join(dir, "scripts/glove"), "glove")
	stub(filepath.Join(dir, "scripts/zmk-docker-build.sh"), "build")
	return f
}

func (f *flashFixture) runGit(args ...string) string {
	f.t.Helper()
	cmd := exec.Command(f.git, args...)
	cmd.Dir, cmd.Env = f.directory, f.env
	output, err := cmd.CombinedOutput()
	if err != nil {
		f.t.Fatalf("git %v: %v\n%s", args, err, output)
	}
	return strings.TrimSpace(string(output))
}

func (f *flashFixture) calls() []invocation {
	f.t.Helper()
	file, err := os.Open(f.log)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		f.t.Fatal(err)
	}
	defer file.Close()
	decoder := json.NewDecoder(file)
	var calls []invocation
	for {
		var call invocation
		if err := decoder.Decode(&call); err == io.EOF {
			return calls
		} else if err != nil {
			f.t.Fatal(err)
		}
		calls = append(calls, call)
	}
}

func (f *flashFixture) downloads() []invocation {
	var found []invocation
	for _, call := range f.calls() {
		if call.Command == "gh" && len(call.Args) > 1 && call.Args[1] == "download" {
			found = append(found, call)
		}
	}
	return found
}

func (f *flashFixture) flash(args []string, input string, overrides ...string) (int, string) {
	f.t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "bash", append([]string{filepath.Join(f.directory, "scripts/glove-flash.sh")}, args...)...)
	cmd.Dir, cmd.Env, cmd.Stdin = f.directory, append(append([]string{}, f.env...), overrides...), strings.NewReader(input)
	output, err := cmd.CombinedOutput()
	if ctx.Err() != nil {
		f.t.Fatalf("flash timed out: %s", output)
	}
	if err == nil {
		return 0, string(output)
	}
	if exit, ok := err.(*exec.ExitError); ok {
		return exit.ExitCode(), string(output)
	}
	f.t.Fatal(err)
	return -1, string(output)
}

func TestValidationFailureStopsEveryBuildMode(t *testing.T) {
	for _, mode := range []string{"--local", "--remote"} {
		t.Run(mode, func(t *testing.T) {
			f := newFlashFixture(t)
			status, output := f.flash([]string{mode}, "y", "FLASH_TEST_VALIDATION_EXIT=42")
			if status != 42 {
				t.Fatalf("exit = %d, want 42\n%s", status, output)
			}
			want := []invocation{{Command: "glove", Args: []string{"--check-config"}}}
			if !reflect.DeepEqual(f.calls(), want) {
				t.Fatalf("calls = %#v, want %#v", f.calls(), want)
			}
		})
	}
}

func TestDefaultLocalBuildStopsOnFailure(t *testing.T) {
	f := newFlashFixture(t)
	status, output := f.flash(nil, "y")
	if status != 61 {
		t.Fatalf("exit = %d, want 61\n%s", status, output)
	}
	want := invocation{Command: "build", Args: []string{"--board", "glove80_lh", "--output-dir", filepath.Join(f.directory, "firmware-output")}}
	if !containsCall(f.calls(), want) || len(f.downloads()) != 0 {
		t.Fatalf("unexpected build or download calls: %#v", f.calls())
	}
}

func TestRemoteBuildCommitsHeadersAndIncludesAndSelectsNewHead(t *testing.T) {
	f := newFlashFixture(t)
	initialHead := f.runGit("rev-parse", "HEAD")
	writeFile(t, filepath.Join(f.directory, "config/constants.h"), "#define TERM 300\n", 0644)
	f.runGit("add", "config/constants.h")
	writeFile(t, filepath.Join(f.directory, "config/shared.dtsi"), "// new shared behaviors\n", 0644)
	status, output := f.flash([]string{"--remote"}, "yy")
	if status != 73 {
		t.Fatalf("exit = %d, want stopped download (73)\n%s", status, output)
	}
	head := f.runGit("rev-parse", "HEAD")
	if head == initialHead || f.runGit("show", "HEAD:config/constants.h") != "#define TERM 300" || f.runGit("show", "HEAD:config/shared.dtsi") != "// new shared behaviors" {
		t.Fatal("remote build did not commit the complete native configuration")
	}
	for _, want := range []invocation{{Command: "git", Args: []string{"add", "-A", "--", "config"}}, {Command: "git", Args: []string{"push"}}} {
		if !containsCall(f.calls(), want) {
			t.Fatalf("missing call %#v in %#v", want, f.calls())
		}
	}
	if got := selectedCommit(f.calls()); got != head {
		t.Fatalf("selected commit = %q, want %q", got, head)
	}
	downloads := f.downloads()
	if len(downloads) != 1 || !reflect.DeepEqual(downloads[0].Args[:3], []string{"run", "download", "101"}) {
		t.Fatalf("unexpected download selection: %#v", downloads)
	}
}

func TestRemoteBuildRejectsInvalidCommitSelection(t *testing.T) {
	cases := []struct{ scenario, diagnostic string }{
		{"empty", "No firmware build found for current commit"},
		{"wrong-sha", "does not match current commit"},
		{"failed", "failed (status: failure)"},
		{"list-error", ""},
		{"watch-failure", ""},
		{"head-changed", "HEAD changed"},
	}
	for _, tc := range cases {
		t.Run(tc.scenario, func(t *testing.T) {
			f := newFlashFixture(t)
			status, output := f.flash([]string{"--remote"}, "y", "FLASH_TEST_SCENARIO="+tc.scenario)
			if status == 0 || len(f.downloads()) != 0 || selectedCommit(f.calls()) == "" {
				t.Fatalf("unsafe selection: exit %d, calls %#v\n%s", status, f.calls(), output)
			}
			if !strings.Contains(output, tc.diagnostic) {
				t.Fatalf("missing diagnostic %q:\n%s", tc.diagnostic, output)
			}
		})
	}
}

func TestRemoteDownloadRefusal(t *testing.T) {
	for _, full := range []bool{false, true} {
		t.Run(fmt.Sprintf("full=%v", full), func(t *testing.T) {
			f := newFlashFixture(t)
			args := []string{"--remote"}
			if full {
				args = append(args, "--full")
			}
			status, output := f.flash(args, "n")
			if status != 0 || !strings.Contains(output, "Aborted.") || len(f.downloads()) != 0 {
				t.Fatalf("download refusal failed: exit %d\n%s", status, output)
			}
		})
	}
}

func containsCall(calls []invocation, want invocation) bool {
	for _, call := range calls {
		if reflect.DeepEqual(call, want) {
			return true
		}
	}
	return false
}

func selectedCommit(calls []invocation) string {
	for _, call := range calls {
		if call.Command == "gh" && len(call.Args) > 1 && call.Args[1] == "list" {
			for i, argument := range call.Args {
				if argument == "--commit" && i+1 < len(call.Args) {
					return call.Args[i+1]
				}
			}
		}
	}
	return ""
}

// TestFlashCommandProcess supplies isolated command stubs in child test processes.
func TestFlashCommandProcess(t *testing.T) {
	if os.Getenv("GLOVE_FLASH_HELPER") != "1" {
		return
	}
	separator := 0
	for i, arg := range os.Args {
		if arg == "--" {
			separator = i + 1
			break
		}
	}
	if separator == 0 || separator >= len(os.Args) {
		os.Exit(99)
	}
	command, args := os.Args[separator], os.Args[separator+1:]
	if command == "jq" {
		stubJQ(args)
		os.Exit(0)
	}
	log, err := os.OpenFile(os.Getenv("FLASH_TEST_LOG"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		panic(err)
	}
	if err := json.NewEncoder(log).Encode(invocation{Command: command, Args: args}); err != nil {
		panic(err)
	}
	log.Close()
	switch command {
	case "glove":
		exit, _ := strconv.Atoi(os.Getenv("FLASH_TEST_VALIDATION_EXIT"))
		os.Exit(exit)
	case "build":
		os.Exit(61)
	case "mktemp":
		if err := os.Mkdir(os.Getenv("FLASH_TEST_OUTPUT"), 0755); err != nil {
			panic(err)
		}
		fmt.Println(os.Getenv("FLASH_TEST_OUTPUT"))
		os.Exit(0)
	case "git":
		if len(args) > 0 && args[0] == "push" {
			os.Exit(0)
		}
		cmd := exec.Command(os.Getenv("FLASH_TEST_GIT"), args...)
		cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
		if err := cmd.Run(); err != nil {
			if exit, ok := err.(*exec.ExitError); ok {
				os.Exit(exit.ExitCode())
			}
			panic(err)
		}
		os.Exit(0)
	case "gh":
		stubGitHub(args)
	}
	fmt.Fprintln(os.Stderr, "unexpected test command", command, args)
	os.Exit(99)
}

func stubGitHub(args []string) {
	if len(args) < 2 || args[0] != "run" {
		return
	}
	switch args[1] {
	case "list":
		scenario := os.Getenv("FLASH_TEST_SCENARIO")
		if scenario == "list-error" {
			os.Exit(52)
		}
		if scenario == "empty" {
			fmt.Println("[]")
			os.Exit(0)
		}
		sha, err := exec.Command(os.Getenv("FLASH_TEST_GIT"), "rev-parse", "HEAD").Output()
		if err != nil {
			panic(err)
		}
		run := map[string]any{"databaseId": 101, "status": "completed", "conclusion": "success", "headSha": strings.TrimSpace(string(sha)), "headBranch": "test-fixture", "createdAt": "2026-10-01T10:00:00Z", "displayTitle": "Fixture build"}
		if scenario == "wrong-sha" {
			run["headSha"] = strings.Repeat("0", 40)
		}
		if scenario == "failed" {
			run["conclusion"] = "failure"
		}
		if scenario == "watch-failure" {
			run["status"], run["conclusion"] = "in_progress", nil
		}
		if err := json.NewEncoder(os.Stdout).Encode([]any{run}); err != nil {
			panic(err)
		}
		if scenario == "head-changed" {
			cmd := exec.Command(os.Getenv("FLASH_TEST_GIT"), "commit", "--allow-empty", "-m", "test(keymap): concurrent change")
			if output, err := cmd.CombinedOutput(); err != nil {
				panic(fmt.Sprintf("concurrent commit: %v: %s", err, output))
			}
		}
		os.Exit(0)
	case "watch":
		os.Exit(53)
	case "download":
		// Stop before artifact or device access, even for a successful selection.
		os.Exit(73)
	}
}

// stubJQ checks the workflow's exact selectors without requiring jq in the test environment.
func stubJQ(args []string) {
	if len(args) != 2 || args[0] != "-r" {
		panic(fmt.Sprintf("unexpected jq arguments: %v", args))
	}
	allowed := map[string]string{
		".[0].databaseId // empty": "databaseId", ".[0].headSha // empty": "headSha",
		".[0].status": "status", ".[0].conclusion": "conclusion", ".[0].headBranch": "headBranch",
		".[0].createdAt": "createdAt", ".[0].displayTitle": "displayTitle",
	}
	field, ok := allowed[args[1]]
	if !ok {
		panic("unexpected jq selector: " + args[1])
	}
	input, err := io.ReadAll(os.Stdin)
	if err != nil {
		panic(err)
	}
	var runs []map[string]any
	if err := json.NewDecoder(bytes.NewReader(input)).Decode(&runs); err != nil {
		panic(err)
	}
	if len(runs) == 0 {
		return
	}
	if value := runs[0][field]; value != nil {
		fmt.Println(value)
	} else if !strings.HasSuffix(args[1], "// empty") {
		fmt.Println("null")
	}
}
