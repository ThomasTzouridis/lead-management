"use client";

import { useRef, useState } from "react";
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

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB

export function StepUpload({ state, onUpdate, onNext, onBack }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);

  function handleFile(file: File | undefined) {
    if (!file) return;

    if (!file.name.endsWith(".csv") && file.type !== "text/csv") {
      toast.error("Please upload a CSV file");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error("File too large. Maximum 200 MB.");
      return;
    }

    setParsing(true);
    const allRows: Record<string, string>[] = [];
    let headers: string[] = [];

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      step: (result) => {
        if (result.errors.length > 0) return; // skip malformed rows
        if (headers.length === 0 && result.meta.fields) {
          headers = result.meta.fields;
        }
        allRows.push(result.data as Record<string, string>);
      },
      complete: (results) => {
        // Fallback: capture headers from complete callback if step didn't get them
        if (headers.length === 0 && results.meta.fields) {
          headers = results.meta.fields;
        }

        setParsing(false);

        if (allRows.length === 0) {
          toast.error("CSV is empty or all rows are malformed");
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
        setParsing(false);
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
          disabled={parsing}
          onChange={(e) => handleFile(e.target.files?.[0])}
          className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
        />
        {parsing && (
          <p className="text-sm text-muted-foreground mt-2">Parsing file...</p>
        )}
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
                  {state.headers.map((h, idx) => (
                    <th
                      key={`${h}-${idx}`}
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
                    {state.headers.map((h, idx) => (
                      <td
                        key={`${h}-${idx}`}
                        className="px-3 py-1.5 whitespace-nowrap max-w-[200px] truncate"
                      >
                        {row[h] != null && row[h] !== "" ? row[h] : "—"}
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
        <Button onClick={onNext} disabled={!hasFile || parsing}>
          Next: Map Columns
        </Button>
      </div>
    </div>
  );
}
