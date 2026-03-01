import { readFileSync, writeFileSync, unlinkSync, existsSync } from "fs";
import { KeyboardConfigSchema } from "@/types/schema";
import { generateKeymap } from "@/lib/generator";
import { generateConf, detectPointingFeature } from "@/lib/repo-generator";

const CONFIG_PATH = "config.json";
const KEYMAP_PATH = "config/glove80.keymap";
const CONF_PATH = "config/glove80.conf";

const raw = readFileSync(CONFIG_PATH, "utf-8");
const config = KeyboardConfigSchema.parse(JSON.parse(raw));

const result = generateKeymap(config);
if (!result.ok) {
  console.error("Validation errors:");
  for (const e of result.errors) {
    console.error(`  ${e.path}: ${e.message}`);
  }
  process.exit(1);
}

writeFileSync(KEYMAP_PATH, result.keymap);
console.log(`Wrote ${KEYMAP_PATH}`);

const conf = generateConf(config);
if (conf) {
  writeFileSync(CONF_PATH, conf);
  console.log(`Wrote ${CONF_PATH}`);
} else if (existsSync(CONF_PATH)) {
  unlinkSync(CONF_PATH);
  console.log(`Removed ${CONF_PATH} (no pointing features)`);
}
