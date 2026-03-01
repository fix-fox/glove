"use client";

import { useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface FlashDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lines: string[];
  running: boolean;
}

export function FlashDialog({ open, onOpenChange, lines, running }: FlashDialogProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines.length]);

  // Auto-close on success
  useEffect(() => {
    const lastLine = lines[lines.length - 1];
    if (!running && lastLine !== undefined && lastLine.includes("Done!")) {
      const timer = setTimeout(() => onOpenChange(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [running, lines, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Flash Firmware</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto bg-muted rounded-md p-3 font-mono text-xs whitespace-pre-wrap min-h-[200px]">
          {lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
          {running && <div className="animate-pulse">...</div>}
          <div ref={endRef} />
        </div>
        <div className="flex justify-end">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {running ? "Close" : "Done"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
