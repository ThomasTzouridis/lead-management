"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TARGET_FIELDS, CUSTOM_FIELD_PREFIX } from "@/lib/constants";
import { toast } from "sonner";
import type { UploadState } from "@/app/page";

type Props = {
  state: UploadState;
  onUpdate: (partial: Partial<UploadState>) => void;
  onNext: () => void;
  onBack: () => void;
};

export function StepMapping({ state, onUpdate, onNext, onBack }: Props) {
  const mapping = state.mapping;
  const customFields = state.customFields;
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const [newFieldName, setNewFieldName] = useState("");
  const [manualReview, setManualReview] = useState<Set<string>>(new Set());

  function toggleReview(csvCol: string) {
    setManualReview((prev) => {
      const next = new Set(prev);
      if (next.has(csvCol)) next.delete(csvCol);
      else next.add(csvCol);
      return next;
    });
  }

  // Which target fields are already used
  const usedTargets = useMemo(
    () => new Set(Object.values(mapping).filter((v) => v !== "skip")),
    [mapping]
  );

  function setMapping(csvCol: string, target: string) {
    if (target === "__create_custom__") {
      setCreatingFor(csvCol);
      setNewFieldName("");
      return;
    }

    const next = { ...mapping };
    if (target === "skip") {
      delete next[csvCol];
    } else {
      next[csvCol] = target;
    }
    onUpdate({ mapping: next });
  }

  function confirmCustomField() {
    const name = newFieldName.trim();
    if (!name) {
      toast.error("Field name cannot be empty");
      return;
    }

    const value = CUSTOM_FIELD_PREFIX + name;

    // Check if this custom field already exists
    const exists = customFields.some((f) => f.value === value);
    if (!exists) {
      onUpdate({ customFields: [...customFields, { value, label: name }] });
    }

    // Set the mapping
    if (creatingFor) {
      const next = { ...mapping };
      next[creatingFor] = value;
      onUpdate({ mapping: next, customFields: exists ? customFields : [...customFields, { value, label: name }] });
    }

    setCreatingFor(null);
    setNewFieldName("");
  }

  function cancelCustomField() {
    setCreatingFor(null);
    setNewFieldName("");
  }

  function handleNext() {
    const hasEmail = Object.values(mapping).includes("email");
    const hasLinkedIn = Object.values(mapping).includes("linkedin_url");

    if (!hasEmail && !hasLinkedIn) {
      toast.error("You must map at least Email or LinkedIn to proceed");
      return;
    }

    onNext();
  }

  // Count how many columns are mapped
  const mappedCount = Object.keys(mapping).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Step 3: Map Columns</h2>
        <p className="text-sm text-muted-foreground">
          For each CSV column, choose which lead field it maps to.
          Unmapped columns will be dropped.
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {mappedCount} of {state.headers.length} columns mapped
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      {state.previewRows.length > 0 && (
        <div className="border rounded-lg bg-card">
          <div className="px-3 py-2 border-b text-sm font-medium">
            CSV Preview (first {state.previewRows.length} rows)
          </div>
          <div className="overflow-auto max-h-[700px]">
            <table className="text-xs w-max">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  {state.headers.map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left font-medium whitespace-nowrap border-b border-r last:border-r-0"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.previewRows.map((row, i) => (
                  <tr key={i} className="border-b last:border-b-0">
                    {state.headers.map((h) => {
                      const v = row[h];
                      const s = v == null ? "" : String(v);
                      return (
                        <td
                          key={h}
                          className="px-3 py-2 whitespace-nowrap border-r last:border-r-0 text-muted-foreground"
                          title={s}
                        >
                          {s.length > 60 ? s.slice(0, 60) + "…" : s}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="space-y-2 max-h-[700px] overflow-auto">
        {state.headers.map((csvCol) => {
          const currentTarget = mapping[csvCol] || "skip";
          const isCreating = creatingFor === csvCol;

          // Sample values for this column (first 3 non-empty)
          const samples = state.previewRows
            .map((r) => r[csvCol])
            .filter((v) => v != null && v !== "")
            .slice(0, 3)
            .map((v) => String(v).length > 40 ? String(v).slice(0, 40) + "..." : String(v));

          // Get display label for current target
          const currentLabel = currentTarget === "skip"
            ? undefined
            : currentTarget.startsWith(CUSTOM_FIELD_PREFIX)
              ? customFields.find((f) => f.value === currentTarget)?.label
              : undefined;

          const isReviewed = currentTarget !== "skip" || manualReview.has(csvCol);

          return (
            <div
              key={csvCol}
              className={`flex items-center gap-4 p-3 rounded-lg border transition-colors ${
                isReviewed
                  ? "bg-green-950/40 border-green-700/60"
                  : "bg-card"
              }`}
            >
              {/* CSV column name + sample values */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{csvCol}</p>
                {samples.length > 0 && (
                  <p className="text-xs text-muted-foreground truncate">
                    e.g. {samples.join(", ")}
                  </p>
                )}
              </div>

              {/* Arrow */}
              <span className="text-muted-foreground shrink-0">&rarr;</span>

              {/* Target field dropdown or custom field input */}
              <div className="w-[240px] shrink-0">
                {isCreating ? (
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={newFieldName}
                      onChange={(e) => setNewFieldName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") confirmCustomField();
                        if (e.key === "Escape") cancelCustomField();
                      }}
                      placeholder="Field name..."
                      autoFocus
                      className="flex-1 rounded-md border border-input bg-transparent px-2 py-1.5 text-sm"
                    />
                    <Button size="sm" onClick={confirmCustomField}>
                      OK
                    </Button>
                    <Button size="sm" variant="outline" onClick={cancelCustomField}>
                      X
                    </Button>
                  </div>
                ) : (
                  <Select
                    value={currentTarget}
                    onValueChange={(v) => v && setMapping(csvCol, v)}
                  >
                    <SelectTrigger>
                      <SelectValue>{currentLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="skip">
                        <span className="text-muted-foreground">Skip this column</span>
                      </SelectItem>
                      {TARGET_FIELDS.map((f) => (
                        <SelectItem
                          key={f.value}
                          value={f.value}
                          disabled={usedTargets.has(f.value) && currentTarget !== f.value}
                        >
                          {f.label}
                        </SelectItem>
                      ))}
                      {customFields.length > 0 && (
                        <>
                          {customFields.map((f) => (
                            <SelectItem
                              key={f.value}
                              value={f.value}
                              disabled={usedTargets.has(f.value) && currentTarget !== f.value}
                            >
                              {f.label}
                            </SelectItem>
                          ))}
                        </>
                      )}
                      <SelectItem value="__create_custom__">
                        <span className="text-primary font-medium">+ Create custom field</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Review checkbox */}
              <button
                type="button"
                onClick={() => toggleReview(csvCol)}
                aria-label="Mark as reviewed"
                className={`shrink-0 -ml-2 h-6 w-6 rounded border flex items-center justify-center transition-colors ${
                  isReviewed
                    ? "bg-green-600 border-green-500 text-white"
                    : "bg-transparent border-input hover:border-green-600"
                }`}
              >
                {isReviewed && (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            </div>
          );
        })}
      </div>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={handleNext}>
          Next: Import
        </Button>
      </div>
    </div>
  );
}
