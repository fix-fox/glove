#!/usr/bin/env python3
"""Capture the Go TUI as a self-contained, switchable HTML comparison."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass


ROOT = Path(__file__).resolve().parent.parent
SGR = re.compile(r"\x1b\[([0-9;:]*)m")
PALETTE = (
    "#000000", "#800000", "#008000", "#808000", "#000080", "#800080",
    "#008080", "#c0c0c0", "#808080", "#ff0000", "#00ff00", "#ffff00",
    "#0000ff", "#ff00ff", "#00ffff", "#ffffff",
)


def indexed_color(index: int) -> str:
    if index < 16:
        return PALETTE[index]
    if index < 232:
        value = index - 16
        levels = (0, 95, 135, 175, 215, 255)
        rgb = (levels[value // 36], levels[value // 6 % 6], levels[value % 6])
    else:
        gray = 8 + (index - 232) * 10
        rgb = (gray, gray, gray)
    return "#" + "".join(f"{value:02x}" for value in rgb)


@dataclass
class TerminalStyle:
    foreground: str | None = None
    background: str | None = None
    bold: bool = False
    dim: bool = False
    italic: bool = False
    underline: bool = False
    inverse: bool = False
    strike: bool = False

    def css(self) -> str:
        foreground, background = self.foreground, self.background
        if self.inverse:
            foreground, background = background or "#111318", foreground or "#e4e0ed"
        properties = []
        if foreground:
            properties.append(f"color:{foreground}")
        if background:
            properties.append(f"background-color:{background}")
        if self.bold:
            properties.append("font-weight:700")
        if self.dim:
            properties.append("opacity:.55")
        if self.italic:
            properties.append("font-style:italic")
        decorations = []
        if self.underline:
            decorations.append("underline")
        if self.strike:
            decorations.append("line-through")
        if decorations:
            properties.append("text-decoration:" + " ".join(decorations))
        return ";".join(properties)

    def apply(self, sequence: str) -> None:
        """Track SGR colors and attributes without letting escapes enter the HTML."""
        codes = []
        for field in sequence.split(";"):
            parts = field.split(":")
            if len(parts) in (5, 6) and parts[:2] in (["38", "2"], ["48", "2"]):
                parts = parts[:2] + parts[-3:]
            codes.extend(int(code) if code else 0 for code in parts)
        index = 0
        while index < len(codes):
            code = codes[index]
            index += 1
            if code == 0:
                self.__dict__.update(TerminalStyle().__dict__)
            elif code in (1, 2, 3, 4, 7, 9):
                setattr(self, {1: "bold", 2: "dim", 3: "italic", 4: "underline", 7: "inverse", 9: "strike"}[code], True)
            elif code == 22:
                self.bold = self.dim = False
            elif code in (23, 24, 27, 29):
                setattr(self, {23: "italic", 24: "underline", 27: "inverse", 29: "strike"}[code], False)
            elif 30 <= code <= 37 or 90 <= code <= 97:
                self.foreground = PALETTE[code - 30 if code < 90 else code - 90 + 8]
            elif 40 <= code <= 47 or 100 <= code <= 107:
                self.background = PALETTE[code - 40 if code < 100 else code - 100 + 8]
            elif code == 39:
                self.foreground = None
            elif code == 49:
                self.background = None
            elif code in (38, 48) and index < len(codes):
                mode = codes[index]
                index += 1
                color = None
                if mode == 5 and index < len(codes):
                    if 0 <= codes[index] <= 255:
                        color = indexed_color(codes[index])
                    index += 1
                elif mode == 2 and index + 2 < len(codes):
                    rgb = codes[index:index + 3]
                    if all(0 <= value <= 255 for value in rgb):
                        color = "#" + "".join(f"{value:02x}" for value in rgb)
                    index += 3
                if color:
                    setattr(self, "foreground" if code == 38 else "background", color)


def ansi_html(snapshot: str) -> str:
    """Escape terminal text and translate only supported SGR formatting to spans."""
    style = TerminalStyle()
    chunks: list[str] = []
    position = 0

    def append(text: str) -> None:
        if not text:
            return
        # Snapshots are frames, not streams: cursor controls indicate a bad capture.
        if any(ord(character) < 32 and character not in "\n\t" for character in text):
            raise ValueError("Snapshot contains a terminal control sequence other than SGR")
        escaped = html.escape(text)
        css = style.css()
        chunks.append(f'<span style="{css}">{escaped}</span>' if css else escaped)

    for match in SGR.finditer(snapshot):
        append(snapshot[position:match.start()])
        style.apply(match.group(1))
        position = match.end()
    append(snapshot[position:])
    return "".join(chunks)


def source_fingerprint(binary: Path) -> str:
    """Invalidate cached frames when the binary or its native config bridge changes."""
    digest = hashlib.sha256()
    digest.update(binary.read_bytes())
    for directory in ("config", "src", "scripts"):
        for path in sorted((ROOT / directory).rglob("*")):
            if path.is_file() and "__pycache__" not in path.parts:
                digest.update(path.relative_to(ROOT).as_posix().encode())
                digest.update(path.read_bytes())
    return digest.hexdigest()


def capture(binary: Path, arguments: list[str], cache: Path | None, fingerprint: str) -> str:
    cache_key = hashlib.sha256(json.dumps([fingerprint, arguments]).encode()).hexdigest()
    cache_file = cache / f"{cache_key}.txt" if cache else None
    if cache_file and cache_file.exists():
        return cache_file.read_text()
    result = subprocess.run(
        [str(binary), "--snapshot", *arguments], cwd=ROOT, text=True,
        capture_output=True, timeout=60, check=False,
    )
    if result.returncode:
        raise RuntimeError(f"Snapshot failed: {' '.join(arguments)}\n{result.stderr.strip()}")
    # Validate before caching so a malformed frame cannot poison later runs.
    ansi_html(result.stdout)
    if cache_file:
        with tempfile.NamedTemporaryFile(mode="w", dir=cache_file.parent, delete=False) as temporary:
            temporary.write(result.stdout)
        Path(temporary.name).replace(cache_file)
    return result.stdout


PAGE = r'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>Glove · Bubble Tea prototype</title>
<style>
:root { color-scheme:dark; --page:#111115; --panel:#19191f; --line:#303039; --muted:#93919f; --ink:#f1edf8; --accent:#c1a6ff; --mint:#a3dec5; }
* { box-sizing:border-box; }
body { margin:0; background:var(--page); color:var(--ink); font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
button,select { font:inherit; }
button { cursor:pointer; }
button:focus-visible,select:focus-visible,a:focus-visible { outline:2px solid var(--mint); outline-offset:4px; }
.page { width:min(1560px,100%); margin:0 auto; padding:38px 40px 30px; }
.masthead { display:flex; align-items:center; justify-content:space-between; gap:20px; }
.brand { display:flex; gap:11px; align-items:center; font-size:12px; font-weight:650; letter-spacing:.13em; }
.mark { color:var(--accent); font:22px/1 monospace; letter-spacing:-4px; padding-right:5px; }
.badge { font-size:11px; color:var(--mint); border:1px solid #304d41; border-radius:5px; padding:4px 9px; white-space:nowrap; }
.intro { display:flex; align-items:flex-end; justify-content:space-between; gap:24px; margin:23px 0 27px; }
h1 { margin:0; font-size:36px; line-height:1.16; letter-spacing:-1.3px; font-weight:620; }
.intro p { margin:10px 0 0; color:var(--muted); max-width:720px; }
.compare { border:1px solid var(--line); color:#cfccd7; background:transparent; padding:9px 12px; border-radius:7px; display:flex; align-items:center; gap:9px; white-space:nowrap; }
.compare[aria-checked="true"] { background:#292335; border-color:#71608d; color:var(--accent); }
.switch { width:23px; height:13px; padding:2px; border-radius:10px; background:#4a4654; }
.switch:after { content:""; display:block; width:9px; height:9px; border-radius:50%; background:#c4bfce; transition:transform .15s; }
.compare[aria-checked="true"] .switch { background:#775ba6; }
.compare[aria-checked="true"] .switch:after { transform:translateX(10px); background:#e5d8ff; }
.toolbar { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:18px; background:var(--panel); border:1px solid var(--line); padding:15px 17px; border-radius:10px 10px 0 0; }
.settings { display:flex; gap:24px; flex-wrap:wrap; }
.setting { display:flex; align-items:center; gap:11px; }
.label { color:var(--muted); font-size:12px; }
.segment { display:flex; background:#101014; padding:3px; border-radius:6px; gap:2px; }
.segment button { border:0; background:transparent; color:#9e98ac; border-radius:4px; padding:5px 12px; font-size:12px; }
.segment button[aria-pressed="true"] { color:#eee5ff; background:#3d324f; box-shadow:0 1px 3px #0006; }
.size select { color:#cbc5d8; border:1px solid #3a3743; border-radius:5px; background:#19171f; padding:6px 25px 6px 9px; font-size:12px; }
.tabs { display:flex; gap:23px; padding:0 20px; border:1px solid var(--line); border-top:0; background:#15151a; }
.tabs button { background:transparent; border:0; border-bottom:2px solid transparent; padding:13px 1px 12px; color:#918c9e; font-size:12px; }
.tabs button[aria-selected="true"] { color:var(--accent); border-color:var(--accent); }
.stage { display:grid; grid-template-columns:minmax(0,1fr); gap:14px; padding:18px; background:#0c0c10; border:1px solid var(--line); border-top:0; border-radius:0 0 10px 10px; }
.stage.comparing { grid-template-columns:repeat(2,minmax(0,1fr)); }
.terminal { min-width:0; border:1px solid #34303e; border-radius:8px; overflow:hidden; background:#111318; box-shadow:0 12px 38px #0003; }
.titlebar { display:flex; gap:12px; justify-content:space-between; align-items:center; padding:10px 13px; background:#22202a; border-bottom:1px solid #34303e; color:#9d94ae; font-size:11px; }
.window { display:flex; gap:5px; }
.window i { width:6px; height:6px; border-radius:50%; background:#5d546c; }
.terminal-name { color:#c9bfd8; font-weight:500; }
.dimensions { font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:10px; }
.terminal-scroll { overflow-x:auto; padding:14px 12px 10px; scrollbar-color:#514663 #111318; }
pre { margin:0; font:var(--terminal-font,14px)/1.1 ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace; color:#e4e0ed; font-variant-ligatures:none; white-space:pre; tab-size:4; letter-spacing:0; direction:ltr; unicode-bidi:bidi-override; }
.details { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:start; gap:28px; padding:20px 1px; }
.description strong { color:#d0c8df; font-size:13px; font-weight:550; }
.description p { margin:5px 0 0; font-size:12px; color:var(--muted); max-width:660px; }
.launch { text-align:right; }
.launch .label { display:block; margin-bottom:7px; font-size:11px; }
code { font:11px/1.7 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; color:var(--mint); background:#19221f; border:1px solid #2c3e36; border-radius:5px; padding:6px 9px; display:inline-block; white-space:normal; overflow-wrap:anywhere; }
footer { padding-top:16px; border-top:1px solid #29272f; color:#716b7d; font-size:11px; display:flex; gap:20px; justify-content:space-between; }
footer span:last-child { white-space:nowrap; }
@media(min-width:1700px) { .page { padding-top:48px; } }
@media(max-width:850px) { .page { padding:24px 18px; } .intro { align-items:flex-start; flex-direction:column; gap:16px; } h1 { font-size:30px; } .toolbar { gap:14px; } .settings { gap:14px; } .stage { padding:10px; } .stage.comparing { grid-template-columns:minmax(0,1fr); } .details { grid-template-columns:minmax(0,1fr); gap:16px; } .launch { text-align:left; } footer { flex-direction:column; gap:6px; } }
@media(prefers-reduced-motion:reduce) { * { transition:none!important; } }
</style>
</head>
<body>
<main class="page">
  <header class="masthead"><div class="brand"><span class="mark" aria-hidden="true">⌜⌟</span> GLOVE / TUI PROTOTYPE</div><span class="badge">Go + Bubble Tea v2</span></header>
  <div class="intro"><div><h1>Glove, in Bubble Tea.</h1><p>Compare layouts using your current keymap. Every frame comes from the Go app.</p></div><button class="compare" id="compare" type="button" role="switch" aria-checked="false"><span class="switch" aria-hidden="true"></span>Compare layouts</button></div>
  <section aria-label="Prototype comparison">
    <div class="toolbar">
      <div class="settings">
        <div class="setting"><span class="label" id="layout-label">Layout</span><div class="segment" role="group" aria-labelledby="layout-label"><button type="button" data-layout="studio" aria-pressed="true">Studio</button><button type="button" data-layout="focus" aria-pressed="false">Focus</button></div></div>
        <div class="setting"><span class="label" id="keys-label">Keys</span><div class="segment" role="group" aria-labelledby="keys-label"><button type="button" data-keys="tiles" aria-pressed="true">Tiles</button><button type="button" data-keys="compact" aria-pressed="false">Compact</button></div></div>
      </div>
      <label class="setting size"><span class="label">Terminal width</span><select id="width"><option value="150">150 columns</option><option value="100">100 columns</option></select></label>
    </div>
    <div class="tabs" role="tablist" aria-label="App screen"><button type="button" role="tab" data-screen="keyboard" aria-selected="true">Keyboard</button><button type="button" role="tab" data-screen="library" aria-selected="false">Library</button><button type="button" role="tab" data-screen="search" aria-selected="false">Search</button><button type="button" role="tab" data-screen="palette" aria-selected="false">Commands</button></div>
    <div class="stage" id="stage" aria-live="polite"></div>
  </section>
  <div class="details"><div class="description"><strong id="choice"></strong><p id="description"></p></div><div class="launch"><span class="label">Try this layout in your terminal</span><code id="command"></code></div></div>
  <footer><span>Frames use config/glove80.keymap. This comparison does not edit your configuration.</span><span>Run scripts/glove-tea for the live prototype.</span></footer>
</main>
<script id="frames" type="application/json">__SNAPSHOTS__</script>
<script>
'use strict';
const frames = JSON.parse(document.getElementById('frames').textContent);
const state = {layout:'studio', keys:'tiles', screen:'keyboard', width:'150', compare:false};
const names = {studio:'Studio', focus:'Focus', tiles:'Tiles', compact:'Compact', keyboard:'Keyboard', library:'Library', search:'Search', palette:'Commands'};
const stage = document.getElementById('stage');
function frame(layout) {
  const card = document.createElement('article');
  card.className = 'terminal';
  const key = [layout,state.keys,state.width,state.screen].join('/');
  card.innerHTML = '<div class="titlebar"><span class="window" aria-hidden="true"><i></i><i></i><i></i></span><span class="terminal-name">'+names[layout]+' / '+names[state.keys]+'</span><span class="dimensions">'+state.width+' × 46</span></div><div class="terminal-scroll"><pre aria-label="'+names[layout]+' terminal preview">'+frames[key]+'</pre></div>';
  return card;
}
function fit() {
  stage.querySelectorAll('.terminal-scroll').forEach(element => {
    const available = element.clientWidth - 24;
    const size = Math.max(8.5, Math.min(15, available / (Number(state.width) * .61)));
    element.style.setProperty('--terminal-font',size+'px');
  });
}
function render() {
  document.querySelectorAll('[data-layout]').forEach(button => button.setAttribute('aria-pressed',button.dataset.layout===state.layout));
  document.querySelectorAll('[data-keys]').forEach(button => button.setAttribute('aria-pressed',button.dataset.keys===state.keys));
  document.querySelectorAll('[data-screen]').forEach(button => { const selected = button.dataset.screen===state.screen; button.setAttribute('aria-selected',selected); button.tabIndex = selected ? 0 : -1; });
  document.getElementById('compare').setAttribute('aria-checked',state.compare);
  stage.classList.toggle('comparing',state.compare);
  stage.replaceChildren(frame(state.layout));
  if(state.compare) stage.append(frame(state.layout==='studio'?'focus':'studio'));
  const description = state.layout==='studio' ? 'Keep the keyboard and key inspector side by side.' : 'Give the keyboard the full width, with the key inspector below.';
  document.getElementById('choice').textContent = state.compare ? 'Studio and Focus, with '+state.keys+' keys' : names[state.layout]+' layout, '+state.keys+' keys';
  document.getElementById('description').textContent = (state.compare ? 'Compare a side inspector with a full-width keyboard and details below. ' : description+' ') + (state.keys==='tiles' ? 'Tile borders keep individual keys distinct.' : 'Compact rows leave more room for labels.')+' Resize the terminal in the live app to try its responsive layout.';
  document.getElementById('command').textContent = 'scripts/glove-tea --layout='+state.layout+' --keys='+state.keys;
  fit();
}
document.querySelectorAll('[data-layout]').forEach(button => button.addEventListener('click',()=>{state.layout=button.dataset.layout;render();}));
document.querySelectorAll('[data-keys]').forEach(button => button.addEventListener('click',()=>{state.keys=button.dataset.keys;render();}));
document.querySelectorAll('[data-screen]').forEach(button => {
  button.addEventListener('click',()=>{state.screen=button.dataset.screen;render();});
  button.addEventListener('keydown',event=>{
    const tabs = [...document.querySelectorAll('[data-screen]')];
    let index = tabs.indexOf(button);
    if(event.key==='ArrowRight') index = (index+1)%tabs.length;
    else if(event.key==='ArrowLeft') index = (index-1+tabs.length)%tabs.length;
    else if(event.key==='Home') index = 0;
    else if(event.key==='End') index = tabs.length-1;
    else return;
    event.preventDefault(); state.screen=tabs[index].dataset.screen; render(); tabs[index].focus();
  });
});
document.getElementById('width').addEventListener('change',event=>{state.width=event.target.value;render();});
document.getElementById('compare').addEventListener('click',()=>{state.compare=!state.compare;render();});
window.addEventListener('resize',fit);
render();
</script>
</body>
</html>
'''


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--binary", type=Path, default=ROOT / "build/glove-tea")
    parser.add_argument("--output", type=Path, default=ROOT / "build/tea-preview.html")
    parser.add_argument("--no-cache", action="store_true", help="Capture every frame again")
    options = parser.parse_args()
    binary = options.binary.resolve()
    if not binary.is_file():
        parser.error(f"Go prototype not found at {binary}; build it before generating the preview")
    output = options.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    cache = None if options.no_cache else ROOT / "build/tea-preview-cache"
    if cache:
        cache.mkdir(parents=True, exist_ok=True)
    snapshots: dict[str, str] = {}
    fingerprint = source_fingerprint(binary)
    for layout in ("studio", "focus"):
        for keys in ("tiles", "compact"):
            for width in (150, 100):
                for screen in ("keyboard", "library", "search", "palette"):
                    arguments = [f"--layout={layout}", f"--keys={keys}", f"--width={width}", "--height=46", "--layer=0", f"--screen={screen}", "--query=copy"]
                    raw = capture(binary, arguments, cache, fingerprint)
                    snapshots[f"{layout}/{keys}/{width}/{screen}"] = ansi_html(raw)
    encoded = json.dumps(snapshots, ensure_ascii=False).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
    output.write_text(PAGE.replace("__SNAPSHOTS__", encoded))
    print(f"Wrote {output} with {len(snapshots)} native terminal frames")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as error:
        print(f"tea-preview: {error}", file=sys.stderr)
        raise SystemExit(1) from error
