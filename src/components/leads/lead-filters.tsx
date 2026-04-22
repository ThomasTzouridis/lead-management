"use client";

import { useEffect, useRef, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, X } from "lucide-react";
import { LEAD_COLUMNS, type Client, type ColumnFilter, type UploadBatch, type BatchFilter, type ListFilter } from "@/lib/lead-queries";

type Props = {
  clients: Client[];
  clientId: string;
  onClientChange: (id: string) => void;
  search: string;
  onSearchChange: (s: string) => void;
  filters: ColumnFilter[];
  onFiltersChange: (f: ColumnFilter[]) => void;
  customFieldKeys: string[];
  batches: UploadBatch[];
  batchFilter: BatchFilter;
  onBatchFilterChange: (bf: BatchFilter) => void;
  listValues: string[];
  listFilter: ListFilter;
  onListFilterChange: (lf: ListFilter) => void;
};

export function LeadFilters({
  clients,
  clientId,
  onClientChange,
  search,
  onSearchChange,
  filters,
  onFiltersChange,
  customFieldKeys,
  batches,
  batchFilter,
  onBatchFilterChange,
  listValues,
  listFilter,
  onListFilterChange,
}: Props) {
  const [localSearch, setLocalSearch] = useState(search);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [addingFilter, setAddingFilter] = useState<string | null>(null);
  const [filterValue, setFilterValue] = useState("");
  const [editingFilterId, setEditingFilterId] = useState<string | null>(null);
  const [editFilterValue, setEditFilterValue] = useState("");

  // Debounce search
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSearchChange(localSearch);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [localSearch, onSearchChange]);

  function addFilter(column: string) {
    setAddingFilter(column);
    setFilterValue("");
  }

  function confirmFilter() {
    if (!addingFilter || !filterValue.trim()) return;
    const newFilter: ColumnFilter = {
      id: `${addingFilter}-${Date.now()}`,
      column: addingFilter,
      value: filterValue.trim(),
    };
    onFiltersChange([...filters, newFilter]);
    setAddingFilter(null);
    setFilterValue("");
  }

  function removeFilter(id: string) {
    onFiltersChange(filters.filter((f) => f.id !== id));
  }

  function startEditFilter(f: ColumnFilter) {
    setEditingFilterId(f.id);
    setEditFilterValue(f.value);
  }

  function confirmEditFilter() {
    if (!editingFilterId || !editFilterValue.trim()) return;
    onFiltersChange(
      filters.map((f) =>
        f.id === editingFilterId ? { ...f, value: editFilterValue.trim() } : f
      )
    );
    setEditingFilterId(null);
    setEditFilterValue("");
  }

  // Get display label for a column
  function colLabel(column: string): string {
    if (column.startsWith("cf:")) return column.slice(3);
    const found = LEAD_COLUMNS.find((c) => c.key === column);
    return found?.label || column;
  }

  // All available columns for filtering
  const filterableColumns = [
    ...LEAD_COLUMNS.map((c) => ({ key: c.key, label: c.label })),
    ...customFieldKeys.map((k) => ({ key: `cf:${k}`, label: k })),
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Client filter */}
        <div className="w-[200px]">
          <Select value={clientId} onValueChange={(v) => onClientChange(v ?? "all")}>
            <SelectTrigger>
              <SelectValue>
                {clientId === "all" ? "All Clients" : clients.find((c) => c.id === clientId)?.name}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clients</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* List filter (multi-select) — values auto-detected from custom_fields->>List */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex items-center gap-1.5 rounded-lg border border-input px-2.5 h-8 text-sm whitespace-nowrap min-w-[140px] max-w-[320px] overflow-hidden"
          >
            <span className="truncate">
              {listFilter.values.length === 0
                ? "All Lists"
                : listFilter.values.length === 1
                ? listFilter.values[0]
                : `${listFilter.values.length} lists`}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[260px] max-h-[400px] overflow-y-auto" align="start">
            {listValues.length === 0 ? (
              <div className="px-2 py-3 text-xs text-muted-foreground">
                No list values found
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <button
                    className="text-xs text-primary hover:underline"
                    onClick={() => onListFilterChange({ values: [...listValues] })}
                  >
                    Select all
                  </button>
                  {listFilter.values.length > 0 && (
                    <button
                      className="text-xs text-muted-foreground hover:underline"
                      onClick={() => onListFilterChange({ values: [] })}
                    >
                      Deselect all
                    </button>
                  )}
                </div>
                <div className="border-b my-1" />
                {listValues.map((v) => {
                  const checked = listFilter.values.includes(v);
                  return (
                    <label
                      key={v}
                      className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-accent rounded-sm"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? listFilter.values.filter((x) => x !== v)
                            : [...listFilter.values, v];
                          onListFilterChange({ values: next });
                        }}
                        className="rounded"
                      />
                      <span className="truncate">{v}</span>
                    </label>
                  );
                })}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Upload batch filter (multi-select with include/exclude) */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex items-center gap-1.5 rounded-lg border border-input px-2.5 h-8 text-sm whitespace-nowrap min-w-[140px] max-w-[320px] overflow-hidden"
          >
            <span className="truncate">
              {batchFilter.ids.length === 0
                ? "All Uploads"
                : `${batchFilter.mode === "exclude" ? "Excluding" : ""} ${batchFilter.ids.length} upload${batchFilter.ids.length !== 1 ? "s" : ""}`}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[340px] max-h-[400px] overflow-y-auto" align="start">
            {/* Mode toggle */}
            {batchFilter.ids.length > 0 && (
              <>
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <button
                    className={`px-2 py-0.5 text-xs rounded ${batchFilter.mode === "include" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                    onClick={() => onBatchFilterChange({ ...batchFilter, mode: "include" })}
                  >
                    Include
                  </button>
                  <button
                    className={`px-2 py-0.5 text-xs rounded ${batchFilter.mode === "exclude" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                    onClick={() => onBatchFilterChange({ ...batchFilter, mode: "exclude" })}
                  >
                    Exclude
                  </button>
                  <button
                    className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => onBatchFilterChange({ mode: "include", ids: [] })}
                  >
                    Clear
                  </button>
                </div>
                <div className="border-b my-1" />
              </>
            )}
            {/* Select all / Deselect all */}
            <div className="flex items-center gap-2 px-2 py-1.5">
              <button
                className="text-xs text-primary hover:underline"
                onClick={() => onBatchFilterChange({ ...batchFilter, ids: batches.map((b) => b.id) })}
              >
                Select all
              </button>
              {batchFilter.ids.length > 0 && (
                <button
                  className="text-xs text-muted-foreground hover:underline"
                  onClick={() => onBatchFilterChange({ mode: "include", ids: [] })}
                >
                  Deselect all
                </button>
              )}
            </div>
            <div className="border-b my-1" />
            {/* Batch list with checkboxes */}
            {batches.map((b) => {
              const checked = batchFilter.ids.includes(b.id);
              return (
                <label
                  key={b.id}
                  className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-accent rounded-sm"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const next = checked
                        ? batchFilter.ids.filter((id) => id !== b.id)
                        : [...batchFilter.ids, b.id];
                      onBatchFilterChange({ ...batchFilter, ids: next });
                    }}
                    className="rounded"
                  />
                  <span className="truncate">#{b.upload_number} — {b.filename}</span>
                </label>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-[400px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Search name, email, company, LinkedIn..."
            className="pl-8"
          />
        </div>

        {/* Add filter button */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-input px-3 h-8 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            <Plus className="size-3.5" />
            Add Filter
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Filter by column</DropdownMenuLabel>
              {filterableColumns.map((col) => (
                <DropdownMenuItem key={col.key} onClick={() => addFilter(col.key)}>
                  {col.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Adding a filter value */}
      {addingFilter && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {colLabel(addingFilter)} contains:
          </span>
          <Input
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmFilter();
              if (e.key === "Escape") setAddingFilter(null);
            }}
            placeholder="Type filter value..."
            className="w-[200px]"
            autoFocus
          />
          <Button size="sm" onClick={confirmFilter}>
            Apply
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAddingFilter(null)}>
            Cancel
          </Button>
        </div>
      )}

      {/* Active filters */}
      {filters.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {filters.map((f) => (
            <Badge key={f.id} variant="secondary" className="gap-1 pr-1">
              {editingFilterId === f.id ? (
                <div className="flex items-center gap-1">
                  <span className="text-xs">{colLabel(f.column)}:</span>
                  <input
                    value={editFilterValue}
                    onChange={(e) => setEditFilterValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") confirmEditFilter();
                      if (e.key === "Escape") setEditingFilterId(null);
                    }}
                    onBlur={confirmEditFilter}
                    className="w-20 bg-transparent text-xs outline-none border-b border-foreground/30"
                    autoFocus
                  />
                </div>
              ) : (
                <span
                  className="cursor-pointer"
                  onClick={() => startEditFilter(f)}
                  title="Click to edit"
                >
                  {colLabel(f.column)}: {f.value}
                </span>
              )}
              <button
                onClick={() => removeFilter(f.id)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10 transition-colors"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          <button
            onClick={() => onFiltersChange([])}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
