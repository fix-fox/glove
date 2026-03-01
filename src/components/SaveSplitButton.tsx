"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { editorStore, useEditorStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function SaveSplitButton({
  onFlash,
  onExport,
}: {
  onFlash: () => void;
  onExport: () => void;
}) {
  const isDirty = useEditorStore((s) => s.isDirty);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editorStore.getState().config),
      });
      const data = await res.json();
      if (data.ok) {
        editorStore.getState().markClean();
        toast.success("Saved");
      } else {
        toast.error(`Error: ${data.error}`);
      }
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  const variant = isDirty ? "default" : "outline";

  return (
    <div className="flex">
      <Button
        variant={variant}
        size="sm"
        className="rounded-r-none"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? "Saving..." : "Save"}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={variant}
            size="sm"
            className="rounded-l-none border-l-0 px-1.5"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={onFlash}>Flash</DropdownMenuItem>
          <DropdownMenuItem onClick={onExport}>Export .keymap</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
