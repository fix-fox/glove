import { describe, it, expect } from "vitest";
import { isMagicPosition, MAGIC_KEY_POSITIONS } from "./magic";

describe("magic positions", () => {
  it("has positions 64 and 79", () => {
    expect(MAGIC_KEY_POSITIONS).toEqual(new Set([64, 79]));
  });

  it("isMagicPosition returns true for 64 and 79", () => {
    expect(isMagicPosition(64)).toBe(true);
    expect(isMagicPosition(79)).toBe(true);
  });

  it("isMagicPosition returns false for other positions", () => {
    expect(isMagicPosition(0)).toBe(false);
    expect(isMagicPosition(63)).toBe(false);
    expect(isMagicPosition(65)).toBe(false);
    expect(isMagicPosition(78)).toBe(false);
  });
});
