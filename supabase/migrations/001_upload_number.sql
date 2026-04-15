-- Persistent upload numbering: each upload_batch gets a monotonic number
-- that is NEVER reused, even if a batch is deleted.
-- Run once in Supabase SQL Editor.

CREATE SEQUENCE IF NOT EXISTS upload_batch_seq;

ALTER TABLE upload_batches
  ADD COLUMN IF NOT EXISTS upload_number BIGINT;

-- Backfill existing rows in chronological order, then attach the sequence
-- as the default for future inserts.
DO $$
DECLARE
  r RECORD;
  n BIGINT := 0;
BEGIN
  FOR r IN SELECT id FROM upload_batches WHERE upload_number IS NULL ORDER BY created_at ASC LOOP
    n := nextval('upload_batch_seq');
    UPDATE upload_batches SET upload_number = n WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE upload_batches
  ALTER COLUMN upload_number SET DEFAULT nextval('upload_batch_seq'),
  ALTER COLUMN upload_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_batches_upload_number ON upload_batches(upload_number);
