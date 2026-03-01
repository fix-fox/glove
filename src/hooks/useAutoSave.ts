"use client";

import { useEffect } from "react";
import { editorStore } from "@/lib/store";

export function useAutoSave() {
  useEffect(() => {
    // Hydrate from filesystem on mount
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => {
        if (data && !data.error) {
          editorStore.getState().loadConfig(data);
        }
      })
      .catch(() => { /* no saved config — use default */ });

    // Warn before closing with unsaved changes
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (editorStore.getState().isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);
}
