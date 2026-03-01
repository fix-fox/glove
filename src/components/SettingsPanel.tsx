"use client";

import { useState } from "react";
import { MacroEditorContent } from "./MacroEditor";
import { ComboEditorContent } from "./ComboEditor";
import { ConditionalLayerEditorContent } from "./ConditionalLayerEditor";
import { HrmSettingsPanel, LtSettingsPanel, MouseSettingsPanel } from "./SettingsDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { key: "macros", label: "Macros" },
  { key: "combos", label: "Combos" },
  { key: "cond-layers", label: "Cond. Layers" },
  { key: "hrm", label: "HRM" },
  { key: "layer-tap", label: "Layer-Tap" },
  { key: "mouse", label: "Mouse" },
] as const;

type Category = (typeof CATEGORIES)[number]["key"];

function CategoryContent({ category }: { category: Category }) {
  switch (category) {
    case "macros":
      return <MacroEditorContent />;
    case "combos":
      return <ComboEditorContent />;
    case "cond-layers":
      return <ConditionalLayerEditorContent />;
    case "hrm":
      return <HrmSettingsPanel />;
    case "layer-tap":
      return <LtSettingsPanel />;
    case "mouse":
      return <MouseSettingsPanel />;
  }
}

export function SettingsPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [category, setCategory] = useState<Category>("macros");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[50vw] h-[75vh] max-w-none sm:max-w-none p-0 gap-0 flex flex-row overflow-hidden">
        {/* Sidebar */}
        <nav className="w-48 shrink-0 border-r bg-muted/30 p-2 flex flex-col gap-1">
          <DialogHeader className="px-2 py-3">
            <DialogTitle className="text-base">Settings</DialogTitle>
          </DialogHeader>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setCategory(cat.key)}
              className={cn(
                "text-sm text-left rounded-md px-3 py-2 transition-colors",
                category === cat.key
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
              )}
            >
              {cat.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0 overflow-y-auto p-6">
          <h2 className="text-lg font-semibold mb-4">
            {CATEGORIES.find((c) => c.key === category)!.label}
          </h2>
          <CategoryContent category={category} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
