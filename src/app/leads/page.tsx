"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LeadTable } from "@/components/leads/lead-table";
import { LeadFilters } from "@/components/leads/lead-filters";
import { LeadPagination } from "@/components/leads/lead-pagination";
import { LeadExport } from "@/components/leads/lead-export";
import { LeadDelete } from "@/components/leads/lead-delete";
import { LeadBulkFill } from "@/components/leads/lead-bulk-fill";
import {
  fetchLeads,
  fetchClients,
  fetchCustomFieldKeys,
  fetchAllFilteredLeadIds,
  fetchUploadBatches,
  type Lead,
  type Client,
  type ColumnFilter,
  type UploadBatch,
} from "@/lib/lead-queries";
import { toast } from "sonner";

const PAGE_SIZE = 50;

export default function LeadsPage() {
  // ── State ────────────────────────────────────────────────────────────
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("all");
  const [batches, setBatches] = useState<UploadBatch[]>([]);
  const [batchId, setBatchId] = useState("all");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ColumnFilter[]>([]);
  const [sortColumn, setSortColumn] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Track refetch trigger
  const [refetchKey, setRefetchKey] = useState(0);

  // Columns added via "Add Column" button (persist until page reload)
  const [extraColumns, setExtraColumns] = useState<string[]>([]);

  // All custom field keys from the database (persists across reloads)
  const [dbCustomKeys, setDbCustomKeys] = useState<string[]>([]);

  // ── Derived ──────────────────────────────────────────────────────────
  const customFieldKeys = useMemo(() => {
    // Start with DB keys (already in registry order from fetchCustomFieldKeys)
    const keys = new Set<string>(dbCustomKeys);
    // Add any keys from the current page of leads not yet in the set
    for (const lead of leads) {
      if (lead.custom_fields) {
        for (const key of Object.keys(lead.custom_fields)) {
          keys.add(key);
        }
      }
    }
    // Include columns added via UI even if no data yet
    for (const col of extraColumns) {
      keys.add(col);
    }
    return Array.from(keys);
  }, [leads, dbCustomKeys, extraColumns]);

  // ── Load clients + custom field keys once ────────────────────────────
  useEffect(() => {
    fetchClients()
      .then(setClients)
      .catch((err) => toast.error(`Failed to load clients: ${err.message}`));
    fetchCustomFieldKeys()
      .then(setDbCustomKeys)
      .catch(() => {}); // Silently fail — keys will still be derived from current page
    fetchUploadBatches()
      .then(setBatches)
      .catch(() => {});
  }, []);

  // Reload batches when client filter changes (shows only that client's uploads)
  useEffect(() => {
    fetchUploadBatches(clientId !== "all" ? clientId : undefined)
      .then(setBatches)
      .catch(() => {});
  }, [clientId, refetchKey]);

  // Refresh custom field keys after any data mutation (bulk fill, inline edit, etc.)
  useEffect(() => {
    if (refetchKey === 0) return; // Skip initial mount
    fetchCustomFieldKeys()
      .then(setDbCustomKeys)
      .catch(() => {});
  }, [refetchKey]);

  // ── Fetch leads on any state change ─────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchLeads({
      clientId: clientId !== "all" ? clientId : undefined,
      batchId: batchId !== "all" ? batchId : undefined,
      search: search || undefined,
      filters: filters.length > 0 ? filters : undefined,
      customFieldKeys: dbCustomKeys.length > 0 ? dbCustomKeys : undefined,
      sortColumn: sortColumn.startsWith("cf:") ? undefined : sortColumn,
      sortDir,
      page,
      pageSize: PAGE_SIZE,
    })
      .then(({ data, count }) => {
        if (cancelled) return;
        setLeads(data);
        setTotalCount(count);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(`Failed to load leads: ${err.message}`);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, batchId, search, filters, sortColumn, sortDir, page, refetchKey, dbCustomKeys]);

  // ── Reset page on filter/search/sort change ─────────────────────────
  const handleClientChange = useCallback((id: string) => {
    setClientId(id);
    setBatchId("all");
    setPage(0);
    setSelectedIds(new Set());
  }, []);

  const handleBatchChange = useCallback((id: string) => {
    setBatchId(id);
    setPage(0);
    setSelectedIds(new Set());
  }, []);

  const handleSearchChange = useCallback((s: string) => {
    setSearch(s);
    setPage(0);
    setSelectedIds(new Set());
  }, []);

  const handleFiltersChange = useCallback((f: ColumnFilter[]) => {
    setFilters(f);
    setPage(0);
    setSelectedIds(new Set());
  }, []);

  const handleSort = useCallback(
    (col: string) => {
      // Custom fields can't be sorted server-side (JSONB)
      if (col.startsWith("cf:")) return;
      if (col === sortColumn) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortColumn(col);
        setSortDir("asc");
      }
      setPage(0);
    },
    [sortColumn]
  );

  function refetch() {
    setRefetchKey((k) => k + 1);
    setSelectedIds(new Set());
  }

  // ── "Select all filtered" ──────────────────────────────────────────
  const [selectingAll, setSelectingAll] = useState(false);

  async function selectAllFiltered() {
    setSelectingAll(true);
    try {
      const ids = await fetchAllFilteredLeadIds({
        clientId: clientId !== "all" ? clientId : undefined,
        batchId: batchId !== "all" ? batchId : undefined,
        search: search || undefined,
        filters: filters.length > 0 ? filters : undefined,
      });
      setSelectedIds(new Set(ids));
      toast.success(`Selected ${ids.length.toLocaleString()} leads`);
    } catch (err) {
      toast.error(
        `Failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setSelectingAll(false);
    }
  }

  const selectedArr = useMemo(() => Array.from(selectedIds), [selectedIds]);

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-sm text-muted-foreground">
            {totalCount.toLocaleString()} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LeadExport
            clientId={clientId}
            batchId={batchId}
            search={search}
            filters={filters}
            sortColumn={sortColumn}
            sortDir={sortDir}
          />
        </div>
      </div>

      {/* Filters */}
      <LeadFilters
        clients={clients}
        clientId={clientId}
        onClientChange={handleClientChange}
        search={search}
        onSearchChange={handleSearchChange}
        filters={filters}
        onFiltersChange={handleFiltersChange}
        customFieldKeys={customFieldKeys}
        batches={batches}
        batchId={batchId}
        onBatchChange={handleBatchChange}
      />

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-muted-foreground">
            {selectedIds.size.toLocaleString()} selected
          </span>
          {selectedIds.size < totalCount && (
            <button
              className="text-sm text-primary hover:underline"
              onClick={selectAllFiltered}
              disabled={selectingAll}
            >
              {selectingAll
                ? "Selecting..."
                : `Select all ${totalCount.toLocaleString()} filtered`}
            </button>
          )}
          <LeadBulkFill
            selectedCount={selectedIds.size}
            selectedIds={selectedArr}
            customFieldKeys={customFieldKeys}
            onDone={refetch}
          />
          <LeadDelete
            selectedCount={selectedIds.size}
            selectedIds={selectedArr}
            onDone={refetch}
          />
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          Loading...
        </div>
      ) : (
        <LeadTable
          leads={leads}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          sortColumn={sortColumn}
          sortDir={sortDir}
          onSort={handleSort}
          onLeadUpdated={refetch}
          extraColumns={extraColumns}
          allCustomKeys={customFieldKeys}
          onAddColumn={(name) => setExtraColumns((prev) => [...prev, name])}
          batches={batches}
        />
      )}

      {/* Pagination */}
      <LeadPagination
        page={page}
        pageSize={PAGE_SIZE}
        totalCount={totalCount}
        onPageChange={setPage}
      />
    </div>
  );
}
