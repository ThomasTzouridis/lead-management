"use client";

import { useEffect, useRef, useState } from "react";
import { StepClient } from "@/components/steps/step-client";
import { StepUpload } from "@/components/steps/step-upload";
import { StepMapping } from "@/components/steps/step-mapping";
import { StepImport } from "@/components/steps/step-import";
import { StepSummary } from "@/components/steps/step-summary";
import {
  clearPersistedUpload,
  loadPersistedUpload,
  savePersistedUpload,
} from "@/lib/upload-persistence";

export type UploadState = {
  clientId: string;
  clientName: string;
  file: File | null;
  headers: string[];
  previewRows: Record<string, string>[];
  rowCount: number; // total parsed rows — rows themselves are re-streamed in Step 4
  mapping: Record<string, string>; // csvColumn → targetField
  customFields: { value: string; label: string }[]; // user-created fields for this session
  reviewedHeaders: string[]; // headers the user (or an applied template) has marked as reviewed
  results: {
    total: number;
    imported: number;
    skippedNoContact: number;
    skippedDuplicate: number;
    newLeads: Record<string, unknown>[];
    batchId: string;
  } | null;
};

function createInitialState(): UploadState {
  return {
    clientId: "",
    clientName: "",
    file: null,
    headers: [],
    previewRows: [],
    rowCount: 0,
    mapping: {},
    customFields: [],
    reviewedHeaders: [],
    results: null,
  };
}

export default function HomePage() {
  const [step, setStep] = useState(1);
  const [state, setState] = useState<UploadState>(createInitialState);
  const [restored, setRestored] = useState(false);
  const hasHydrated = useRef(false);

  // Restore on mount — runs exactly once.
  useEffect(() => {
    const persisted = loadPersistedUpload();
    if (persisted) {
      setState((prev) => ({ ...prev, ...persisted.state, file: null }));
      setStep(persisted.step);
    }
    hasHydrated.current = true;
    setRestored(true);
  }, []);

  // Persist on every change (but only after hydration, to avoid clobbering
  // the restored state with the initial empty state on first render).
  useEffect(() => {
    if (!hasHydrated.current) return;
    savePersistedUpload(step, state);
  }, [step, state]);

  function updateState(partial: Partial<UploadState>) {
    setState((prev) => ({ ...prev, ...partial }));
  }

  function goToStep(s: number) {
    // Free memory when advancing past import
    if (s === 5) {
      setState((prev) => ({ ...prev, previewRows: [] }));
    }
    setStep(s);
  }

  function reset() {
    clearPersistedUpload();
    setState(createInitialState());
    setStep(1);
  }

  // Don't render wizard until restore has run — prevents a flash of Step 1
  // on reload when the user was mid-upload.
  if (!restored) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1400px] mx-auto p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Upload CSV</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Step {step} of 5
          </p>
          {/* Progress bar */}
          <div className="flex gap-1 mt-3">
            {[1, 2, 3, 4, 5].map((s) => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full ${
                  s <= step ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>
        </div>

        {step === 1 && (
          <StepClient
            state={state}
            onUpdate={updateState}
            onNext={() => goToStep(2)}
          />
        )}
        {step === 2 && (
          <StepUpload
            state={state}
            onUpdate={updateState}
            onNext={() => goToStep(3)}
            onBack={() => goToStep(1)}
          />
        )}
        {step === 3 && (
          <StepMapping
            state={state}
            onUpdate={updateState}
            onNext={() => goToStep(4)}
            onBack={() => goToStep(2)}
          />
        )}
        {step === 4 && (
          <StepImport
            state={state}
            onUpdate={updateState}
            onNext={() => goToStep(5)}
            onBack={() => goToStep(2)}
          />
        )}
        {step === 5 && state.results && (
          <StepSummary state={state} onReset={reset} />
        )}
      </div>
    </div>
  );
}
