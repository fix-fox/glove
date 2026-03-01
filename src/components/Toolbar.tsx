"use client";

import { useState, useCallback } from "react";
import { ExportDialog } from "./ExportDialog";
import { ErrorDialog } from "./ErrorDialog";
import { FlashDialog } from "./FlashDialog";
import { MacroEditor } from "./MacroEditor";
import { ComboEditor } from "./ComboEditor";
import { ConditionalLayerEditor } from "./ConditionalLayerEditor";
import { SettingsDialog } from "./SettingsDialog";
import { editorStore, useEditorStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function Toolbar() {
  const isDirty = useEditorStore((s) => s.isDirty);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [macrosOpen, setMacrosOpen] = useState(false);
  const [combosOpen, setCombosOpen] = useState(false);
  const [condLayersOpen, setCondLayersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [flashOpen, setFlashOpen] = useState(false);
  const [flashLines, setFlashLines] = useState<string[]>([]);
  const [flashRunning, setFlashRunning] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [errorOpen, setErrorOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus(null);
    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editorStore.getState().config),
      });
      const data = await res.json();
      if (data.ok) {
        editorStore.getState().markClean();
        setSaveStatus("Saved");
        setTimeout(() => setSaveStatus(null), 2000);
      } else {
        setSaveStatus(`Error: ${data.error}`);
      }
    } catch (err) {
      setSaveStatus("Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleFlash = useCallback(async () => {
    setFlashLines([]);
    setFlashRunning(true);
    setFlashOpen(true);
    try {
      const res = await fetch("/api/flash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editorStore.getState().config),
      });
      if (!res.body) {
        setFlashLines(["ERROR: No response body"]);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;
        if (lines.length > 0) {
          setFlashLines((prev) => [...prev, ...lines]);
        }
      }
      if (buffer) {
        setFlashLines((prev) => [...prev, buffer]);
      }
      editorStore.getState().markClean();
    } catch (err) {
      setFlashLines((prev) => [...prev, `ERROR: ${err instanceof Error ? err.message : String(err)}`]);
    } finally {
      setFlashRunning(false);
    }
  }, []);

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      onClick={(e) => e.stopPropagation()}
    >
      <Button
        variant={isDirty ? "default" : "outline"}
        size="sm"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? "Saving..." : "Save"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handleFlash}
        disabled={flashRunning}
      >
        {flashRunning ? "Flashing..." : "Flash"}
      </Button>
      {saveStatus && (
        <span className="text-xs text-muted-foreground">{saveStatus}</span>
      )}
      <Button variant="outline" size="sm" onClick={() => setMacrosOpen(true)}>
        Macros
      </Button>
      <Button variant="outline" size="sm" onClick={() => setCombosOpen(true)}>
        Combos
      </Button>
      <Button variant="outline" size="sm" onClick={() => setCondLayersOpen(true)}>
        Cond. Layers
      </Button>

      <Popover open={moreOpen} onOpenChange={setMoreOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            More
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-1">
          <div className="flex flex-col gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="justify-start"
              onClick={() => {
                setSettingsOpen(true);
                setMoreOpen(false);
              }}
            >
              Settings
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="justify-start"
              onClick={() => {
                setExportOpen(true);
                setMoreOpen(false);
              }}
            >
              Export .keymap
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
      <MacroEditor open={macrosOpen} onOpenChange={setMacrosOpen} />
      <ComboEditor open={combosOpen} onOpenChange={setCombosOpen} />
      <ConditionalLayerEditor open={condLayersOpen} onOpenChange={setCondLayersOpen} />
      <ErrorDialog open={errorOpen} onOpenChange={setErrorOpen} error={errorText} />
      <FlashDialog open={flashOpen} onOpenChange={setFlashOpen} lines={flashLines} running={flashRunning} />
    </div>
  );
}
