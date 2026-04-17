"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil } from "lucide-react";
import { LEAD_COLUMNS } from "@/lib/lead-queries";
import { bulkUpdateField, bulkUpdateCustomField } from "@/lib/lead-queries";
import { toast } from "sonner";

type Props = {
  selectedCount: number;
  selectedIds: string[];
  customFieldKeys: string[];
  onDone: () => void;
};

export function LeadBulkFill({
  selectedCount,
  selectedIds,
  customFieldKeys,
  onDone,
}: Props) {
  const [open, setOpen] = useState(false);
  const [column, setColumn] = useState("");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  if (selectedCount === 0) return null;

  const allColumns = [
    ...LEAD_COLUMNS.map((c) => ({ key: c.key, label: c.label })),
    ...customFieldKeys.map((k) => ({ key: `cf:${k}`, label: k })),
  ];

  async function handleApply() {
    if (!column || !value.trim()) {
      toast.error("Select a column and enter a value");
      return;
    }

    setSaving(true);
    try {
      if (column.startsWith("cf:")) {
        const fieldName = column.slice(3);
        await bulkUpdateCustomField(selectedIds, fieldName, value.trim());
      } else {
        await bulkUpdateField(selectedIds, column, value.trim());
      }
      toast.success(
        `Updated "${value.trim()}" for ${selectedCount.toLocaleString()} leads`
      );
      setOpen(false);
      setColumn("");
      setValue("");
      onDone();
    } catch (err) {
      toast.error(
        `Failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <Pencil className="size-3.5" />
        Fill Column ({selectedCount.toLocaleString()})
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2 p-3 rounded-lg border bg-card flex-wrap">
      <span className="text-sm text-muted-foreground whitespace-nowrap">
        Set column
      </span>
      <div className="w-[220px] shrink-0">
        <Select value={column} onValueChange={(v) => setColumn(v ?? "")}>
          <SelectTrigger>
            <SelectValue placeholder="Pick column..." />
          </SelectTrigger>
          <SelectContent>
            {allColumns.map((c) => (
              <SelectItem key={c.key} value={c.key}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <span className="text-sm text-muted-foreground">=</span>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleApply();
        }}
        placeholder="Value for all selected..."
        className="flex-1 min-w-[320px]"
        autoFocus
      />
      <Button size="sm" onClick={handleApply} disabled={saving}>
        {saving ? "Saving..." : `Apply to ${selectedCount.toLocaleString()}`}
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setOpen(false);
          setColumn("");
          setValue("");
        }}
      >
        Cancel
      </Button>
    </div>
  );
}
