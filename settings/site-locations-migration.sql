-- =============================================
-- Site Locations + Clinic Site Assignment
-- =============================================

-- Site Locations table
CREATE TABLE IF NOT EXISTS site_locations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE site_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON site_locations FOR ALL USING (true) WITH CHECK (true);

-- Seed initial sites
INSERT INTO site_locations (name) VALUES
  ('Denver - CO'),
  ('Cheyenne - WY'),
  ('San Antonio - TX'),
  ('Annapolis - MD'),
  ('Warrenton - VA');

-- Add site_location column to approved_clinics
ALTER TABLE approved_clinics ADD COLUMN IF NOT EXISTS site_location TEXT;
