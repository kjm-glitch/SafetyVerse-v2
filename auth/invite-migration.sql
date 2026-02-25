-- ============================================================
-- SafetyVerse Invite System Migration
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Add 'site' column to user_profiles
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS site TEXT DEFAULT 'HQ';

-- 2. Update the trigger to include site from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name, email, role, department, site)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
    COALESCE(NEW.raw_user_meta_data->>'department', 'Unassigned'),
    COALESCE(NEW.raw_user_meta_data->>'site', 'HQ')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Clear old site_locations and insert the 11 current sites
DELETE FROM public.site_locations;

INSERT INTO public.site_locations (name) VALUES
  ('HQ'),
  ('SN8'),
  ('GRN'),
  ('CYS'),
  ('RED'),
  ('MNZ'),
  ('YEL'),
  ('ADF'),
  ('QTS-Den'),
  ('QTS-Man'),
  ('TDY');

-- 4. Update Katie Mead's profile with site
UPDATE public.user_profiles SET site = 'HQ' WHERE email = 'katie.mead@cencoregroup.com';
