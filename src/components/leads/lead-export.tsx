"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import {
  fetchAllFilteredLeads,
  LEAD_COLUMNS,
  type Lead,
  type ColumnFilter,
} from "@/lib/lead-queries";
import { toast } from "sonner";

type Props = {
  clientId?: string;
  search?: string;
  filters?: ColumnFilter[];
  sortColumn?: string;
  sortDir?: "asc" | "desc";
};

function escapeCSV(val: unknown): string {
  const str = val == null ? "" : String(val);
  return str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r")
    ? `"${str.replace(/"/g, '""')}"`
    : str;
}

export function LeadExport({ clientId, search, filters, sortColumn, sortDir }: Props) {
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const leads = await fetchAllFilteredLeads({
        clientId: clientId && clientId !== "all" ? clientId : undefined,
        search,
        filters,
        sortColumn,
        sortDir,
      });

      if (leads.length === 0) {
        toast.error("No leads to export");
        return;
      }

      // Compute visible columns from ALL exported data (auto-hide)
      const visibleRegular = LEAD_COLUMNS.filter((col) =>
        leads.some((lead) => {
          const val = lead[col.key as keyof Lead];
          return val != null && val !== "";
        })
      );

      // Collect custom field keys
      const customKeys = new Set<string>();
      for (const lead of leads) {
        if (lead.custom_fields) {
          for (const key of Object.keys(lead.custom_fields)) {
            if (
              leads.some((l) => {
                const v = l.custom_fields?.[key];
                return v != null && v !== "";
              })
            ) {
              customKeys.add(key);
            }
          }
        }
      }

      const customKeysArr = Array.from(customKeys);
      const headers = [
        ...visibleRegular.map((c) => c.label),
        ...customKeysArr,
      ];

      const csvRows = [headers.map(escapeCSV).join(",")];

      for (const lead of leads) {
        const row = [
          ...visibleRegular.map((col) =>
            escapeCSV(lead[col.key as keyof Lead])
          ),
          ...customKeysArr.map((k) =>
            escapeCSV(lead.custom_fields?.[k] || "")
          ),
        ];
        csvRows.push(row.join(","));
      }

      const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const date = new Date().toISOString().slice(0, 10);
      a.download = `leads-export-${date}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);

      toast.success(
        `Exported ${leads.length.toLocaleString()} leads`
      );
    } catch (err) {
      toast.error(
        `Export failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={exporting}
      className="gap-1.5"
    >
      <Download className="size-3.5" />
      {exporting ? "Exporting..." : "Download CSV"}
    </Button>
  );
}
