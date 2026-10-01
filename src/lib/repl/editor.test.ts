import { afterEach, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { editKeymap, parseEditorCommand } from "./editor";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe("editor argv", () => {
  it("preserves quoted executable paths, arguments, spaces, and empty arguments", () => {
    expect(parseEditorCommand('"/Applications/My Editor/bin/editor" --wait "a b" \'\'')).toEqual([
      "/Applications/My Editor/bin/editor", "--wait", "a b", "",
    ]);
    expect(parseEditorCommand("vim -c 'set number' a\\ b")).toEqual(["vim", "-c", "set number", "a b"]);
  });

  it("rejects malformed commands before spawning", () => {
    expect(() => parseEditorCommand(" ")).toThrow("name an executable");
    expect(() => parseEditorCommand('"" arg')).toThrow("name an executable");
    expect(() => parseEditorCommand("vim 'oops")).toThrow("unclosed quote");
    expect(() => parseEditorCommand("vim \\")).toThrow("incomplete escape");
  });

  it("uses VISUAL before EDITOR and passes the keymap as one argument without a shell", () => {
    vi.stubEnv("VISUAL", '"/my editor" --wait');
    vi.stubEnv("EDITOR", "unused");
    vi.mocked(spawnSync).mockReturnValue({ pid: 1, status: 0, signal: null, output: [], stdout: "", stderr: "" });
    editKeymap("/keymap path/glove80.keymap");
    expect(spawnSync).toHaveBeenCalledWith("/my editor", ["--wait", "/keymap path/glove80.keymap"], {
      stdio: "inherit", shell: false,
    });
  });

  it("uses EDITOR or vi when VISUAL is unset", () => {
    vi.stubEnv("VISUAL", "");
    vi.stubEnv("EDITOR", "vim");
    vi.mocked(spawnSync).mockReturnValue({ pid: 1, status: 0, signal: null, output: [], stdout: "", stderr: "" });
    editKeymap("/map");
    expect(spawnSync).toHaveBeenLastCalledWith("vim", ["/map"], expect.anything());
    vi.stubEnv("EDITOR", "");
    editKeymap("/map");
    expect(spawnSync).toHaveBeenLastCalledWith("vi", ["/map"], expect.anything());
  });

  it("leaves shell operators and substitutions as literal arguments", () => {
    vi.stubEnv("VISUAL", 'vim "$HOME" "$(touch /tmp/nope)" ; echo');
    vi.mocked(spawnSync).mockReturnValue({ pid: 1, status: 0, signal: null, output: [], stdout: "", stderr: "" });
    editKeymap("/map");
    expect(spawnSync).toHaveBeenCalledWith("vim", ["$HOME", "$(touch /tmp/nope)", ";", "echo", "/map"], {
      stdio: "inherit", shell: false,
    });
  });

  it("reports spawn errors and nonzero exits", () => {
    vi.stubEnv("VISUAL", "vim");
    vi.mocked(spawnSync).mockReturnValue({ pid: 1, status: null, signal: null, output: [], stdout: "", stderr: "", error: new Error("missing executable") });
    expect(() => editKeymap("/map")).toThrow("Could not start editor: missing executable");
    vi.mocked(spawnSync).mockReturnValue({ pid: 1, status: 2, signal: null, output: [], stdout: "", stderr: "" });
    expect(() => editKeymap("/map")).toThrow("Editor exited with code 2");
  });
});
