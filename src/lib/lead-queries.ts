import { supabase } from "@/lib/supabase";
import { TARGET_FIELDS } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Lead = {
  id: string;
  client_id: string;
  upload_batch_id: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  email: string | null;
  linkedin_url: string | null;
  phone: string | null;
  company_name: string | null;
  company_website: string | null;
  company_linkedin: string | null;
  company_facebook: string | null;
  raw_company_address: string | null;
  custom_fields: Record<string, string> | null;
  created_at: string;
  updated_at: string;
};

export type Client = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
};

export type ColumnFilter = {
  id: string;
  column: string; // regular column name or "cf:fieldName" for custom fields
  value: string;
};

export type FetchLeadsParams = {
  clientId?: string;
  search?: string;
  filters?: ColumnFilter[];
  sortColumn?: string;
  sortDir?: "asc" | "desc";
  page: number;
  pageSize: number;
};

// Fixed columns that global search applies to
const SEARCHABLE_COLUMNS = [
  "first_name",
  "last_name",
  "email",
  "company_name",
  "linkedin_url",
  "job_title",
  "full_name",
];

// All regular lead columns (for auto-hide + display)
export const LEAD_COLUMNS = TARGET_FIELDS.map((f) => ({
  key: f.value,
  label: f.label,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters<T extends { eq: any; or: any; ilike: any; filter: any }>(
  query: T,
  params: Pick<FetchLeadsParams, "clientId" | "search" | "filters">
): T {
  let q = query;

  if (params.clientId) {
    q = q.eq("client_id", params.clientId);
  }

  if (params.search) {
    // Escape LIKE wildcards in search term
    const escaped = params.search.replace(/[%_\\]/g, "\\$&");
    const term = `%${escaped}%`;
    const orClauses = SEARCHABLE_COLUMNS.map((c) => `${c}.ilike.${term}`).join(
      ","
    );
    q = q.or(orClauses);
  }

  if (params.filters?.length) {
    for (const f of params.filters) {
      // Escape LIKE wildcards in filter value
      const escapedVal = f.value.replace(/[%_\\]/g, "\\$&");

      if (f.column.startsWith("cf:")) {
        // Custom field filter — query JSONB
        // Sanitize key: only allow alphanumeric, spaces, hyphens, underscores
        const key = f.column.slice(3).replace(/[^a-zA-Z0-9 _-]/g, "");
        q = q.filter(
          `custom_fields->>${key}`,
          "ilike",
          `%${escapedVal}%`
        );
      } else {
        q = q.ilike(f.column, `%${escapedVal}%`);
      }
    }
  }

  return q;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Fetch one page of leads with total count */
export async function fetchLeads(params: FetchLeadsParams) {
  const from = params.page * params.pageSize;
  const to = from + params.pageSize - 1;

  let query = supabase
    .from("leads")
    .select("*", { count: "exact" });

  query = applyFilters(query, params);

  const sortCol = params.sortColumn || "created_at";
  const ascending = params.sortDir === "asc";
  query = query.order(sortCol, { ascending });
  query = query.range(from, to);

  const { data, count, error } = await query;

  if (error) throw new Error(error.message);

  return {
    data: (data || []) as Lead[],
    count: count || 0,
  };
}

/** Fetch ALL lead IDs matching filters (for "select all filtered") */
export async function fetchAllFilteredLeadIds(
  params: Pick<FetchLeadsParams, "clientId" | "search" | "filters">
): Promise<string[]> {
  const ids: string[] = [];
  const batchSize = 1000;
  let offset = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let query = supabase.from("leads").select("id");
    query = applyFilters(query, params);
    query = query.range(offset, offset + batchSize - 1);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    ids.push(...data.map((d: { id: string }) => d.id));
    if (data.length < batchSize) break;
    offset += batchSize;
  }

  return ids;
}

/** Fetch ALL leads matching filters (for CSV export) */
export async function fetchAllFilteredLeads(
  params: Pick<FetchLeadsParams, "clientId" | "search" | "filters" | "sortColumn" | "sortDir">
): Promise<Lead[]> {
  const leads: Lead[] = [];
  const batchSize = 1000;
  let offset = 0;

  const sortCol = params.sortColumn || "created_at";
  const ascending = params.sortDir === "asc";

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let query = supabase.from("leads").select("*");
    query = applyFilters(query, params);
    query = query.order(sortCol, { ascending });
    query = query.range(offset, offset + batchSize - 1);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    leads.push(...(data as Lead[]));
    if (data.length < batchSize) break;
    offset += batchSize;
  }

  return leads;
}

/** Fetch all distinct custom field keys from the database */
export async function fetchCustomFieldKeys(): Promise<string[]> {
  const { data, error } = await supabase.rpc("get_custom_field_keys");

  if (error) {
    // RPC not available — fall back to scanning current leads
    if (error.code === "42883" || error.message.includes("does not exist")) {
      return [];
    }
    throw new Error(error.message);
  }

  return (data || []).map((row: { key: string }) => row.key);
}

/** Fetch all clients */
export async function fetchClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []) as Client[];
}

/** Delete leads by IDs */
export async function deleteLeads(ids: string[]): Promise<void> {
  // Supabase .in() has a limit, batch in groups of 100
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { error } = await supabase.from("leads").delete().in("id", chunk);
    if (error) throw new Error(error.message);
  }
}

/** Bulk update a regular column for selected leads */
export async function bulkUpdateField(
  ids: string[],
  column: string,
  value: string
): Promise<void> {
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { error } = await supabase
      .from("leads")
      .update({ [column]: value })
      .in("id", chunk);
    if (error) throw new Error(error.message);
  }
}

/** Bulk update a custom field for selected leads (merges into JSONB without overwriting other keys) */
export async function bulkUpdateCustomField(
  ids: string[],
  fieldName: string,
  value: string
): Promise<void> {
  // Use RPC for efficient bulk JSONB merge (single UPDATE per batch)
  // Falls back to one-by-one if RPC not available
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);

    const { error: rpcErr } = await supabase.rpc("bulk_merge_custom_field", {
      lead_ids: chunk,
      field_name: fieldName,
      field_value: value,
    });

    if (rpcErr) {
      // RPC not available — fall back to fetch + merge
      if (rpcErr.code === "42883" || rpcErr.message.includes("does not exist")) {
        await bulkUpdateCustomFieldFallback(chunk, fieldName, value);
      } else {
        throw new Error(rpcErr.message);
      }
    }
  }
}

async function bulkUpdateCustomFieldFallback(
  ids: string[],
  fieldName: string,
  value: string
): Promise<void> {
  const { data: leads, error: fetchErr } = await supabase
    .from("leads")
    .select("id, custom_fields")
    .in("id", ids);

  if (fetchErr) throw new Error(fetchErr.message);
  if (!leads) return;

  for (const lead of leads) {
    const existing = (lead.custom_fields || {}) as Record<string, string>;
    const merged = { ...existing, [fieldName]: value };
    const { error } = await supabase
      .from("leads")
      .update({ custom_fields: merged })
      .eq("id", lead.id);
    if (error) throw new Error(error.message);
  }
}
