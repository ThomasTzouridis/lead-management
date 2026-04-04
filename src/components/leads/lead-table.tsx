"use client";

import { useRef, useState } from "react";
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
  extraColumns: string[];
  allCustomKeys: string[];
  onAddColumn: (name: string) => void;
};

export function LeadTable({
  leads,
  selectedIds,
  onSelectionChange,
  sortColumn,
  sortDir,
  onSort,
  onLeadUpdated,
  extraColumns,
  allCustomKeys,
  onAddColumn,
}: Props) {
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [editingCell, setEditingCell] = useState<{
    leadId: string;
    field: string;
  } | null>(null);
  const [editValue, setEditValue] = useState("");
  const savingRef = useRef(false); // Prevent double-save from Enter + onBlur

  // ── Compute visible columns (auto-hide empty) ──────────────────────
  const visibleRegularCols = LEAD_COLUMNS.filter((col) =>
    leads.some((lead) => {
      const val = lead[col.key as keyof Lead];
      return val != null && val !== "";
    })
  );

  // All known custom field keys: from current page + database + UI-added
  const customFieldKeys = new Set<string>();
  for (const lead of leads) {
    if (lead.custom_fields) {
      for (const key of Object.keys(lead.custom_fields)) {
        customFieldKeys.add(key);
      }
    }
  }
  for (const col of allCustomKeys) {
    customFieldKeys.add(col);
  }
  for (const col of extraColumns) {
    customFieldKeys.add(col);
  }

  // Show custom columns that exist in the database or were just added
  // (auto-hide only applies to regular columns — custom columns always show
  //  because they were intentionally created)
  const visibleCustomCols = Array.from(customFieldKeys);

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
    if (customFieldKeys.has(name)) {
      toast.error(`Column "${name}" already exists`);
      setAddingColumn(false);
      setNewColumnName("");
      return;
    }
    onAddColumn(name);
    setAddingColumn(false);
    setNewColumnName("");
    toast.success(`Column "${name}" added. Click cells to fill values.`);
  }

  // ── Inline edit ────────────────────────────────────────────────────
  function startEdit(leadId: string, field: string, currentValue: string) {
    setEditingCell({ leadId, field });
    setEditValue(currentValue);
  }

  async function saveEdit() {
    // Prevent double-save (Enter fires saveEdit, then onBlur fires it again)
    if (savingRef.current || !editingCell) return;
    savingRef.current = true;

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
          .update({ [field]: value || null }) // empty string → null (cleaner for DB)
          .eq("id", leadId);
        if (error) throw error;
      }
      setEditingCell(null);
      onLeadUpdated();
    } catch (err) {
      toast.error(
        `Failed to save: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      savingRef.current = false;
    }
  }

  function cancelEdit() {
    if (savingRef.current) return;
    setEditingCell(null);
  }

  // ── Sort icon ──────────────────────────────────────────────────────
  function SortIcon({ column }: { column: string }) {
    // Custom fields can't be sorted server-side
    if (column.startsWith("cf:")) return null;
    if (sortColumn !== column)
      return <ArrowUpDown className="size-3.5 ml-1 opacity-40" />;
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
              <span className="text-xs font-medium">{key}</span>
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
                <Button
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={confirmAddColumn}
                >
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
          <TableRow
            key={lead.id}
            data-state={selectedIds.has(lead.id) ? "selected" : undefined}
          >
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
                        if (e.key === "Escape") cancelEdit();
                      }}
                      onBlur={saveEdit}
                      className="h-7 text-xs"
                      autoFocus
                    />
                  ) : (
                    <span className="text-xs">
                      {display || (
                        <span className="text-muted-foreground">&mdash;</span>
                      )}
                    </span>
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
                        if (e.key === "Escape") cancelEdit();
                      }}
                      onBlur={saveEdit}
                      className="h-7 text-xs"
                      autoFocus
                    />
                  ) : (
                    <span className="text-xs">
                      {val || (
                        <span className="text-muted-foreground">&mdash;</span>
                      )}
                    </span>
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
