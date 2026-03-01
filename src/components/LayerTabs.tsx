"use client";

import { editorStore, useEditorStore } from "@/lib/store";
import { isModActiveLayer } from "@/lib/mod-active";
import { Button } from "@/components/ui/button";

export function LayerTabs() {
  const layers = useEditorStore((s) => s.config.layers);
  const activeIndex = useEditorStore((s) => s.activeLayerIndex);

  // Filter out the auto-managed mod_active layer
  const visibleLayers = layers
    .map((layer, idx) => ({ layer, idx }))
    .filter(({ layer }) => !isModActiveLayer(layer));

  return (
    <div data-testid="layer-tabs" className="flex items-center gap-2 flex-wrap">
      {visibleLayers.map(({ layer, idx }) => (
        <Button
          key={layer.id}
          variant={idx === activeIndex ? "default" : "outline"}
          size="sm"
          onClick={() => editorStore.getState().setActiveLayer(idx)}
        >
          {layer.name}
        </Button>
      ))}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => editorStore.getState().addLayer(`Layer ${layers.length}`)}
      >
        +
      </Button>
    </div>
  );
}
