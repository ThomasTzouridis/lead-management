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

export type UploadBatch = {
  id: string;
  client_id: string;
  filename: string;
  upload_number: number;
  total_rows: number;
  imported_rows: number;
  skipped_no_contact: number;
  skipped_duplicate: number;
  replaced_rows?: number;
  created_at: string;
};

export type BatchFilter = {
  mode: "include" | "exclude";
  ids: string[];
};

export type ListFilter = {
  values: string[];
};

// The custom_fields JSONB key that the "List" column and filter operate on.
export const LIST_FIELD_KEY = "List";

export type FetchLeadsParams = {
  clientId?: string;
  batchId?: string;
  batchFilter?: BatchFilter;
  listFilter?: ListFilter;
  search?: string;
  filters?: ColumnFilter[];
  customFieldKeys?: string[];
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
// Custom field order registry — stored as a special mapping_templates row
// ---------------------------------------------------------------------------

const FIELD_ORDER_REGISTRY = "__field_order__";

/** Fetch the ordered list of custom field names from the registry */
async function fetchCustomFieldOrder(): Promise<string[]> {
  const { data, error } = await supabase
    .from("mapping_templates")
    .select("headers")
    .eq("name", FIELD_ORDER_REGISTRY)
    .single();

  if (error || !data) return [];
  return data.headers || [];
}

/** Register custom field names in order (appends new ones, preserves existing order) */
export async function registerCustomFieldOrder(newFields: string[]): Promise<void> {
  if (newFields.length === 0) return;

  const current = await fetchCustomFieldOrder();
  const existing = new Set(current);
  const toAdd = newFields.filter((f) => !existing.has(f));

  if (toAdd.length === 0) return;

  const updated = [...current, ...toAdd];

  await supabase
    .from("mapping_templates")
    .upsert(
      {
        name: FIELD_ORDER_REGISTRY,
        headers: updated,
        mapping: {},
        custom_fields: [],
      },
      { onConflict: "name" }
    );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters<T extends { eq: any; or: any; ilike: any; filter: any; in: any; not: any }>(
  query: T,
  params: Pick<FetchLeadsParams, "clientId" | "batchId" | "batchFilter" | "listFilter" | "search" | "filters" | "customFieldKeys">
): T {
  let q = query;

  if (params.clientId) {
    q = q.eq("client_id", params.clientId);
  }

  if (params.batchFilter && params.batchFilter.ids.length > 0) {
    if (params.batchFilter.mode === "include") {
      q = q.in("upload_batch_id", params.batchFilter.ids);
    } else {
      q = q.not("upload_batch_id", "in", `(${params.batchFilter.ids.join(",")})`);
    }
  } else if (params.batchId) {
    q = q.eq("upload_batch_id", params.batchId);
  }

  if (params.listFilter && params.listFilter.values.length > 0) {
    q = q.in(`custom_fields->>${LIST_FIELD_KEY}` as never, params.listFilter.values);
  }

  if (params.search) {
    // Escape LIKE wildcards in search term
    const escaped = params.search.replace(/[%_\\]/g, "\\$&");
    // Wrap the value in double quotes so spaces, commas, dots, parens in the
    // term don't break PostgREST's or=(...) filter grammar.
    const term = `"%${escaped.replace(/"/g, '\\"')}%"`;
    // Drop custom-field keys with chars that break PostgREST's filter parser
    // (e.g. `title+company` — `+` URL-decodes to a space and corrupts the
    // column reference). Keep to alphanumeric + underscore.
    const safeCustomKeys = (params.customFieldKeys || []).filter((k) =>
      /^[a-zA-Z0-9_]+$/.test(k)
    );
    // Search fixed columns + each custom field key individually
    const orClauses = [
      ...SEARCHABLE_COLUMNS.map((c) => `${c}.ilike.${term}`),
      ...safeCustomKeys.map((k) => `custom_fields->>${k}.ilike.${term}`),
    ].join(",");
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
        q = q.ilike(`custom_fields->>${key}` as never, `%${escapedVal}%`);
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
  params: Pick<FetchLeadsParams, "clientId" | "batchId" | "batchFilter" | "listFilter" | "search" | "filters" | "customFieldKeys">
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
  params: Pick<FetchLeadsParams, "clientId" | "batchId" | "batchFilter" | "listFilter" | "search" | "filters" | "customFieldKeys" | "sortColumn" | "sortDir">
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

/** Fetch all distinct custom field keys from the database, ordered by the registry */
export async function fetchCustomFieldKeys(): Promise<string[]> {
  // Fetch registry order and all DB keys in parallel
  const [order, dbKeys] = await Promise.all([
    fetchCustomFieldOrder(),
    fetchDbCustomFieldKeys(),
  ]);

  // Only include keys that actually exist in the database
  const liveKeys = new Set(dbKeys);

  // Start with registry-ordered keys that still have data
  const result: string[] = [];
  for (const key of order) {
    if (liveKeys.has(key)) {
      result.push(key);
      liveKeys.delete(key);
    }
  }
  // Append any DB keys not in the registry
  for (const key of liveKeys) {
    result.push(key);
  }

  return result;
}

/** Raw DB query for all distinct custom field keys (unordered) */
async function fetchDbCustomFieldKeys(): Promise<string[]> {
  const { data, error } = await supabase.rpc("get_custom_field_keys");

  if (error) {
    if (error.code === "42883" || error.message.includes("does not exist")) {
      return [];
    }
    throw new Error(error.message);
  }

  return (data || []).map((row: { key: string }) => row.key);
}

/** Rename a custom field key across all leads that have it */
export async function renameCustomField(
  oldKey: string,
  newKey: string
): Promise<number> {
  if (!oldKey || !newKey || oldKey === newKey) return 0;

  const { data, error } = await supabase
    .from("leads")
    .select("id, custom_fields")
    .not("custom_fields", "is", null);

  if (error) throw new Error(error.message);

  const affected = (data || []).filter(
    (l) => l.custom_fields && oldKey in (l.custom_fields as Record<string, unknown>)
  );

  for (let i = 0; i < affected.length; i += 50) {
    const chunk = affected.slice(i, i + 50);
    await Promise.all(
      chunk.map((lead) => {
        const cf = { ...(lead.custom_fields as Record<string, string>) };
        cf[newKey] = cf[oldKey];
        delete cf[oldKey];
        return supabase
          .from("leads")
          .update({ custom_fields: cf })
          .eq("id", lead.id);
      })
    );
  }

  // Also rename in the field order registry
  const order = await fetchCustomFieldOrder();
  const idx = order.indexOf(oldKey);
  if (idx !== -1) {
    order[idx] = newKey;
    await supabase
      .from("mapping_templates")
      .upsert(
        {
          name: FIELD_ORDER_REGISTRY,
          headers: order,
          mapping: {},
          custom_fields: [],
        },
        { onConflict: "name" }
      );
  }

  return affected.length;
}

/** Fetch upload batches (optionally filtered by client), newest first */
export async function fetchUploadBatches(
  clientId?: string
): Promise<UploadBatch[]> {
  let q = supabase
    .from("upload_batches")
    .select("*")
    .order("upload_number", { ascending: false });
  if (clientId) q = q.eq("client_id", clientId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []) as UploadBatch[];
}

/**
 * Fetch distinct values of the "List" custom field (optionally scoped to a client).
 * Uses the get_custom_field_values RPC (migration 003). Falls back to scanning
 * leads in pages if the RPC is missing — safe but slower on large tables.
 */
export async function fetchListValues(clientId?: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("get_custom_field_values", {
    field_name: LIST_FIELD_KEY,
    p_client_id: clientId ?? null,
  });

  // Fall back whenever the RPC is unavailable — covers the "migration 003
  // hasn't been run yet" path. PostgREST reports this as PGRST202
  // ("Could not find the function ... in the schema cache") and Postgres
  // itself reports undefined_function as 42883.
  if (error) {
    return fetchListValuesFallback(clientId);
  }

  return (data || [])
    .map((r: { value: string | null }) => r.value)
    .filter((v: string | null): v is string => !!v);
}

async function fetchListValuesFallback(clientId?: string): Promise<string[]> {
  const values = new Set<string>();
  const batchSize = 1000;
  let offset = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = supabase.from("leads").select("custom_fields");
    if (clientId) q = q.eq("client_id", clientId);
    q = q.range(offset, offset + batchSize - 1);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    for (const row of data) {
      const cf = row.custom_fields as Record<string, string> | null;
      const v = cf?.[LIST_FIELD_KEY];
      if (v) values.add(v);
    }
    if (data.length < batchSize) break;
    offset += batchSize;
  }

  return Array.from(values).sort();
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

  // Clean up registry: remove keys that no longer exist in any lead
  await cleanupOrphanedFieldKeys();
}

/** Remove custom field keys from the registry that no longer exist in any lead */
async function cleanupOrphanedFieldKeys(): Promise<void> {
  const [registryOrder, dbKeys] = await Promise.all([
    fetchCustomFieldOrder(),
    fetchDbCustomFieldKeys(),
  ]);

  if (registryOrder.length === 0) return;

  const liveKeys = new Set(dbKeys);
  const cleaned = registryOrder.filter((k) => liveKeys.has(k));

  if (cleaned.length === registryOrder.length) return; // nothing to clean

  await supabase
    .from("mapping_templates")
    .upsert(
      {
        name: FIELD_ORDER_REGISTRY,
        headers: cleaned,
        mapping: {},
        custom_fields: [],
      },
      { onConflict: "name" }
    );
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

// ---------------------------------------------------------------------------
// Mapping templates — reusable column mappings across similar CSV formats
// ---------------------------------------------------------------------------

export type MappingTemplate = {
  id: string;
  name: string;
  headers: string[];
  mapping: Record<string, string>;
  custom_fields: { value: string; label: string }[];
  created_at: string;
  updated_at: string;
};

/** Fetch all mapping templates, ordered by name (excludes internal registry) */
export async function fetchMappingTemplates(): Promise<MappingTemplate[]> {
  const { data, error } = await supabase
    .from("mapping_templates")
    .select("*")
    .neq("name", FIELD_ORDER_REGISTRY)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as MappingTemplate[];
}

/** Upsert a mapping template by name (overwrites if name exists) */
export async function saveMappingTemplate(
  name: string,
  headers: string[],
  mapping: Record<string, string>,
  customFields: { value: string; label: string }[]
): Promise<MappingTemplate> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Template name cannot be empty");

  const payload = {
    name: trimmed,
    headers: [...headers].sort(),
    mapping,
    custom_fields: customFields,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("mapping_templates")
    .upsert(payload, { onConflict: "name" })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as MappingTemplate;
}

/** Delete a mapping template by id */
export async function deleteMappingTemplate(id: string): Promise<void> {
  const { error } = await supabase.from("mapping_templates").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Classify templates against a CSV's headers.
 * - "exact" = template headers match current headers (set equality)
 * - "partial" = 70%+ overlap (ranked by overlap count)
 */
export function classifyTemplateMatches(
  templates: MappingTemplate[],
  csvHeaders: string[]
): {
  exact: MappingTemplate[];
  partial: Array<{ template: MappingTemplate; overlap: number; total: number }>;
} {
  const currentSet = new Set(csvHeaders);
  const sortedKey = JSON.stringify([...csvHeaders].sort());

  const exact: MappingTemplate[] = [];
  const partial: Array<{ template: MappingTemplate; overlap: number; total: number }> = [];

  for (const t of templates) {
    const tKey = JSON.stringify([...t.headers].sort());
    if (tKey === sortedKey) {
      exact.push(t);
      continue;
    }
    const overlap = t.headers.filter((h) => currentSet.has(h)).length;
    const total = Math.max(t.headers.length, csvHeaders.length);
    if (total > 0 && overlap / total >= 0.7) {
      partial.push({ template: t, overlap, total });
    }
  }
  partial.sort((a, b) => b.overlap - a.overlap);
  return { exact, partial };
}

/**
 * Safely apply a template to the current CSV:
 * - Only maps csvCols that actually exist in currentHeaders (defensive)
 * - Merges template custom_fields into existing by `value` (no duplicates, no clobber)
 */
export function applyMappingTemplate(
  template: MappingTemplate,
  currentHeaders: string[],
  existingCustomFields: { value: string; label: string }[]
): {
  mapping: Record<string, string>;
  customFields: { value: string; label: string }[];
} {
  const headerSet = new Set(currentHeaders);
  const mapping: Record<string, string> = {};
  for (const [csvCol, target] of Object.entries(template.mapping)) {
    if (headerSet.has(csvCol)) mapping[csvCol] = target;
  }

  const byValue = new Map(existingCustomFields.map((f) => [f.value, f]));
  for (const f of template.custom_fields) {
    if (!byValue.has(f.value)) byValue.set(f.value, f);
  }

  return { mapping, customFields: Array.from(byValue.values()) };
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
