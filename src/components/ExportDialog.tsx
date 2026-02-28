"use client";

import { useState } from "react";
import JSZip from "jszip";
import { useEditorStore } from "@/lib/store";
import { generateKeymap } from "@/lib/generator";
import { generateRepo } from "@/lib/repo-generator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function ExportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const config = useEditorStore((s) => s.config);
  const [copied, setCopied] = useState(false);

  const result = generateKeymap(config);

  const handleCopy = async () => {
    if (!result.ok) return;
    await navigator.clipboard.writeText(result.keymap);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadRepo = async () => {
    const repoResult = generateRepo(config);
    if (!repoResult.ok) return;

    const zip = new JSZip();
    for (const file of repoResult.files) {
      zip.file(file.path, file.content);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${config.name || "glove80"}-zmk-config.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {result.ok ? "Export .keymap" : "Validation Errors"}
          </DialogTitle>
        </DialogHeader>

        {result.ok ? (
          <pre className="flex-1 overflow-auto rounded border bg-muted p-4 text-xs font-mono whitespace-pre">
            {result.keymap}
          </pre>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Fix these errors before exporting:
            </p>
            <ul className="space-y-1 text-sm text-destructive">
              {result.errors.map((e, i) => (
                <li key={i}>
                  <span className="font-mono text-xs">{e.path}</span>:{" "}
                  {e.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter>
          {result.ok && (
            <>
              <Button onClick={handleDownloadRepo} variant="outline">
                Download Repo (.zip)
              </Button>
              <Button onClick={handleCopy} variant="outline">
                {copied ? "Copied!" : "Copy to clipboard"}
              </Button>
            </>
          )}
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
