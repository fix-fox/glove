"use client";

import { useState } from "react";
import { ExportDialog } from "./ExportDialog";
import { ErrorDialog } from "./ErrorDialog";
import { MacroEditor } from "./MacroEditor";
import { ComboEditor } from "./ComboEditor";
import { ConditionalLayerEditor } from "./ConditionalLayerEditor";
import { SettingsDialog } from "./SettingsDialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function Toolbar() {
  const [exportOpen, setExportOpen] = useState(false);
  const [macrosOpen, setMacrosOpen] = useState(false);
  const [combosOpen, setCombosOpen] = useState(false);
  const [condLayersOpen, setCondLayersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [errorOpen, setErrorOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      onClick={(e) => e.stopPropagation()}
    >
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
    </div>
  );
}
