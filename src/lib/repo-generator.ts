/**
 * Generates the full ZMK firmware repo structure for Glove80.
 *
 * Output files:
 *   .github/workflows/build.yml   — GitHub Actions build workflow
 *   build.yaml                    — board matrix
 *   config/west.yml               — west manifest (moergo ZMK + urob helpers)
 *   config/glove80.conf           — Kconfig (mouse support, etc.)
 *   config/glove80.keymap         — the generated keymap
 */

import type { KeyboardConfig } from "../types/schema";
import { generateKeymap } from "./generator";

export interface RepoFile {
  path: string;
  content: string;
}

export type RepoResult =
  | { ok: true; files: RepoFile[] }
  | { ok: false; errors: { path: string; message: string }[] };

const BUILD_WORKFLOW = `on: [push, pull_request, workflow_dispatch]

jobs:
  build:
    uses: zmkfirmware/zmk/.github/workflows/build-user-config.yml@main
`;

const BUILD_YAML = `board: [ "glove80_lh", "glove80_rh" ]
`;

const WEST_YML = `manifest:
  remotes:
    - name: moergo-sc
      url-base: https://github.com/moergo-sc
    - name: urob
      url-base: https://github.com/urob
  projects:
    - name: zmk
      remote: moergo-sc
      revision: main
      import: app/west.yml
    - name: zmk-helpers
      remote: urob
      revision: main
  self:
    path: config
`;

export function detectPointingFeature(config: KeyboardConfig): boolean {
  for (const layer of config.layers) {
    for (const key of layer.keys) {
      for (const b of [key.tap, key.hold]) {
        if (!b) continue;
        if (b.type === "mmv" || b.type === "msc" || b.type === "mkp") return true;
      }
    }
  }
  return false;
}

function generateConf(config: KeyboardConfig): string {
  const lines: string[] = [];
  if (detectPointingFeature(config)) {
    lines.push("CONFIG_ZMK_POINTING=y");
  }
  return lines.length > 0 ? lines.join("\n") + "\n" : "";
}

export function generateRepo(config: KeyboardConfig): RepoResult {
  const keymapResult = generateKeymap(config);
  if (!keymapResult.ok) {
    return keymapResult;
  }

  const files: RepoFile[] = [
    { path: ".github/workflows/build.yml", content: BUILD_WORKFLOW },
    { path: "build.yaml", content: BUILD_YAML },
    { path: "config/west.yml", content: WEST_YML },
    { path: "config/glove80.keymap", content: keymapResult.keymap },
  ];

  const conf = generateConf(config);
  if (conf) {
    files.push({ path: "config/glove80.conf", content: conf });
  }

  return { ok: true, files };
}
