"use client";

import type { UploadState } from "@/app/page";

const KEY = "upload-wizard-state-v1";

type Persisted = {
  step: number;
  state: Omit<UploadState, "file">;
  savedAt: number;
};

// Sessions older than this are ignored on restore (stale state protection).
const MAX_AGE_MS = 1000 * 60 * 60 * 6; // 6 hours

export function loadPersistedUpload(): Persisted | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Persisted;
    if (!parsed || typeof parsed.step !== "number" || !parsed.state) return null;
    if (Date.now() - (parsed.savedAt ?? 0) > MAX_AGE_MS) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function savePersistedUpload(step: number, state: UploadState): void {
  if (typeof window === "undefined") return;

  // Strip File (not serialisable) and results (not worth restoring).
  const { file: _file, ...rest } = state;
  void _file;

  const fullPayload: Persisted = {
    step,
    state: rest,
    savedAt: Date.now(),
  };

  try {
    sessionStorage.setItem(KEY, JSON.stringify(fullPayload));
    return;
  } catch {
    // Quota exceeded — retry without heavy rows.
  }

  try {
    const slimPayload: Persisted = {
      step,
      state: { ...rest, previewRows: rest.previewRows.slice(0, 5) },
      savedAt: Date.now(),
    };
    sessionStorage.setItem(KEY, JSON.stringify(slimPayload));
  } catch {
    // Give up silently — persistence is best-effort.
  }
}

export function clearPersistedUpload(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
