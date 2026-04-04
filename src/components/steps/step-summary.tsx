"use client";

import { Button } from "@/components/ui/button";
import type { UploadState } from "@/app/page";

type Props = {
  state: UploadState;
  onReset: () => void;
};

export function StepSummary({ state, onReset }: Props) {
  const r = state.results;

  if (!r) return null;

  function downloadNewOnly() {
    if (!r || r.newLeads.length === 0) return;

    // Get all keys from the mapping (target fields that were used)
    const fields = Object.values(state.mapping).filter((v) => v !== "skip");
    if (fields.length === 0) return;

    const csvRows = [fields.join(",")];
    for (const lead of r.newLeads) {
      const row = fields.map((f) => {
        const val = lead[f];
        const str = val == null ? "" : String(val);
        return str.includes(",") || str.includes('"') || str.includes("\n")
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      });
      csvRows.push(row.join(","));
    }

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `new-leads-${state.file?.name || "export.csv"}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Import Complete</h2>
        <p className="text-sm text-muted-foreground">
          Upload for <strong>{state.clientName}</strong>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-lg bg-card border text-center">
          <p className="text-3xl font-bold">{r.total.toLocaleString()}</p>
          <p className="text-sm text-muted-foreground">Total Rows</p>
        </div>
        <div className="p-4 rounded-lg bg-card border text-center">
          <p className="text-3xl font-bold text-green-600">
            {r.imported.toLocaleString()}
          </p>
          <p className="text-sm text-muted-foreground">Imported</p>
        </div>
        <div className="p-4 rounded-lg bg-card border text-center">
          <p className="text-3xl font-bold text-yellow-600">
            {r.skippedNoContact.toLocaleString()}
          </p>
          <p className="text-sm text-muted-foreground">Skipped (No Contact)</p>
        </div>
        <div className="p-4 rounded-lg bg-card border text-center">
          <p className="text-3xl font-bold text-red-600">
            {r.skippedDuplicate.toLocaleString()}
          </p>
          <p className="text-sm text-muted-foreground">Skipped (Duplicate)</p>
        </div>
      </div>

      <div className="flex gap-3">
        {r.newLeads.length > 0 && (
          <Button onClick={downloadNewOnly} variant="outline">
            Download New Leads CSV
          </Button>
        )}
        <Button onClick={onReset}>Upload Another CSV</Button>
      </div>
    </div>
  );
}
