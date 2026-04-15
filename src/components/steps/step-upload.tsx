"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Papa from "papaparse";
import type { UploadState } from "@/app/page";
import {
  fetchMappingTemplates,
  classifyTemplateMatches,
  applyMappingTemplate,
  type MappingTemplate,
} from "@/lib/lead-queries";

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
  const [templates, setTemplates] = useState<MappingTemplate[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchMappingTemplates()
      .then((data) => {
        if (!cancelled) setTemplates(data);
      })
      .catch(() => {
        /* silent — step 3 will surface the error */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const matches = useMemo(
    () =>
      state.headers.length > 0
        ? classifyTemplateMatches(templates, state.headers)
        : { exact: [], partial: [] },
    [templates, state.headers]
  );

  const suggestedTemplate =
    matches.exact[0] || matches.partial[0]?.template || null;
  const suggestedIsExact = matches.exact.length > 0;
  const suggestedPartialInfo =
    !suggestedIsExact && matches.partial[0]
      ? { overlap: matches.partial[0].overlap, total: matches.partial[0].total }
      : null;

  function handleApplySuggested(template: MappingTemplate) {
    const applied = applyMappingTemplate(template, state.headers, state.customFields);
    const headerSet = new Set(state.headers);
    const reviewed = template.headers.filter((h) => headerSet.has(h));
    onUpdate({
      mapping: applied.mapping,
      customFields: applied.customFields,
      reviewedHeaders: reviewed,
    });
    toast.success(
      `Template "${template.name}" applied (${Object.keys(applied.mapping).length} columns)`
    );
  }

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
    const previewRows: Record<string, string>[] = [];
    let headers: string[] = [];
    let rowCount = 0;
    let malformedCount = 0;
    const PREVIEW_LIMIT = 20;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      // Stream row-by-row so we never hold the full file in memory.
      step: (result) => {
        if (result.errors.length > 0) {
          malformedCount++;
          return;
        }
        if (headers.length === 0 && result.meta.fields) {
          headers = result.meta.fields;
        }
        rowCount++;
        if (previewRows.length < PREVIEW_LIMIT) {
          previewRows.push(result.data as Record<string, string>);
        }
      },
      complete: (results) => {
        // Fallback: capture headers from complete callback if step didn't get them
        if (headers.length === 0 && results.meta.fields) {
          headers = results.meta.fields;
        }

        setParsing(false);

        if (rowCount === 0) {
          toast.error("CSV is empty or all rows are malformed");
          return;
        }

        // Preserve existing mapping if the headers are identical to the previous upload
        // (e.g. user reloaded mid-wizard and re-uploaded the same file).
        const sameHeaders =
          state.headers.length === headers.length &&
          [...state.headers].sort().join("|") === [...headers].sort().join("|");

        onUpdate({
          file,
          headers,
          previewRows,
          rowCount,
          mapping: sameHeaders ? state.mapping : {},
          reviewedHeaders: sameHeaders ? state.reviewedHeaders : [],
        });

        if (malformedCount > 0) {
          toast.warning(
            `Parsed ${rowCount.toLocaleString()} rows — ${malformedCount.toLocaleString()} malformed rows skipped`
          );
        } else {
          toast.success(`Parsed ${rowCount.toLocaleString()} rows`);
        }
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
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">
              {state.rowCount.toLocaleString()} rows,{" "}
              {state.headers.length} columns detected
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (fileRef.current) fileRef.current.value = "";
                onUpdate({
                  file: null,
                  headers: [],
                  previewRows: [],
                  rowCount: 0,
                  mapping: {},
                  reviewedHeaders: [],
                });
              }}
            >
              Remove file
            </Button>
          </div>

          {/* Template match banner */}
          {suggestedTemplate && (
            <div
              className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${
                suggestedIsExact
                  ? "bg-green-950/40 border-green-700/60"
                  : "bg-amber-950/30 border-amber-700/50"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  📋 {suggestedIsExact ? "Matching template found" : "Similar template found"}:{" "}
                  <span className="font-semibold">{suggestedTemplate.name}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {suggestedIsExact
                    ? "Headers match exactly. Click Apply to auto-fill the column mapping."
                    : `${suggestedPartialInfo?.overlap} of ${suggestedPartialInfo?.total} columns match. Apply and review in Step 3.`}
                </p>
              </div>
              <Button size="sm" onClick={() => handleApplySuggested(suggestedTemplate)}>
                Apply
              </Button>
            </div>
          )}

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
            Showing first {state.previewRows.length} rows as preview
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
