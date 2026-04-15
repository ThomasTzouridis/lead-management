"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { TARGET_FIELDS, CUSTOM_FIELD_PREFIX } from "@/lib/constants";
import {
  fetchMappingTemplates,
  saveMappingTemplate,
  deleteMappingTemplate,
  classifyTemplateMatches,
  applyMappingTemplate,
  type MappingTemplate,
} from "@/lib/lead-queries";
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
  const reviewedHeaders = useMemo(
    () => new Set(state.reviewedHeaders),
    [state.reviewedHeaders]
  );
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const [newFieldName, setNewFieldName] = useState("");

  // --- Templates state ---
  const [templates, setTemplates] = useState<MappingTemplate[]>([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [manageDialogOpen, setManageDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [lastAppliedTemplateId, setLastAppliedTemplateId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMappingTemplates()
      .then((data) => {
        if (!cancelled) {
          setTemplates(data);
          setTemplatesLoaded(true);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setTemplatesLoaded(true);
          toast.error(`Could not load templates: ${err.message}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const matches = useMemo(
    () => classifyTemplateMatches(templates, state.headers),
    [templates, state.headers]
  );

  function handleApplyTemplate(template: MappingTemplate) {
    const applied = applyMappingTemplate(template, state.headers, customFields);
    const mappedCount = Object.keys(applied.mapping).length;
    const templateSize = Object.keys(template.mapping).length;

    // Mark every header the template knew about as reviewed.
    // Any header left unchecked after apply is brand new / not covered by the template.
    const headerSet = new Set(state.headers);
    const reviewed = template.headers.filter((h) => headerSet.has(h));

    onUpdate({
      mapping: applied.mapping,
      customFields: applied.customFields,
      reviewedHeaders: reviewed,
    });
    setLastAppliedTemplateId(template.id);

    if (mappedCount === 0) {
      toast.warning(
        `Template "${template.name}" applied, but none of its columns match this CSV`
      );
    } else if (mappedCount < templateSize) {
      toast.success(
        `Template "${template.name}" applied: ${mappedCount} of ${templateSize} columns mapped`
      );
    } else {
      toast.success(`Template "${template.name}" applied (${mappedCount} columns)`);
    }
  }

  function openSaveDialog() {
    const mappedCount = Object.keys(mapping).length;
    if (mappedCount === 0) {
      toast.error("Map at least one column before saving a template");
      return;
    }
    // Suggest a default name based on file name (without extension)
    const fileBase = state.file?.name.replace(/\.csv$/i, "") || "";
    setSaveName(fileBase);
    setSaveDialogOpen(true);
  }

  async function handleSaveTemplate() {
    const name = saveName.trim();
    if (!name) {
      toast.error("Template name cannot be empty");
      return;
    }

    const exists = templates.some((t) => t.name === name);
    if (exists) {
      const ok = window.confirm(
        `A template named "${name}" already exists. Overwrite it?`
      );
      if (!ok) return;
    }

    setSaving(true);
    try {
      const saved = await saveMappingTemplate(
        name,
        state.headers,
        mapping,
        customFields
      );
      setTemplates((prev) => {
        const filtered = prev.filter((t) => t.name !== saved.name);
        return [...filtered, saved].sort((a, b) => a.name.localeCompare(b.name));
      });
      setLastAppliedTemplateId(saved.id);
      setSaveDialogOpen(false);
      setSaveName("");
      toast.success(`Template "${saved.name}" saved`);
    } catch (err) {
      toast.error(
        `Could not save template: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTemplate(id: string, name: string) {
    const ok = window.confirm(`Delete template "${name}"? This cannot be undone.`);
    if (!ok) return;
    setDeletingId(id);
    try {
      await deleteMappingTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      if (lastAppliedTemplateId === id) setLastAppliedTemplateId(null);
      toast.success(`Template "${name}" deleted`);
    } catch (err) {
      toast.error(
        `Could not delete template: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setDeletingId(null);
    }
  }

  function toggleReview(csvCol: string) {
    const next = new Set(state.reviewedHeaders);
    if (next.has(csvCol)) next.delete(csvCol);
    else next.add(csvCol);
    onUpdate({ reviewedHeaders: Array.from(next) });
  }

  // Which target fields are already used
  const usedTargets = useMemo(
    () => new Set(Object.values(mapping).filter((v) => v !== "skip")),
    [mapping]
  );

  function setMapping(csvCol: string, target: string) {
    if (target === "__create_custom__") {
      setCreatingFor(csvCol);
      setNewFieldName(csvCol);
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Step 3: Map Columns</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {mappedCount} of {state.headers.length} columns mapped
          </p>
        </div>

        {/* Template toolbar — uses native <select> to avoid Radix Portal
            re-rendering the full Step 3 tree (which crashes the tab on large CSVs). */}
        <div className="flex items-center gap-2 shrink-0">
          <select
            disabled={!templatesLoaded || templates.length === 0}
            value=""
            onChange={(e) => {
              const id = e.target.value;
              if (!id) return;
              const t = templates.find((x) => x.id === id);
              if (t) handleApplyTemplate(t);
              // reset so the same template can be re-applied later
              e.currentTarget.value = "";
            }}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
            aria-label="Load template"
          >
            <option value="">
              {templates.length === 0
                ? "📋 No templates yet"
                : matches.exact.length > 0
                  ? `📋 Load template (${matches.exact.length} match)`
                  : "📋 Load template"}
            </option>
            {matches.exact.length > 0 && (
              <optgroup label="Exact match">
                {matches.exact.map((t) => (
                  <option key={t.id} value={t.id}>
                    {lastAppliedTemplateId === t.id ? "✓ " : ""}
                    {t.name}
                  </option>
                ))}
              </optgroup>
            )}
            {matches.partial.length > 0 && (
              <optgroup label="Partial match">
                {matches.partial.map(({ template, overlap, total }) => (
                  <option key={template.id} value={template.id}>
                    {lastAppliedTemplateId === template.id ? "✓ " : ""}
                    {template.name} ({overlap}/{total})
                  </option>
                ))}
              </optgroup>
            )}
            {(() => {
              const matchedIds = new Set([
                ...matches.exact.map((t) => t.id),
                ...matches.partial.map((p) => p.template.id),
              ]);
              const others = templates.filter((t) => !matchedIds.has(t.id));
              if (others.length === 0) return null;
              return (
                <optgroup label="Other templates">
                  {others.map((t) => (
                    <option key={t.id} value={t.id}>
                      {lastAppliedTemplateId === t.id ? "✓ " : ""}
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              );
            })()}
          </select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setManageDialogOpen(true)}
            disabled={templates.length === 0}
          >
            Manage
          </Button>

          <Button variant="outline" size="sm" onClick={openSaveDialog}>
            💾 Save as template
          </Button>
        </div>
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

          const isReviewed = currentTarget !== "skip" || reviewedHeaders.has(csvCol);

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

              {/* Review checkbox — hidden while naming a custom field to avoid overlap with X */}
              {!isCreating && (
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
              )}
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

      {/* Save-as-template dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save as template</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Template name</label>
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !saving) handleSaveTemplate();
              }}
              autoFocus
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Saving {Object.keys(mapping).length} mapped columns
              {customFields.length > 0 && ` + ${customFields.length} custom field${customFields.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSaveTemplate} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage templates dialog */}
      <Dialog open={manageDialogOpen} onOpenChange={setManageDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage templates</DialogTitle>
            <DialogDescription>
              Delete templates you no longer need. This does not affect already-imported leads.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[400px] overflow-auto">
            {templates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No templates saved.</p>
            ) : (
              templates.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-3 p-3 border rounded-lg"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.headers.length} columns · {Object.keys(t.mapping).length} mapped
                      {t.custom_fields.length > 0 &&
                        ` · ${t.custom_fields.length} custom`}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteTemplate(t.id, t.name)}
                    disabled={deletingId === t.id}
                  >
                    {deletingId === t.id ? "…" : "Delete"}
                  </Button>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManageDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
