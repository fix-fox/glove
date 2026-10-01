import { closeSync, fsyncSync, openSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { loadKeymap, type KeymapDocument } from "./keymap-loader";

/** Refuse edits after any included configuration file changed since the last load. */
function assertUnchanged(document: KeymapDocument): void {
  for (const [requested, target] of document.resolutions) {
    if (realpathSync(requested) !== target) throw new Error(requested + " changed its symlink target. Run reload before editing.");
  }
  for (const [path, source] of document.sources) {
    if (readFileSync(path, "utf8") !== source) {
      throw new Error(path + " changed on disk. Run reload before editing.");
    }
  }
}

/** Replace one literal binding, validating before an atomic write and keeping all other text. */
export function clearKey(document: KeymapDocument, layerIndex: number, position: number): KeymapDocument {
  if (!Number.isInteger(layerIndex) || !Number.isInteger(position) || layerIndex < 0 || position < 0) throw new Error("Invalid layer or key position");
  const binding = document.bindings[layerIndex]?.[position];
  if (!binding) throw new Error("Layer or key position is out of range");
  if (!binding.editable) throw new Error("This binding comes from a shared macro. Use edit to change it explicitly.");
  assertUnchanged(document);
  const source = document.sources.get(binding.file)!;
  const original = source.slice(binding.start, binding.end);
  if (!original.startsWith("&") || /\/\*|\/\//.test(original)) throw new Error("This binding contains comments or shared syntax. Use edit to preserve it.");
  const replacement = layerIndex === 0 ? "&none" : "&trans";
  const updated = source.slice(0, binding.start) + replacement + source.slice(binding.end);
  if (updated === source) return document;
  const candidate = loadKeymap(document.path, new Map([[binding.file, updated]]));
  const temporary = join(dirname(binding.file), "." + basename(binding.file) + "." + randomUUID() + ".tmp");
  let created = false;
  try {
    const fd = openSync(temporary, "wx", statSync(binding.file).mode & 0o777);
    created = true;
    try { writeFileSync(fd, updated); fsyncSync(fd); }
    finally { closeSync(fd); }
    // Recheck after validation and temp-file creation, immediately before replacing the file.
    assertUnchanged(document);
    renameSync(temporary, binding.file);
    created = false;
    return candidate;
  } finally {
    if (created) unlinkSync(temporary);
  }
}
