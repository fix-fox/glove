import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // Vite otherwise discovers PostCSS config in an ancestor checkout.
  css: { postcss: {} },
  test: {
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
