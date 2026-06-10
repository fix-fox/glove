import { describe, it, expect } from "vitest";
import { displayWidth, padDisplay, padCenter, truncateDisplay, stripAnsi } from "./text-width";

describe("displayWidth", () => {
  it("counts plain ASCII", () => {
    expect(displayWidth("abc")).toBe(3);
  });

  it("strips ANSI escapes", () => {
    expect(displayWidth(`\x1b[36mabc\x1b[0m`)).toBe(3);
  });

  it("ignores variation selectors", () => {
    expect(displayWidth("▶︎")).toBe(1); // ▶ + text-presentation selector
  });

  it("counts Mac symbols and geometric shapes as width 1", () => {
    expect(displayWidth("⌘⌥⌃⇧")).toBe(4);
    expect(displayWidth("◇⇄⇨◆·")).toBe(5);
    expect(displayWidth("A·⌘")).toBe(3);
  });

  it("counts CJK/fullwidth/emoji as width 2", () => {
    expect(displayWidth("中")).toBe(2);
    expect(displayWidth("😀")).toBe(2);
  });

  it("counts Hebrew as width 1", () => {
    expect(displayWidth("שלום")).toBe(4);
  });
});

describe("padDisplay / padCenter", () => {
  it("pads to display width, not string length", () => {
    expect(padDisplay("⌘C", 5)).toBe("⌘C   ");
    expect(padCenter("⌘C", 6)).toBe("  ⌘C  ");
  });

  it("centers with the extra space on the right", () => {
    expect(padCenter("ab", 5)).toBe(" ab  ");
  });

  it("returns the string unchanged when already at width", () => {
    expect(padDisplay("abcde", 5)).toBe("abcde");
  });
});

describe("truncateDisplay", () => {
  it("returns short strings unchanged", () => {
    expect(truncateDisplay("abc", 6)).toBe("abc");
  });

  it("truncates with an ellipsis at the display-width budget", () => {
    expect(truncateDisplay("RGB_STATUS", 6)).toBe("RGB_S…");
  });

  it("accounts for wide chars when truncating", () => {
    expect(truncateDisplay("中中中中", 5)).toBe("中中…"); // 2+2+1 = 5
  });
});

describe("stripAnsi", () => {
  it("removes SGR sequences", () => {
    expect(stripAnsi(`\x1b[1m\x1b[36mhi\x1b[0m`)).toBe("hi");
  });
});
