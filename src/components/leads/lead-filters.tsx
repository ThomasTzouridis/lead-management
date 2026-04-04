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
import { LEAD_COLUMNS, type Client, type ColumnFilter } from "@/lib/lead-queries";

type Props = {
  clients: Client[];
  clientId: string;
  onClientChange: (id: string) => void;
  search: string;
  onSearchChange: (s: string) => void;
  filters: ColumnFilter[];
  onFiltersChange: (f: ColumnFilter[]) => void;
  customFieldKeys: string[];
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
}: Props) {
  const [localSearch, setLocalSearch] = useState(search);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [addingFilter, setAddingFilter] = useState<string | null>(null);
  const [filterValue, setFilterValue] = useState("");

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
              <span>
                {colLabel(f.column)}: {f.value}
              </span>
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
