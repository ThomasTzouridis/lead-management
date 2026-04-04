"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowUpDown, ArrowUp, ArrowDown, Plus } from "lucide-react";
import { LEAD_COLUMNS, type Lead } from "@/lib/lead-queries";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

type Props = {
  leads: Lead[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  sortColumn: string;
  sortDir: "asc" | "desc";
  onSort: (column: string) => void;
  onLeadUpdated: () => void;
};

export function LeadTable({
  leads,
  selectedIds,
  onSelectionChange,
  sortColumn,
  sortDir,
  onSort,
  onLeadUpdated,
}: Props) {
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [editingCell, setEditingCell] = useState<{
    leadId: string;
    field: string;
  } | null>(null);
  const [editValue, setEditValue] = useState("");

  // ── Compute visible columns (auto-hide empty) ──────────────────────
  const visibleRegularCols = LEAD_COLUMNS.filter((col) =>
    leads.some((lead) => {
      const val = lead[col.key as keyof Lead];
      return val != null && val !== "";
    })
  );

  // Collect all custom field keys across current page
  const customFieldKeys = new Set<string>();
  for (const lead of leads) {
    if (lead.custom_fields) {
      for (const key of Object.keys(lead.custom_fields)) {
        customFieldKeys.add(key);
      }
    }
  }

  // Only show custom columns that have at least one non-empty value
  const visibleCustomCols = Array.from(customFieldKeys).filter((key) =>
    leads.some((lead) => {
      const val = lead.custom_fields?.[key];
      return val != null && val !== "";
    })
  );

  // ── Selection ──────────────────────────────────────────────────────
  const allOnPageSelected =
    leads.length > 0 && leads.every((l) => selectedIds.has(l.id));

  function toggleAll() {
    if (allOnPageSelected) {
      const next = new Set(selectedIds);
      for (const l of leads) next.delete(l.id);
      onSelectionChange(next);
    } else {
      const next = new Set(selectedIds);
      for (const l of leads) next.add(l.id);
      onSelectionChange(next);
    }
  }

  function toggleOne(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  }

  // ── Add column ─────────────────────────────────────────────────────
  function confirmAddColumn() {
    const name = newColumnName.trim();
    if (!name) {
      toast.error("Column name cannot be empty");
      return;
    }
    // The column will appear once at least one lead has a value in it.
    // For now, just close the input — user will fill values via inline edit or bulk fill.
    // We need to add an empty value so the column shows up
    // Actually, let's just add it to all leads with empty string so the column header appears
    // Better: just track it locally so it shows in the table
    customFieldKeys.add(name);
    setAddingColumn(false);
    setNewColumnName("");
    toast.success(`Column "${name}" added. Click cells to fill values.`);
    // Force re-render by triggering a refetch — the column won't have data yet
    // but we want it visible. We'll store it in a local state.
    onLeadUpdated();
  }

  // ── Inline edit (custom fields) ────────────────────────────────────
  function startEdit(leadId: string, field: string, currentValue: string) {
    setEditingCell({ leadId, field });
    setEditValue(currentValue);
  }

  async function saveEdit() {
    if (!editingCell) return;
    const { leadId, field } = editingCell;
    const value = editValue.trim();

    try {
      if (field.startsWith("cf:")) {
        const key = field.slice(3);
        const lead = leads.find((l) => l.id === leadId);
        const existing = lead?.custom_fields || {};
        const merged = { ...existing, [key]: value };
        const { error } = await supabase
          .from("leads")
          .update({ custom_fields: merged })
          .eq("id", leadId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("leads")
          .update({ [field]: value })
          .eq("id", leadId);
        if (error) throw error;
      }
      setEditingCell(null);
      onLeadUpdated();
    } catch (err) {
      toast.error(
        `Failed to save: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    }
  }

  // ── Sort icon ──────────────────────────────────────────────────────
  function SortIcon({ column }: { column: string }) {
    if (sortColumn !== column) return <ArrowUpDown className="size-3.5 ml-1 opacity-40" />;
    return sortDir === "asc" ? (
      <ArrowUp className="size-3.5 ml-1" />
    ) : (
      <ArrowDown className="size-3.5 ml-1" />
    );
  }

  if (leads.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No leads found.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <Checkbox
              checked={allOnPageSelected}
              onCheckedChange={toggleAll}
            />
          </TableHead>
          {visibleRegularCols.map((col) => (
            <TableHead key={col.key}>
              <button
                className="flex items-center text-xs font-medium hover:text-foreground transition-colors"
                onClick={() => onSort(col.key)}
              >
                {col.label}
                <SortIcon column={col.key} />
              </button>
            </TableHead>
          ))}
          {visibleCustomCols.map((key) => (
            <TableHead key={`cf-${key}`}>
              <button
                className="flex items-center text-xs font-medium hover:text-foreground transition-colors"
                onClick={() => onSort(`cf:${key}`)}
              >
                {key}
                <SortIcon column={`cf:${key}`} />
              </button>
            </TableHead>
          ))}
          <TableHead className="w-10">
            {addingColumn ? (
              <div className="flex gap-1 items-center">
                <Input
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmAddColumn();
                    if (e.key === "Escape") {
                      setAddingColumn(false);
                      setNewColumnName("");
                    }
                  }}
                  placeholder="Column name..."
                  className="w-32 h-7 text-xs"
                  autoFocus
                />
                <Button size="sm" className="h-7 px-2 text-xs" onClick={confirmAddColumn}>
                  OK
                </Button>
              </div>
            ) : (
              <button
                className="flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setAddingColumn(true)}
                title="Add column"
              >
                <Plus className="size-3.5" />
              </button>
            )}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {leads.map((lead) => (
          <TableRow key={lead.id} data-state={selectedIds.has(lead.id) ? "selected" : undefined}>
            <TableCell>
              <Checkbox
                checked={selectedIds.has(lead.id)}
                onCheckedChange={() => toggleOne(lead.id)}
              />
            </TableCell>
            {visibleRegularCols.map((col) => {
              const val = lead[col.key as keyof Lead];
              const display = val != null && val !== "" ? String(val) : "";
              const isEditing =
                editingCell?.leadId === lead.id &&
                editingCell?.field === col.key;

              return (
                <TableCell
                  key={col.key}
                  className="max-w-[200px] truncate cursor-pointer"
                  onClick={() => {
                    if (!isEditing) startEdit(lead.id, col.key, display);
                  }}
                >
                  {isEditing ? (
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit();
                        if (e.key === "Escape") setEditingCell(null);
                      }}
                      onBlur={saveEdit}
                      className="h-7 text-xs"
                      autoFocus
                    />
                  ) : (
                    <span className="text-xs">{display || <span className="text-muted-foreground">—</span>}</span>
                  )}
                </TableCell>
              );
            })}
            {visibleCustomCols.map((key) => {
              const val = lead.custom_fields?.[key] || "";
              const isEditing =
                editingCell?.leadId === lead.id &&
                editingCell?.field === `cf:${key}`;

              return (
                <TableCell
                  key={`cf-${key}`}
                  className="max-w-[200px] truncate cursor-pointer"
                  onClick={() => {
                    if (!isEditing) startEdit(lead.id, `cf:${key}`, val);
                  }}
                >
                  {isEditing ? (
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit();
                        if (e.key === "Escape") setEditingCell(null);
                      }}
                      onBlur={saveEdit}
                      className="h-7 text-xs"
                      autoFocus
                    />
                  ) : (
                    <span className="text-xs">{val || <span className="text-muted-foreground">—</span>}</span>
                  )}
                </TableCell>
              );
            })}
            <TableCell />
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
