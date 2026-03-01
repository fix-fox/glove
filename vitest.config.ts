import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  css: {
    postcss: {},
  },
  test: {
    globals: true,
    exclude: ["e2e/**", "node_modules/**"],
    setupFiles: ["./src/lib/test-setup.ts"],
    server: {
      deps: {
        inline: ["zundo"],
      },
    },
  },
  resolve: {
    alias: [
      {
        find: "@",
        replacement: path.resolve(__dirname, "src"),
      },
    ],
  },
});
