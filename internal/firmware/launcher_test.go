package firmware

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

type launcherFixture struct {
	t      *testing.T
	root   string
	goStub string
}

func newLauncherFixture(t *testing.T) *launcherFixture {
	t.Helper()
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	f := &launcherFixture{t: t, root: root}
	for _, dir := range []string{"scripts", "cmd/glove", "internal/example"} {
		if err := os.MkdirAll(filepath.Join(f.root, dir), 0755); err != nil {
			t.Fatal(err)
		}
	}
	script, err := os.ReadFile(filepath.Join(repositoryRoot(t), "scripts/glove"))
	if err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(f.root, "scripts/glove"), string(script), 0755)
	writeFile(t, filepath.Join(f.root, "go.mod"), "module fixture\n", 0644)
	writeFile(t, filepath.Join(f.root, "go.sum"), "", 0644)
	writeFile(t, filepath.Join(f.root, "cmd/glove/main.go"), "first", 0644)
	f.goStub = filepath.Join(f.root, "go-stub")
	writeFile(t, f.goStub, `#!/bin/sh
set -eu
if [ "$1" != build ] || [ "$2" != -o ] || [ "$4" != ./cmd/glove ]; then
    echo 'unexpected build command' >&2
    exit 89
fi
printf '%s\n' "$*" >> build/build-calls
printf '#!/bin/sh\nprintf '\''%%s\\n'\'' '\''%s'\'' "$@"\n' "$(cat cmd/glove/main.go)" > "$3"
chmod +x "$3"
`, 0755)
	return f
}

func (f *launcherFixture) run(goCommand string, args ...string) (string, error) {
	f.t.Helper()
	cmd := exec.Command(filepath.Join(f.root, "scripts/glove"), args...)
	cmd.Dir = os.TempDir()
	cmd.Env = append(os.Environ(), "GLOVE_GO="+goCommand, "GLOVE_BUILD_ONLY=0")
	output, err := cmd.CombinedOutput()
	return string(output), err
}

func (f *launcherFixture) build() {
	f.t.Helper()
	if output, err := f.run(f.goStub); err != nil {
		f.t.Fatalf("building fixture: %v\n%s", err, output)
	}
}

func TestLauncherUsesCurrentPrebuiltBinaryWithoutGo(t *testing.T) {
	f := newLauncherFixture(t)
	f.build()
	output, err := f.run(filepath.Join(f.root, "missing-go"), "--check-config")
	want := "first\n--root\n" + f.root + "\n--check-config\n"
	if err != nil || output != want {
		t.Fatalf("launch = %q, %v; want %q", output, err, want)
	}
}

func TestLauncherRejectsStalePrebuiltBinaryWithoutGo(t *testing.T) {
	for _, change := range []string{"edit", "add", "remove", "module", "binary", "manifest"} {
		t.Run(change, func(t *testing.T) {
			f := newLauncherFixture(t)
			path := filepath.Join(f.root, "internal/example/example.go")
			writeFile(t, path, "original", 0644)
			f.build()
			switch change {
			case "edit":
				info, err := os.Stat(path)
				if err != nil {
					t.Fatal(err)
				}
				writeFile(t, path, "changed", 0644)
				if err := os.Chtimes(path, info.ModTime(), info.ModTime()); err != nil {
					t.Fatal(err)
				}
			case "add":
				writeFile(t, filepath.Join(f.root, "internal/example/new.go"), "new source", 0644)
			case "remove":
				if err := os.Remove(path); err != nil {
					t.Fatal(err)
				}
			case "module":
				writeFile(t, filepath.Join(f.root, "go.mod"), "module changed\n", 0644)
			case "binary":
				writeFile(t, filepath.Join(f.root, "build/glove"), "#!/bin/sh\necho first\n", 0755)
			case "manifest":
				if err := os.Remove(filepath.Join(f.root, "build/glove.sources")); err != nil {
					t.Fatal(err)
				}
			}
			output, err := f.run(filepath.Join(f.root, "missing-go"))
			if err == nil || !strings.Contains(output, "Go 1.26+ is required to build this checkout") || strings.Contains(output, "first\n") {
				t.Fatalf("stale build was not rejected: %v\n%s", err, output)
			}
		})
	}
}

func TestLauncherRebuildsSourceEditsWithConfiguredGo(t *testing.T) {
	f := newLauncherFixture(t)
	f.build()
	writeFile(t, filepath.Join(f.root, "cmd/glove/main.go"), "second", 0644)
	output, err := f.run(f.goStub, "layers")
	if err != nil || !strings.HasPrefix(output, "second\n") || !strings.HasSuffix(output, "layers\n") {
		t.Fatalf("updated source was not rebuilt: %v\n%s", err, output)
	}
	calls, err := os.ReadFile(filepath.Join(f.root, "build/build-calls"))
	if err != nil || strings.Count(string(calls), "\n") != 2 {
		t.Fatalf("expected two builds, got %q, %v", calls, err)
	}
}

func TestLauncherResolvesCheckoutThroughSymlink(t *testing.T) {
	f := newLauncherFixture(t)
	f.build()
	link := filepath.Join(t.TempDir(), "glove")
	if err := os.Symlink(filepath.Join(f.root, "scripts/glove"), link); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command(link, "layers")
	cmd.Dir = os.TempDir()
	cmd.Env = append(os.Environ(), "GLOVE_GO="+filepath.Join(f.root, "missing-go"), "GLOVE_BUILD_ONLY=0")
	output, err := cmd.CombinedOutput()
	if err != nil || !strings.Contains(string(output), "--root\n"+f.root+"\n") {
		t.Fatalf("symlink did not resolve checkout: %v\n%s", err, output)
	}
}
