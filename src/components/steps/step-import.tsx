"use client";

import { useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import { supabase } from "@/lib/supabase";
import { registerCustomFieldOrder } from "@/lib/lead-queries";
import { CUSTOM_FIELD_PREFIX } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import type { UploadState } from "@/app/page";

/** Convert "job title (2)" → "job title - 2" for Clay compatibility */
function normalizeFieldName(name: string): string {
  return name.replace(/\s*\((\d+)\)$/, " - $1");
}

type Props = {
  state: UploadState;
  onUpdate: (partial: Partial<UploadState>) => void;
  onNext: () => void;
  onBack?: () => void;
};

function parseFile(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const rows: Record<string, string>[] = [];
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      step: (result) => {
        if (result.errors.length === 0) {
          rows.push(result.data);
        }
      },
      complete: () => resolve(rows),
      error: (err) => reject(err),
    });
  });
}

export function StepImport({ state, onUpdate, onNext, onBack }: Props) {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Starting import...");
  const [stats, setStats] = useState({ imported: 0, skippedNoContact: 0, skippedDuplicate: 0, replaced: 0, errors: 0 });
  const [failed, setFailed] = useState(false);
  const [needsReupload, setNeedsReupload] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    runImport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runImport() {
    const { mapping, clientId, file, dedupeMode } = state;

    if (!file) {
      setStatus(
        "The CSV file is no longer in memory (likely due to a page reload). Please go back to Step 2 and re-upload the same file — your column mapping will be preserved."
      );
      setNeedsReupload(true);
      setFailed(true);
      return;
    }

    if (!clientId || !mapping || Object.keys(mapping).length === 0) {
      setStatus("Error: Missing data. Please go back and re-upload.");
      setFailed(true);
      return;
    }

    setStatus("Reading CSV file...");

    let allRows: Record<string, string>[];
    try {
      allRows = await parseFile(file);
    } catch (err) {
      setStatus(`Error parsing CSV: ${err instanceof Error ? err.message : String(err)}`);
      setFailed(true);
      return;
    }

    if (allRows.length === 0) {
      setStatus("Error: CSV appears empty after parsing.");
      setFailed(true);
      return;
    }

    const total = allRows.length;

    try {
      // Create upload batch
      setStatus("Creating upload batch...");
      const { data: batch, error: batchErr } = await supabase
        .from("upload_batches")
        .insert({
          client_id: clientId,
          filename: file?.name || "unknown.csv",
          total_rows: total,
        })
        .select()
        .single();

      if (batchErr || !batch) {
        setStatus(`Error: ${batchErr?.message || "Failed to create batch"}`);
        setFailed(true);
        return;
      }

      // Build reverse mapping: targetField → csvColumn
      const reverseMap: Record<string, string> = {};
      for (const [csvCol, target] of Object.entries(mapping)) {
        if (target !== "skip") {
          reverseMap[target] = csvCol;
        }
      }

      // Register custom field order (CSV column order, appends new ones)
      const customFieldNames: string[] = [];
      for (const csvCol of state.headers) {
        const target = mapping[csvCol];
        if (target && target.startsWith(CUSTOM_FIELD_PREFIX)) {
          customFieldNames.push(normalizeFieldName(target.slice(CUSTOM_FIELD_PREFIX.length)));
        }
      }
      if (customFieldNames.length > 0) {
        await registerCustomFieldOrder(customFieldNames);
      }

      let imported = 0;
      let skippedNoContact = 0;
      let skippedDuplicate = 0;
      let replaced = 0;
      let errors = 0;
      const newLeads: Record<string, unknown>[] = [];
      const BATCH_SIZE = 500;

      // Process rows — validate and build lead objects
      const validRows: Record<string, unknown>[] = [];

      for (let i = 0; i < allRows.length; i++) {
        const row = allRows[i];
        const lead: Record<string, unknown> = {
          client_id: clientId,
          upload_batch_id: batch.id,
        };

        // Map columns
        const customData: Record<string, string> = {};

        for (const [targetField, csvCol] of Object.entries(reverseMap)) {
          const val = String(row[csvCol] ?? "").trim();
          if (!val) continue;

          if (targetField.startsWith(CUSTOM_FIELD_PREFIX)) {
            const fieldName = normalizeFieldName(targetField.slice(CUSTOM_FIELD_PREFIX.length));
            customData[fieldName] = val;
          } else if (targetField === "email") {
            lead[targetField] = val.toLowerCase();
          } else if (targetField === "linkedin_url") {
            lead[targetField] = val.toLowerCase();
          } else {
            lead[targetField] = val;
          }
        }

        if (Object.keys(customData).length > 0) {
          lead.custom_fields = customData;
        }

        // Check: must have email or LinkedIn
        if (!lead.email && !lead.linkedin_url) {
          skippedNoContact++;
          continue;
        }

        validRows.push(lead);
      }

      // In REPLACE mode, dedupe within the CSV itself (last occurrence wins) so the
      // same "replace" semantics apply to within-file duplicates as to DB duplicates.
      // In SKIP mode, leave the rows alone — the unique-constraint fallback handles it.
      let rowsToInsert = validRows;
      if (dedupeMode === "replace") {
        rowsToInsert = dedupeWithinCsv(validRows);
      }

      setStatus(`${rowsToInsert.length.toLocaleString()} valid rows. Inserting...`);
      setStats({ imported: 0, skippedNoContact, skippedDuplicate: 0, replaced: 0, errors: 0 });

      // Insert in batches
      for (let i = 0; i < rowsToInsert.length; i += BATCH_SIZE) {
        const chunk = rowsToInsert.slice(i, i + BATCH_SIZE);

        // REPLACE mode: pre-delete every existing lead for this client whose email or
        // LinkedIn URL matches anything in the chunk. After the delete the insert is
        // guaranteed to be conflict-free (against the DB; within-chunk dups already
        // removed above). The delete wipes ALL columns of the old row, so the new row
        // wins completely — including a new upload_batch_id.
        if (dedupeMode === "replace") {
          const emails = Array.from(
            new Set(chunk.map((r) => r.email).filter((v): v is string => typeof v === "string" && v.length > 0))
          );
          const linkedins = Array.from(
            new Set(
              chunk
                .map((r) => r.linkedin_url)
                .filter((v): v is string => typeof v === "string" && v.length > 0)
            )
          );

          const idsToDelete = new Set<string>();
          // Chunk the IN() lookups to keep query strings within PostgREST limits.
          const LOOKUP_CHUNK = 200;

          for (let j = 0; j < emails.length; j += LOOKUP_CHUNK) {
            const slice = emails.slice(j, j + LOOKUP_CHUNK);
            const { data, error: lookupErr } = await supabase
              .from("leads")
              .select("id")
              .eq("client_id", clientId)
              .in("email", slice);
            if (lookupErr) throw new Error(`Lookup failed: ${lookupErr.message}`);
            for (const r of data || []) idsToDelete.add((r as { id: string }).id);
          }

          for (let j = 0; j < linkedins.length; j += LOOKUP_CHUNK) {
            const slice = linkedins.slice(j, j + LOOKUP_CHUNK);
            const { data, error: lookupErr } = await supabase
              .from("leads")
              .select("id")
              .eq("client_id", clientId)
              .in("linkedin_url", slice);
            if (lookupErr) throw new Error(`Lookup failed: ${lookupErr.message}`);
            for (const r of data || []) idsToDelete.add((r as { id: string }).id);
          }

          if (idsToDelete.size > 0) {
            const ids = Array.from(idsToDelete);
            const DELETE_CHUNK = 100;
            for (let j = 0; j < ids.length; j += DELETE_CHUNK) {
              const slice = ids.slice(j, j + DELETE_CHUNK);
              const { error: delErr } = await supabase
                .from("leads")
                .delete()
                .in("id", slice);
              if (delErr) throw new Error(`Delete failed: ${delErr.message}`);
            }
            replaced += idsToDelete.size;
          }
        }

        const { data: inserted, error } = await supabase
          .from("leads")
          .insert(chunk)
          .select();

        if (error) {
          // Unique constraint violation or any other error — fall back to one-by-one
          for (const lead of chunk) {
            const { data: single, error: singleErr } = await supabase
              .from("leads")
              .insert(lead)
              .select();

            if (singleErr) {
              if (singleErr.code === "23505") {
                // In skip mode this is a DB dup we wanted to skip.
                // In replace mode the pre-delete should have prevented this; treat as
                // an unexpected dup and skip to keep the import moving.
                skippedDuplicate++;
              } else {
                errors++;
              }
            } else if (single && single.length > 0) {
              imported++;
              newLeads.push(single[0]);
            }
          }
        } else if (inserted) {
          imported += inserted.length;
          newLeads.push(...inserted);
        }

        const processed = Math.min(i + BATCH_SIZE, rowsToInsert.length);
        setProgress(Math.round((processed / rowsToInsert.length) * 100));
        setStatus(
          `Inserting ${processed.toLocaleString()} / ${rowsToInsert.length.toLocaleString()}...`
        );
        setStats({ imported, skippedNoContact, skippedDuplicate, replaced, errors });
      }

      // Update batch stats. replaced_rows requires migration 002; if the column is
      // missing, retry without it so the import doesn't appear failed.
      const baseStats = {
        imported_rows: imported,
        skipped_no_contact: skippedNoContact,
        skipped_duplicate: skippedDuplicate,
      };
      const { error: statsErr } = await supabase
        .from("upload_batches")
        .update({ ...baseStats, replaced_rows: replaced })
        .eq("id", batch.id);

      if (statsErr && /replaced_rows/i.test(statsErr.message)) {
        await supabase.from("upload_batches").update(baseStats).eq("id", batch.id);
      }

      // Save results
      onUpdate({
        results: {
          total,
          imported,
          skippedNoContact,
          skippedDuplicate,
          replaced,
          dedupeMode,
          newLeads,
          batchId: batch.id,
          uploadNumber: (batch as { upload_number?: number }).upload_number ?? null,
        },
      });

      setStatus("Import complete!");
      setProgress(100);

      // Auto-advance only if something happened
      if (imported > 0 || skippedDuplicate > 0 || skippedNoContact > 0 || replaced > 0) {
        setTimeout(() => onNext(), 1500);
      } else {
        setFailed(true);
      }
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : "Unexpected error during import"}`);
      setFailed(true);
    }
  }

  // Keep only the last occurrence of each email and LinkedIn URL within the CSV.
  // A row is dropped if any of its keys (email/linkedin) appears later in the file —
  // matching "last write wins" replace semantics.
  function dedupeWithinCsv(
    rows: Record<string, unknown>[]
  ): Record<string, unknown>[] {
    const lastIndex = new Map<string, number>();
    rows.forEach((row, i) => {
      const email = row.email as string | undefined;
      const li = row.linkedin_url as string | undefined;
      if (email) lastIndex.set(`e:${email}`, i);
      if (li) lastIndex.set(`l:${li}`, i);
    });
    return rows.filter((row, i) => {
      const email = row.email as string | undefined;
      const li = row.linkedin_url as string | undefined;
      if (email && lastIndex.get(`e:${email}`) !== i) return false;
      if (li && lastIndex.get(`l:${li}`) !== i) return false;
      return true;
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Step 4: Importing...</h2>
        <p className="text-sm text-muted-foreground">{status}</p>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-muted rounded-full h-4 overflow-hidden">
        <div
          className="bg-primary h-full rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-sm text-center text-muted-foreground">{progress}%</p>

      {/* Live stats */}
      <div className="grid grid-cols-2 gap-4 text-center sm:grid-cols-4">
        <div className="p-3 rounded-lg bg-card border">
          <p className="text-2xl font-bold text-green-600">{stats.imported.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Imported</p>
        </div>
        <div className="p-3 rounded-lg bg-card border">
          <p className="text-2xl font-bold text-yellow-600">{stats.skippedNoContact.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">No Contact</p>
        </div>
        {state.dedupeMode === "replace" ? (
          <div className="p-3 rounded-lg bg-card border">
            <p className="text-2xl font-bold text-blue-500">{stats.replaced.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Replaced</p>
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-card border">
            <p className="text-2xl font-bold text-red-600">{stats.skippedDuplicate.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Duplicates</p>
          </div>
        )}
        {stats.errors > 0 && (
          <div className="p-3 rounded-lg bg-card border">
            <p className="text-2xl font-bold text-red-600">{stats.errors.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Errors</p>
          </div>
        )}
      </div>

      {failed && (
        <div className="flex gap-2">
          {needsReupload && onBack ? (
            <Button variant="outline" onClick={onBack}>
              Back to Step 2
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => {
                started.current = false;
                setFailed(false);
                setNeedsReupload(false);
                runImport();
              }}
            >
              Retry Import
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
