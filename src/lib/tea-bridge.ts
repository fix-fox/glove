import { createHash } from "node:crypto";
import { relative } from "node:path";
import { stripVTControlCharacters } from "node:util";
import type { Key, Keymap } from "../types/keymap";
import { clearKey } from "./keymap-edit";
import { loadKeymap, type KeymapDocument } from "./keymap-loader";
import { behaviorLabel, holdTapSecondaryLabel } from "./labels";
import { GLOVE80_GRID, GLOVE80_KEY_NAMES } from "./layout-map";
import { dispatch, type DispatchResult } from "./repl/dispatch";
import { comboDetail, keyDetail, macroDetail, type ViewSide } from "./repl/render";

export type TeaRequest =
  | { action: "snapshot" }
  | { action: "command"; command: string; layer: number; side: ViewSide; revision: string }
  | { action: "clear"; layer: number; position: number; revision: string };

export interface TeaKey {
  position: number;
  name: string;
  tap: string;
  /** Empty when the key has no distinct hold behavior. */
  hold: string;
  kind: "empty" | "layer" | "macro" | "modifier" | "key";
  detail: string;
  /** Source path relative to the process working directory, followed by a 1-based line. */
  source: string;
  editable: boolean;
}

export interface TeaEntity {
  kind: "macro" | "combo" | "hold-tap" | "mod-morph" | "conditional" | "tap-dance";
  name: string;
  detail: string;
}

export interface TeaSnapshot {
  /** Digest of every loaded source and include resolution, required for commands and edits. */
  revision: string;
  path: string;
  grid: (number | null)[][];
  layers: { name: string; keys: TeaKey[] }[];
  entities: TeaEntity[];
}

export type TeaResponse =
  | { snapshot: TeaSnapshot; message?: string }
  | { result: DispatchResult };

function nonnegativeInteger(value: unknown, name: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(name + " must be a nonnegative integer.");
  }
}

/** Keep terminal controls out of config-derived text while retaining detail line breaks. */
function displayText(value: string, multiline = false): string {
  return stripVTControlCharacters(value).replace(multiline ? /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g : /[\u0000-\u001f\u007f-\u009f]/g, "");
}

/** Validate the small wire protocol before a request can reach the native config editor. */
export function parseTeaRequest(value: unknown): TeaRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a JSON request object.");
  const request = value as Record<string, unknown>;
  let fields: string[];
  switch (request.action) {
    case "snapshot":
      fields = ["action"];
      break;
    case "command":
      fields = ["action", "command", "layer", "side", "revision"];
      if (typeof request.command !== "string" || request.command.length > 16384 || request.command.includes("\0")) {
        throw new Error("command must be a string of at most 16384 characters without NUL bytes.");
      }
      nonnegativeInteger(request.layer, "layer");
      if (!["both", "left", "right"].includes(request.side as string)) throw new Error("side must be both, left, or right.");
      break;
    case "clear":
      fields = ["action", "layer", "position", "revision"];
      nonnegativeInteger(request.layer, "layer");
      nonnegativeInteger(request.position, "position");
      break;
    default:
      throw new Error("action must be snapshot, command, or clear.");
  }
  if (request.action !== "snapshot" && (typeof request.revision !== "string" || !/^[a-f0-9]{64}$/.test(request.revision))) {
    throw new Error(request.action + " requires the revision from the displayed snapshot.");
  }
  const unknown = Object.keys(request).find((field) => !fields.includes(field));
  if (unknown) throw new Error("Unexpected request field: " + unknown);
  return request as TeaRequest;
}

/** Hash length-delimited, sorted entries so all native sources and symlink destinations matter. */
function documentRevision(document: KeymapDocument): string {
  const sorted = (entries: ReadonlyMap<string, string>) => [...entries].sort(([a], [b]) => a.localeCompare(b));
  return createHash("sha256")
    .update(JSON.stringify([document.path, sorted(document.sources), sorted(document.resolutions)]))
    .digest("hex");
}

function keyKind(key: Key): TeaKey["kind"] {
  if ((key.tap.type === "none" || key.tap.type === "trans") && !key.hold) return "empty";
  if (["mo", "to", "tog", "sl"].includes(key.tap.type)) return "layer";
  if (key.tap.type === "macro") return "macro";
  if (key.hold || key.tap.type === "hold_tap" || key.tap.type === "mod_morph") return "modifier";
  return "key";
}

function entities(config: Keymap): TeaEntity[] {
  const layerName = (index: number) => config.layers[index]!.name;
  const label = (name: string, annotation?: string) => name + (annotation ? ` (${annotation})` : "");
  return [
    ...(config.macros ?? []).map((definition): TeaEntity => ({
      kind: "macro", name: definition.name,
      detail: macroDetail(definition) + (definition.bindingCells ? `\n  parameters: ${definition.bindingCells}` : ""),
    })),
    ...(config.combos ?? []).map((definition): TeaEntity => ({
      kind: "combo", name: definition.name,
      detail: comboDetail(config, definition) + (definition.requirePriorIdleMs !== undefined ? `\n  prior idle: ${definition.requirePriorIdleMs}ms` : ""),
    })),
    ...(config.holdTaps ?? []).map((definition): TeaEntity => ({
      kind: "hold-tap", name: definition.name,
      detail: [
        "hold-tap " + label(definition.name, definition.label),
        `  hold: ${definition.holdBinding}`,
        `  tap: ${definition.tapBinding}`,
        `  flavor: ${definition.flavor}`,
        `  tapping term: ${definition.tappingTermMs}ms`,
        ...(definition.quickTapMs !== undefined ? [`  quick tap: ${definition.quickTapMs}ms`] : []),
        ...(definition.requirePriorIdleMs !== undefined ? [`  prior idle: ${definition.requirePriorIdleMs}ms`] : []),
        ...(definition.holdTriggerKeyPositions ? [`  hold trigger keys: ${definition.holdTriggerKeyPositions.map((position) => GLOVE80_KEY_NAMES[position]).join(", ")}`] : []),
        ...(definition.holdTriggerOnRelease !== undefined ? [`  hold trigger on release: ${definition.holdTriggerOnRelease}`] : []),
      ].join("\n"),
    })),
    ...(config.modMorphs ?? []).map((definition): TeaEntity => ({
      kind: "mod-morph", name: definition.name,
      detail: [
        "mod-morph " + label(definition.name, definition.label),
        `  default: ${definition.defaultBinding}`,
        `  with ${definition.mods.join("+")}: ${definition.morphBinding}`,
      ].join("\n"),
    })),
    ...(config.conditionalLayers ?? []).map((definition): TeaEntity => ({
      kind: "conditional", name: definition.name,
      detail: `conditional layer ${definition.name}\n  when: ${definition.ifLayers.map(layerName).join(" + ")}\n  activate: ${layerName(definition.thenLayer)}`,
    })),
    ...(config.tapDances ?? []).map((definition): TeaEntity => ({
      kind: "tap-dance", name: definition.name,
      detail: [
        "tap-dance " + label(definition.name, definition.label),
        ...(definition.tappingTermMs !== undefined ? [`  tapping term: ${definition.tappingTermMs}ms`] : []),
        ...definition.bindings.map((binding, index) => `  ${index + 1} tap${index === 0 ? "" : "s"}: ${binding}`),
      ].join("\n"),
    })),
  ].map((entity) => ({ ...entity, name: displayText(entity.name), detail: displayText(entity.detail, true) }));
}

/** Expose display data and original geometry while keeping native files the only config source. */
export function createTeaSnapshot(document: KeymapDocument): TeaSnapshot {
  const { config } = document;
  const names = config.layers.map((layer) => displayText(layer.name));
  return {
    revision: documentRevision(document),
    path: displayText(relative(process.cwd(), document.path)),
    grid: GLOVE80_GRID.map((row) => [...row]),
    layers: config.layers.map((layer, layerIndex) => ({
      name: displayText(layer.name),
      keys: layer.keys.map((key, position) => {
        const hebrew = layer.name.toLowerCase().includes("hebrew");
        const binding = document.bindings[layerIndex]![position]!;
        const source = document.sources.get(binding.file)!;
        const line = source.slice(0, binding.start).split("\n").length;
        const displayLabel = (behavior: Key["tap"]) => displayText(behaviorLabel(behavior, names, config.modMorphs, config.holdTaps, hebrew));
        return {
          position, name: GLOVE80_KEY_NAMES[position]!,
          tap: key.tap.type === "trans" ? "·" : displayLabel(key.tap),
          hold: key.tap.type === "hold_tap" ? displayText(holdTapSecondaryLabel(key.tap.name, key.tap.param1)) : key.hold ? displayLabel(key.hold) : "",
          kind: keyKind(key),
          detail: displayText(keyDetail(config, layerIndex, position), true),
          source: displayText(`${relative(process.cwd(), binding.file)}:${line}`),
          editable: binding.editable && !/\/\*|\/\//.test(source.slice(binding.start, binding.end)),
        };
      }),
    })),
    entities: entities(config),
  };
}

/** Commands return intent; only an explicit clear request with a current revision writes files. */
export function executeTeaRequest(value: unknown, path = "config/glove80.keymap"): TeaResponse {
  const request = parseTeaRequest(value);
  const document = loadKeymap(path);
  if (request.action === "snapshot") return { snapshot: createTeaSnapshot(document) };
  if (documentRevision(document) !== request.revision) {
    throw new Error("Config changed since it was displayed. " + (request.action === "clear" ? "Reload before clearing a key." : "Reload before running a command."));
  }
  if (!document.config.layers[request.layer]) throw new Error("Layer is out of range. Reload the keymap.");
  if (request.action === "command") {
    const result = dispatch(document.config, request.command, { layerIndex: request.layer, side: request.side });
    return { result: "text" in result ? { ...result, text: displayText(result.text, true) } : result };
  }
  const updated = clearKey(document, request.layer, request.position);
  return {
    snapshot: createTeaSnapshot(updated),
    message: displayText(`Cleared ${GLOVE80_KEY_NAMES[request.position]} on ${updated.config.layers[request.layer]!.name}.`),
  };
}
