-- Track how many existing leads were replaced in each upload batch
-- (when the user picks "replace duplicates" mode at import time).
-- Run once in Supabase SQL Editor.

ALTER TABLE upload_batches
  ADD COLUMN IF NOT EXISTS replaced_rows INT NOT NULL DEFAULT 0;
