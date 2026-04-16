"use client";

import { useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import { supabase } from "@/lib/supabase";
import { registerCustomFieldOrder } from "@/lib/lead-queries";
import { CUSTOM_FIELD_PREFIX } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import type { UploadState } from "@/app/page";

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
  const [stats, setStats] = useState({ imported: 0, skippedNoContact: 0, skippedDuplicate: 0, errors: 0 });
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
    const { mapping, clientId, file } = state;

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
          customFieldNames.push(target.slice(CUSTOM_FIELD_PREFIX.length));
        }
      }
      if (customFieldNames.length > 0) {
        await registerCustomFieldOrder(customFieldNames);
      }

      let imported = 0;
      let skippedNoContact = 0;
      let skippedDuplicate = 0;
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
            const fieldName = targetField.slice(CUSTOM_FIELD_PREFIX.length);
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

      setStatus(`${validRows.length.toLocaleString()} valid rows. Inserting...`);
      setStats({ imported: 0, skippedNoContact, skippedDuplicate: 0, errors: 0 });

      // Insert in batches
      for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
        const chunk = validRows.slice(i, i + BATCH_SIZE);

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

        const processed = Math.min(i + BATCH_SIZE, validRows.length);
        setProgress(Math.round((processed / validRows.length) * 100));
        setStatus(
          `Inserting ${processed.toLocaleString()} / ${validRows.length.toLocaleString()}...`
        );
        setStats({ imported, skippedNoContact, skippedDuplicate, errors });
      }

      // Update batch stats
      await supabase
        .from("upload_batches")
        .update({
          imported_rows: imported,
          skipped_no_contact: skippedNoContact,
          skipped_duplicate: skippedDuplicate,
        })
        .eq("id", batch.id);

      // Save results
      onUpdate({
        results: {
          total,
          imported,
          skippedNoContact,
          skippedDuplicate,
          newLeads,
          batchId: batch.id,
          uploadNumber: (batch as { upload_number?: number }).upload_number ?? null,
        },
      });

      setStatus("Import complete!");
      setProgress(100);

      // Auto-advance only if something was imported
      if (imported > 0 || skippedDuplicate > 0 || skippedNoContact > 0) {
        setTimeout(() => onNext(), 1500);
      } else {
        setFailed(true);
      }
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : "Unexpected error during import"}`);
      setFailed(true);
    }
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
        <div className="p-3 rounded-lg bg-card border">
          <p className="text-2xl font-bold text-red-600">{stats.skippedDuplicate.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Duplicates</p>
        </div>
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
