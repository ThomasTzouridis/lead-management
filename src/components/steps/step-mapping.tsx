"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TARGET_FIELDS } from "@/lib/constants";
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

  // Which target fields are already used
  const usedTargets = useMemo(
    () => new Set(Object.values(mapping).filter((v) => v !== "skip")),
    [mapping]
  );

  function setMapping(csvCol: string, target: string) {
    const next = { ...mapping };
    if (target === "skip") {
      delete next[csvCol];
    } else {
      next[csvCol] = target;
    }
    onUpdate({ mapping: next });
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

      <div className="space-y-2 max-h-[500px] overflow-auto">
        {state.headers.map((csvCol) => {
          const currentTarget = mapping[csvCol] || "skip";

          // Sample values for this column (first 3 non-empty)
          const samples = state.previewRows
            .map((r) => r[csvCol])
            .filter((v) => v != null && v !== "")
            .slice(0, 3)
            .map((v) => String(v).length > 40 ? String(v).slice(0, 40) + "..." : String(v));

          return (
            <div
              key={csvCol}
              className="flex items-center gap-4 p-3 rounded-lg border bg-card"
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

              {/* Target field dropdown */}
              <div className="w-[200px] shrink-0">
                <Select
                  value={currentTarget}
                  onValueChange={(v) => v && setMapping(csvCol, v)}
                >
                  <SelectTrigger>
                    <SelectValue />
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
                  </SelectContent>
                </Select>
              </div>
            </div>
          );
        })}
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
