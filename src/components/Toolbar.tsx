"use client";

import { useState, useCallback } from "react";
import { useStore } from "zustand";
import { Settings, Undo2, Redo2 } from "lucide-react";
import { ExportDialog } from "./ExportDialog";
import { ErrorDialog } from "./ErrorDialog";
import { FlashDialog } from "./FlashDialog";
import { SettingsPanel } from "./SettingsPanel";
import { SaveSplitButton } from "./SaveSplitButton";
import { editorStore } from "@/lib/store";
import { Button } from "@/components/ui/button";

export function Toolbar() {
  const [exportOpen, setExportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [flashOpen, setFlashOpen] = useState(false);
  const [flashLines, setFlashLines] = useState<string[]>([]);
  const [flashRunning, setFlashRunning] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [errorOpen, setErrorOpen] = useState(false);

  const canUndo = useStore(editorStore.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(editorStore.temporal, (s) => s.futureStates.length > 0);

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
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="sm"
          disabled={!canUndo}
          onClick={() => editorStore.temporal.getState().undo()}
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!canRedo}
          onClick={() => editorStore.temporal.getState().redo()}
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 className="h-4 w-4" />
        </Button>
      </div>
      <SaveSplitButton
        onFlash={handleFlash}
        onExport={() => setExportOpen(true)}
      />
      <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
        <Settings className="h-4 w-4 mr-1.5" />
        Settings
      </Button>

      <SettingsPanel open={settingsOpen} onOpenChange={setSettingsOpen} />
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
      <ErrorDialog open={errorOpen} onOpenChange={setErrorOpen} error={errorText} />
      <FlashDialog open={flashOpen} onOpenChange={setFlashOpen} lines={flashLines} running={flashRunning} />
    </div>
  );
}
