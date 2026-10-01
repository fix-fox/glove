import { readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface SourceToken {
  text: string;
  file: string;
  start: number;
  end: number;
  /** Expanded constants point at their use, never at a shared definition. */
  expanded?: true;
}

export function sourceError(token: SourceToken, message: string): never {
  const source = readFileSync(token.file, "utf8");
  const prefix = source.slice(0, token.start);
  const line = prefix.split("\n").length;
  const column = token.start - prefix.lastIndexOf("\n");
  throw new Error(token.file + ":" + line + ":" + column + ": " + message);
}

/** Tokenize the supported devicetree syntax without losing editable source ranges. */
function tokenize(source: string, file: string, offset = 0): SourceToken[] {
  const splice = /\\\r?\n/.exec(source);
  if (splice) sourceError({ text: "\\", file, start: offset + splice.index, end: offset + splice.index + 1 }, "Line continuations are supported only inside preprocessor directives");
  const tokens: SourceToken[] = [];
  let index = 0;
  while (index < source.length) {
    const rest = source.slice(index);
    const whitespace = /^\s+/.exec(rest);
    if (whitespace) { index += whitespace[0].length; continue; }
    const token = (text: string, length = text.length) => {
      tokens.push({ text, file, start: offset + index, end: offset + index + length });
      index += length;
    };
    if (rest.startsWith("//")) {
      const comment = rest.split("\n", 1)[0]!;
      const label = /^\/\/\s*@label\s+(.+?)\s*$/.exec(comment);
      if (label) token("@label " + label[1], comment.length);
      else index += comment.length;
      continue;
    }
    if (rest.startsWith("/*")) {
      const end = rest.indexOf("*/", 2);
      if (end < 0) sourceError({ text: "/*", file, start: offset + index, end: offset + index + 2 }, "Unterminated comment");
      index += end + 2;
      continue;
    }
    if (rest[0] === '"') {
      const value = /^"(?:[^"\\]|\\.)*"/.exec(rest);
      if (!value) sourceError({ text: rest[0]!, file, start: offset + index, end: offset + index + 1 }, "Unterminated string");
      token(value[0]);
      continue;
    }
    const word = /^(?:#[a-zA-Z_][\w-]*|[a-zA-Z_][\w-]*|0[xX][\da-fA-F]+|\d+)/.exec(rest);
    if (word) { token(word[0]); continue; }
    if ("{};:=<>,&()|+-/".includes(rest[0]!)) { token(rest[0]!); continue; }
    sourceError({ text: rest[0]!, file, start: offset + index, end: offset + index + 1 }, "Unsupported character " + JSON.stringify(rest[0]));
  }
  return tokens;
}

const SYSTEM_INCLUDES = new Set([
  "behaviors.dtsi", "dt-bindings/zmk/keys.h", "dt-bindings/zmk/bt.h",
  "dt-bindings/zmk/outputs.h", "dt-bindings/zmk/rgb.h", "dt-bindings/zmk/pointing.h",
]);

export interface KeymapSource {
  tokens: SourceToken[];
  sources: Map<string, string>;
  constants: Map<string, SourceToken[]>;
  resolutions: Map<string, string>;
}

/** Expand local includes and object constants; leave ZMK's symbolic keycodes intact. */
export function readKeymapSource(path: string, replacements: ReadonlyMap<string, string> = new Map()): KeymapSource {
  const sources = new Map<string, string>();
  const definitions = new Map<string, SourceToken[]>();
  const resolutions = new Map<string, string>();
  const included = new Set<string>();
  const stack: string[] = [];
  let expansionCount = 0;
  const expand = (tokens: SourceToken[], active: string[] = []): SourceToken[] => tokens.flatMap((token) => {
    const definition = definitions.get(token.text);
    if (!definition) return [token];
    if (active.includes(token.text)) sourceError(token, "Recursive constant " + [...active, token.text].join(" -> "));
    if (++expansionCount > 100000) sourceError(token, "Constant expansion limit exceeded");
    return expand(definition.map((part) => ({ ...token, text: part.text, expanded: true })), [...active, token.text]);
  });
  const read = (requested: string): SourceToken[] => {
    requested = resolve(requested);
    const file = realpathSync(requested);
    resolutions.set(requested, file);
    if (stack.includes(file)) throw new Error("Include cycle: " + [...stack, file].join(" -> "));
    if (included.has(file)) throw new Error("Duplicate include: " + file);
    included.add(file);
    stack.push(file);
    const source = replacements.get(file) ?? readFileSync(file, "utf8");
    sources.set(file, source);
    const result: SourceToken[] = [];
    // Mask comments before recognizing directives so commented-out #include is inert.
    const masked = source.replace(/"(?:[^"\\]|\\.)*"|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
      (part, index: number) => {
        if (part.startsWith('"')) return part;
        if (/\\(?:\r?\n|\r?$)/.test(part)) sourceError({ text: part, file, start: index, end: index + part.length }, "Line continuations inside comments are not supported");
        return part.replace(/[^\n]/g, " ");
      });
    const directive = /^[ \t]*#(?!binding-cells\b)/gm;
    let previous = 0;
    for (const match of masked.matchAll(directive)) {
      const start = match.index!;
      if (start < previous) continue;
      result.push(...expand(tokenize(source.slice(previous, start), file, previous)));
      let end = masked.indexOf("\n", start);
      if (end < 0) end = masked.length;
      while (masked.slice(start, end).trimEnd().endsWith("\\") && end < masked.length) {
        const next = masked.indexOf("\n", end + 1);
        end = next < 0 ? masked.length : next;
      }
      const raw = source.slice(start, end);
      const line = masked.slice(start, end).replace(/\\\r?\n/g, " ").trim();
      const at: SourceToken = { text: raw, file, start, end: start + raw.length };
      const include = /^#\s*include\s*(?:"([^"]+)"|<([^>]+)>)\s*$/.exec(line);
      const define = /^#\s*define\s+([A-Za-z_]\w*)(\s+)(.+?)\s*$/.exec(line);
      if (include?.[1]) {
        result.push(...read(resolve(dirname(file), include[1])));
      } else if (include?.[2]) {
        if (!SYSTEM_INCLUDES.has(include[2])) sourceError(at, "Unsupported system include <" + include[2] + ">; the TUI cannot infer its behaviors");
      } else if (define) {
        if (definitions.has(define[1]!)) sourceError(at, "Duplicate constant " + define[1]);
        definitions.set(define[1]!, tokenize(define[3]!, file, start));
      } else {
        sourceError(at, "Unsupported directive. Use quoted includes and object-like #define constants; conditionals and function-like macros are not supported by the TUI");
      }
      previous = start + raw.length;
    }
    result.push(...expand(tokenize(source.slice(previous), file, previous)));
    stack.pop();
    return result;
  };
  const tokens = read(path);
  const constants = new Map([...definitions].map(([name, value]) => [name, expand(value)]));
  return { tokens, sources, constants, resolutions };
}

export interface KeymapNode {
  name: string;
  reference: boolean;
  label?: string;
  displayLabel?: string;
  token: SourceToken;
  properties: Map<string, SourceToken[]>;
  children: KeymapNode[];
}

/** Parse nodes and properties, rejecting unrecognized syntax rather than dropping it. */
export function parseKeymapNodes(tokens: SourceToken[]): KeymapNode[] {
  let index = 0;
  const peek = () => tokens[index];
  const take = (): SourceToken => {
    const token = tokens[index++];
    if (!token) throw new Error("Unexpected end of keymap");
    return token;
  };
  const expect = (text: string) => {
    const token = take();
    if (token.text !== text) sourceError(token, "Expected " + text + ", got " + token.text);
  };
  const node = (): KeymapNode => {
    let displayLabel: string | undefined;
    if (peek()?.text.startsWith("@label ")) displayLabel = take().text.slice(7);
    const token = take();
    const reference = token.text === "&";
    let name = reference ? take().text : token.text;
    let label: string | undefined;
    if (peek()?.text === ":") { take(); label = name; name = take().text; }
    expect("{");
    const properties = new Map<string, SourceToken[]>();
    const children: KeymapNode[] = [];
    while (peek()?.text !== "}") {
      const current = peek();
      if (!current) throw new Error("Unclosed node " + name);
      if (current.text.startsWith("@label ") || ["{", ":"].includes(tokens[index + 1]?.text ?? "")) {
        const child = node();
        if (children.some((previous) => previous.name === child.name)) sourceError(child.token, "Duplicate node " + child.name);
        children.push(child);
        continue;
      }
      const property = take();
      if (properties.has(property.text)) sourceError(property, "Duplicate property " + property.text);
      const value: SourceToken[] = [];
      if (peek()?.text === "=") {
        take();
        while (peek()?.text !== ";") {
          const part = take();
          if (["{", "}"].includes(part.text)) sourceError(part, "Missing semicolon after " + property.text);
          value.push(part);
        }
        if (!value.length) sourceError(property, "Empty value for " + property.text);
      }
      expect(";");
      properties.set(property.text, value);
    }
    expect("}"); expect(";");
    return { name, reference, token, properties, children, ...(label ? { label } : {}), ...(displayLabel ? { displayLabel } : {}) };
  };
  const nodes: KeymapNode[] = [];
  while (peek()) nodes.push(node());
  return nodes;
}
