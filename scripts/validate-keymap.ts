import { loadKeymap } from "../src/lib/keymap-loader";

try {
  const document = loadKeymap();
  const config = document.config;
  const definitions = [
    config.macros, config.modMorphs, config.holdTaps, config.tapDances,
    config.combos, config.conditionalLayers,
  ].reduce((sum, entries) => sum + (entries?.length ?? 0), 0);
  console.log(`Valid keymap: ${config.layers.length} layers, ${definitions} definitions (${document.path}).`);
} catch (error) {
  console.error(`Invalid keymap: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
