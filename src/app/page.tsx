"use client";

import { LayerTabs } from "@/components/LayerTabs";
import { KeyboardLayout } from "@/components/KeyboardLayout";
import { KeyEditor } from "@/components/KeyEditor";
import { Toolbar } from "@/components/Toolbar";
import { useAutoSave } from "@/hooks/useAutoSave";
import { editorStore } from "@/lib/store";

export default function Home() {
  useAutoSave();

  return (
    <div
      className="flex flex-col items-center gap-6 p-8 min-h-screen"
      onClick={() => editorStore.getState().selectKey(null)}
    >
      <Toolbar />
      <LayerTabs />
      <KeyboardLayout />
      <KeyEditor />
    </div>
  );
}
