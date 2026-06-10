import { describe, it, expect, afterEach } from "vitest";
import { bold, cyan, dim, setColorEnabled } from "./color";

afterEach(() => setColorEnabled(null));

describe("color helpers", () => {
  it("are plain text when disabled", () => {
    setColorEnabled(false);
    expect(cyan("hi")).toBe("hi");
    expect(bold("hi")).toBe("hi");
  });

  it("wrap with SGR codes when enabled", () => {
    setColorEnabled(true);
    expect(cyan("hi")).toBe("\x1b[36mhi\x1b[0m");
    expect(bold("hi")).toBe("\x1b[1mhi\x1b[0m");
    expect(dim("hi")).toBe("\x1b[2mhi\x1b[0m");
  });

  it("auto-detection is off in a non-TTY test run", () => {
    // override cleared by afterEach; vitest runs without a TTY
    expect(cyan("hi")).toBe("hi");
  });
});
