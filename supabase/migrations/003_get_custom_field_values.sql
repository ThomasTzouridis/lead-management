-- RPC: Return distinct values of a single custom_fields key, optionally scoped to a client.
-- Used by the "List" filter dropdown on /leads so it can enumerate distinct list names
-- (e.g. "Cold Calling") across 12k+ rows without pulling every custom_fields blob client-side.
-- Run once in Supabase SQL Editor.

CREATE OR REPLACE FUNCTION get_custom_field_values(
  field_name TEXT,
  p_client_id UUID DEFAULT NULL
)
RETURNS TABLE(value TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT (custom_fields->>field_name)::TEXT AS value
  FROM leads
  WHERE custom_fields ? field_name
    AND custom_fields->>field_name IS NOT NULL
    AND custom_fields->>field_name <> ''
    AND (p_client_id IS NULL OR client_id = p_client_id)
  ORDER BY value;
END;
$$ LANGUAGE plpgsql;
