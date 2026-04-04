"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Papa from "papaparse";
import type { UploadState } from "@/app/page";

type Props = {
  state: UploadState;
  onUpdate: (partial: Partial<UploadState>) => void;
  onNext: () => void;
  onBack: () => void;
};

export function StepUpload({ state, onUpdate, onNext, onBack }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File | undefined) {
    if (!file) return;

    // Stream-parse: collect all rows but in streaming mode to handle large files
    const allRows: Record<string, string>[] = [];
    let headers: string[] = [];

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      step: (result) => {
        if (headers.length === 0 && result.meta.fields) {
          headers = result.meta.fields;
        }
        allRows.push(result.data as Record<string, string>);
      },
      complete: () => {
        if (allRows.length === 0) {
          toast.error("CSV is empty");
          return;
        }

        const previewRows = allRows.slice(0, 5);

        onUpdate({
          file,
          headers,
          previewRows,
          allRows,
          mapping: {}, // reset mapping when new file is uploaded
        });

        toast.success(`Parsed ${allRows.length.toLocaleString()} rows`);
      },
      error: (err) => {
        toast.error(`Parse error: ${err.message}`);
      },
    });
  }

  const hasFile = state.headers.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Step 2: Upload CSV</h2>
        <p className="text-sm text-muted-foreground">
          Uploading for: <strong>{state.clientName}</strong>
        </p>
      </div>

      <div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          onChange={(e) => handleFile(e.target.files?.[0])}
          className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
        />
      </div>

      {hasFile && (
        <div className="space-y-3">
          <p className="text-sm font-medium">
            {state.allRows.length.toLocaleString()} rows,{" "}
            {state.headers.length} columns detected
          </p>

          {/* Preview table */}
          <div className="border rounded-lg overflow-auto max-h-[300px]">
            <table className="w-full text-xs">
              <thead className="bg-muted sticky top-0">
                <tr>
                  {state.headers.map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left font-medium whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.previewRows.map((row, i) => (
                  <tr key={i} className="border-t">
                    {state.headers.map((h) => (
                      <td
                        key={h}
                        className="px-3 py-1.5 whitespace-nowrap max-w-[200px] truncate"
                      >
                        {row[h] || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Showing first 5 rows as preview
          </p>
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext} disabled={!hasFile}>
          Next: Map Columns
        </Button>
      </div>
    </div>
  );
}
