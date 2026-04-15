"use client";

import { Button } from "@/components/ui/button";
import { CUSTOM_FIELD_PREFIX } from "@/lib/constants";
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

    // Get unique target fields from mapping
    const allFields = [...new Set(Object.values(state.mapping).filter((v) => v !== "skip"))];
    if (allFields.length === 0) return;

    // Split into regular fields and custom fields
    const regularFields = allFields.filter((f) => !f.startsWith(CUSTOM_FIELD_PREFIX));
    const customFieldKeys = allFields
      .filter((f) => f.startsWith(CUSTOM_FIELD_PREFIX))
      .map((f) => f.slice(CUSTOM_FIELD_PREFIX.length));

    const headerNames = [...regularFields, ...customFieldKeys];

    function escapeCSV(val: unknown): string {
      const str = val == null ? "" : String(val);
      return str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    }

    const csvRows = [headerNames.map(escapeCSV).join(",")];
    for (const lead of r.newLeads) {
      const customObj = (lead.custom_fields || {}) as Record<string, string>;
      const row = [
        ...regularFields.map((f) => escapeCSV(lead[f])),
        ...customFieldKeys.map((k) => escapeCSV(customObj[k])),
      ];
      csvRows.push(row.join(","));
    }

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const baseName = (state.file?.name || "export.csv").replace(/\.[^.]+$/, "");
    a.download = `new-leads-${baseName}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">
          Import Complete
          {r.uploadNumber != null && (
            <span className="ml-2 text-muted-foreground font-normal">
              — Upload #{r.uploadNumber}
            </span>
          )}
        </h2>
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
