"use client";

import { GLOVE80_GRID, GRID_COLS } from "@/lib/layout-map";
import { KeyCap } from "./KeyCap";

export function KeyboardLayout() {
  return (
    <div
      className="grid gap-1 w-full max-w-5xl mx-auto"
      style={{
        gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
        gridAutoRows: "minmax(48px, auto)",
      }}
    >
      {GLOVE80_GRID.flatMap((row, rowIdx) =>
        row.map((keyIndex, colIdx) =>
          keyIndex !== null ? (
            <KeyCap key={keyIndex} index={keyIndex} />
          ) : (
            <div key={`empty-${rowIdx}-${colIdx}`} />
          )
        )
      )}
    </div>
  );
}
