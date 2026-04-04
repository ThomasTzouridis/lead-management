-- V0 Lead Management — Schema
-- Run each statement one at a time in Supabase SQL Editor

-- 1. Clients
CREATE TABLE clients (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now());

-- 2. Upload batches
CREATE TABLE upload_batches (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE, filename TEXT NOT NULL, total_rows INT NOT NULL DEFAULT 0, imported_rows INT NOT NULL DEFAULT 0, skipped_no_contact INT NOT NULL DEFAULT 0, skipped_duplicate INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now());

-- 3. Leads
CREATE TABLE leads (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE, upload_batch_id UUID REFERENCES upload_batches(id) ON DELETE SET NULL, full_name TEXT, first_name TEXT, last_name TEXT, job_title TEXT, email TEXT, linkedin_url TEXT, phone TEXT, company_name TEXT, company_website TEXT, company_linkedin TEXT, company_facebook TEXT, raw_company_address TEXT, custom_fields JSONB DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());

-- 4. Dedup indexes (partial — only where value exists)
CREATE UNIQUE INDEX idx_leads_dedup_email ON leads(client_id, email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX idx_leads_dedup_linkedin ON leads(client_id, linkedin_url) WHERE linkedin_url IS NOT NULL;

-- 5. Performance indexes
CREATE INDEX idx_leads_client ON leads(client_id);
CREATE INDEX idx_batches_client ON upload_batches(client_id);
CREATE INDEX idx_leads_batch ON leads(upload_batch_id);

-- 5b. Normalize email + LinkedIn on insert/update (lowercase, trimmed)
CREATE OR REPLACE FUNCTION normalize_lead_contact() RETURNS TRIGGER AS $$ BEGIN NEW.email = lower(trim(NEW.email)); NEW.linkedin_url = lower(trim(NEW.linkedin_url)); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER leads_normalize BEFORE INSERT OR UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION normalize_lead_contact();

-- 6. Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER leads_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 7b. RPC: Bulk merge a single key into custom_fields JSONB (used by bulk fill)
CREATE OR REPLACE FUNCTION bulk_merge_custom_field(
  lead_ids UUID[],
  field_name TEXT,
  field_value TEXT
) RETURNS void AS $$
BEGIN
  UPDATE leads
  SET custom_fields = COALESCE(custom_fields, '{}'::jsonb) || jsonb_build_object(field_name, field_value)
  WHERE id = ANY(lead_ids);
END;
$$ LANGUAGE plpgsql;

-- 7c. RPC: Get all distinct custom field keys across all leads
CREATE OR REPLACE FUNCTION get_custom_field_keys()
RETURNS TABLE(key TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT jsonb_object_keys(custom_fields) AS key
  FROM leads
  WHERE custom_fields IS NOT NULL AND custom_fields != '{}'::jsonb
  ORDER BY key;
END;
$$ LANGUAGE plpgsql;

-- 7. RLS — allow anon full access (no auth in V0)
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon full access" ON clients FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon full access" ON leads FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon full access" ON upload_batches FOR ALL TO anon USING (true) WITH CHECK (true);
