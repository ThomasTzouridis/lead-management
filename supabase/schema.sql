-- V0 Lead Management — Schema
-- Run each statement one at a time in Supabase SQL Editor

-- 1. Clients
CREATE TABLE clients (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now());

-- 2. Upload batches
CREATE TABLE upload_batches (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE, filename TEXT NOT NULL, total_rows INT NOT NULL DEFAULT 0, imported_rows INT NOT NULL DEFAULT 0, skipped_no_contact INT NOT NULL DEFAULT 0, skipped_duplicate INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now());

-- 3. Leads
CREATE TABLE leads (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE, upload_batch_id UUID REFERENCES upload_batches(id) ON DELETE SET NULL, full_name TEXT, first_name TEXT, last_name TEXT, job_title TEXT, email TEXT, linkedin_url TEXT, phone TEXT, company_name TEXT, company_website TEXT, company_linkedin TEXT, company_facebook TEXT, raw_company_address TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());

-- 4. Dedup indexes (partial — only where value exists)
CREATE UNIQUE INDEX idx_leads_dedup_email ON leads(client_id, email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX idx_leads_dedup_linkedin ON leads(client_id, linkedin_url) WHERE linkedin_url IS NOT NULL;

-- 5. Performance indexes
CREATE INDEX idx_leads_client ON leads(client_id);

-- 6. Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER leads_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 7. RLS — allow anon full access (no auth in V0)
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon full access" ON clients FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon full access" ON leads FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon full access" ON upload_batches FOR ALL TO anon USING (true) WITH CHECK (true);
