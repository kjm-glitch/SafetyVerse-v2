-- Remove retired site locations (old seed data)
-- Run this in Supabase SQL Editor to permanently remove these entries

DELETE FROM public.site_locations
WHERE name IN (
  'Annapolis - MD',
  'Cheyenne - WY',
  'Denver - CO',
  'San Antonio - TX',
  'Warrenton - VA'
);
