import { readFileSync } from "fs";
import { describe, it, expect, beforeAll } from "vitest";
import { KeyboardConfigSchema } from "../../types/schema";
import { renderLayer } from "./render";
import { setColorEnabled } from "./color";
import { displayWidth, stripAnsi } from "./text-width";

const config = KeyboardConfigSchema.parse(
  JSON.parse(readFileSync("config.json", "utf-8")),
);

beforeAll(() => setColorEnabled(true)); // exercise the colored path; widths measured after stripAnsi

describe("layer rendering alignment (real config)", () => {
  config.layers.forEach((layer, i) => {
    it(`layer ${i} (${layer.name}) renders aligned boxes`, () => {
      const text = renderLayer(config, i);
      const lines = text.split("\n").map(stripAnsi);
      for (let l = 0; l < lines.length; l++) {
        const line = lines[l]!;
        if (!line.trimStart().startsWith("┌")) continue;
        const top = line;
        const mid = lines[l + 1]!;
        const bottom = lines[l + 2]!;
        // equal display width across the triple
        expect(displayWidth(mid), `layer ${layer.name} line ${l + 1}`).toBe(displayWidth(top));
        expect(displayWidth(bottom), `layer ${layer.name} line ${l + 2}`).toBe(displayWidth(top));
        // every ┌ in the top line has a │ and └ at the same display column
        let col = 0;
        for (const ch of top) {
          if (ch === "┌") {
            expect(charAtDisplayCol(mid, col), `│ at col ${col}`).toBe("│");
            expect(charAtDisplayCol(bottom, col), `└ at col ${col}`).toBe("└");
          }
          col += displayWidth(ch);
        }
      }
    });
  });
});

function charAtDisplayCol(line: string, target: number): string {
  let col = 0;
  for (const ch of line) {
    if (col === target) return ch;
    col += displayWidth(ch);
  }
  return "";
}
