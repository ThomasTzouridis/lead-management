"use client";

import { useState } from "react";
import { StepClient } from "@/components/steps/step-client";
import { StepUpload } from "@/components/steps/step-upload";
import { StepMapping } from "@/components/steps/step-mapping";
import { StepImport } from "@/components/steps/step-import";
import { StepSummary } from "@/components/steps/step-summary";

export type UploadState = {
  clientId: string;
  clientName: string;
  file: File | null;
  headers: string[];
  previewRows: Record<string, string>[];
  allRows: Record<string, string>[];
  mapping: Record<string, string>; // csvColumn → targetField
  results: {
    total: number;
    imported: number;
    skippedNoContact: number;
    skippedDuplicate: number;
    newLeads: Record<string, unknown>[];
    batchId: string;
  } | null;
};

const INITIAL_STATE: UploadState = {
  clientId: "",
  clientName: "",
  file: null,
  headers: [],
  previewRows: [],
  allRows: [],
  mapping: {},
  results: null,
};

export default function HomePage() {
  const [step, setStep] = useState(1);
  const [state, setState] = useState<UploadState>(INITIAL_STATE);

  function updateState(partial: Partial<UploadState>) {
    setState((prev) => ({ ...prev, ...partial }));
  }

  function reset() {
    setState(INITIAL_STATE);
    setStep(1);
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Lead Management</h1>
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
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <StepUpload
            state={state}
            onUpdate={updateState}
            onNext={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <StepMapping
            state={state}
            onUpdate={updateState}
            onNext={() => setStep(4)}
            onBack={() => setStep(2)}
          />
        )}
        {step === 4 && (
          <StepImport
            state={state}
            onUpdate={updateState}
            onNext={() => setStep(5)}
          />
        )}
        {step === 5 && (
          <StepSummary state={state} onReset={reset} />
        )}
      </div>
    </div>
  );
}
