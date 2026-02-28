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

    // Auto-save on config changes (debounced 500ms)
    let timeout: ReturnType<typeof setTimeout>;
    const unsub = editorStore.subscribe((state, prevState) => {
      if (state.config !== prevState.config) {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          fetch("/api/config", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(state.config),
          }).catch(() => { /* silently ignore save errors */ });
        }, 500);
      }
    });

    return () => {
      clearTimeout(timeout);
      unsub();
    };
  }, []);
}
