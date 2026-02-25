-- ============================================================
-- RLS POLICY HARDENING MIGRATION
-- SafetyVerse — Role-Based Row Level Security
-- Date: 2026-02-25
--
-- Replaces all permissive "Allow all for anon" policies with
-- proper role-based access control across 13 tables.
--
-- Prerequisite: get_user_role() function must already exist
-- (created in auth/supabase-migration.sql)
--
-- Run this in the Supabase SQL Editor as a single query.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- SECTION 1: SCHEMA CHANGE — Add user_id to module_progress
-- ────────────────────────────────────────────────────────────

-- Add user_id column for row-level ownership of training progress
ALTER TABLE public.module_progress
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Backfill user_id from matching user_profiles.full_name
UPDATE public.module_progress mp
SET user_id = up.id
FROM public.user_profiles up
WHERE mp.employee_name = up.full_name
  AND mp.user_id IS NULL;


-- ────────────────────────────────────────────────────────────
-- SECTION 2: ENABLE RLS ON TABLES CREATED OUTSIDE MIGRATIONS
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hazard_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;


-- ────────────────────────────────────────────────────────────
-- SECTION 3: DROP ALL EXISTING PERMISSIVE POLICIES
-- ────────────────────────────────────────────────────────────

-- site_locations
DROP POLICY IF EXISTS "Allow all for anon" ON public.site_locations;
DROP POLICY IF EXISTS "Enable access for all users" ON public.site_locations;

-- employees
DROP POLICY IF EXISTS "Allow all for anon" ON public.employees;
DROP POLICY IF EXISTS "Enable access for all users" ON public.employees;

-- certifications
DROP POLICY IF EXISTS "Allow all for anon" ON public.certifications;
DROP POLICY IF EXISTS "Enable access for all users" ON public.certifications;

-- module_progress
DROP POLICY IF EXISTS "Allow all for anon" ON public.module_progress;
DROP POLICY IF EXISTS "Enable access for all users" ON public.module_progress;

-- corrective_actions
DROP POLICY IF EXISTS "Allow all for anon" ON public.corrective_actions;
DROP POLICY IF EXISTS "Enable access for all users" ON public.corrective_actions;

-- incidents
DROP POLICY IF EXISTS "Allow all for anon" ON public.incidents;
DROP POLICY IF EXISTS "Enable access for all users" ON public.incidents;

-- incident_medical
DROP POLICY IF EXISTS "Allow all for anon" ON public.incident_medical;
DROP POLICY IF EXISTS "Enable access for all users" ON public.incident_medical;

-- incident_statements
DROP POLICY IF EXISTS "Allow all for anon" ON public.incident_statements;
DROP POLICY IF EXISTS "Enable access for all users" ON public.incident_statements;

-- incident_investigation
DROP POLICY IF EXISTS "Allow all for anon" ON public.incident_investigation;
DROP POLICY IF EXISTS "Enable access for all users" ON public.incident_investigation;

-- incident_rtw
DROP POLICY IF EXISTS "Allow all for anon" ON public.incident_rtw;
DROP POLICY IF EXISTS "Enable access for all users" ON public.incident_rtw;

-- approved_clinics
DROP POLICY IF EXISTS "Allow all for anon" ON public.approved_clinics;
DROP POLICY IF EXISTS "Enable access for all users" ON public.approved_clinics;

-- hazard_observations
DROP POLICY IF EXISTS "Allow all for anon" ON public.hazard_observations;
DROP POLICY IF EXISTS "Enable access for all users" ON public.hazard_observations;

-- company_settings
DROP POLICY IF EXISTS "Allow all for anon" ON public.company_settings;
DROP POLICY IF EXISTS "Enable access for all users" ON public.company_settings;


-- ────────────────────────────────────────────────────────────
-- SECTION 4: CREATE NEW ROLE-BASED POLICIES
-- ────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════
-- TABLE: site_locations
-- All authenticated can READ. Admin only for write operations.
-- Used by: settings, incident-report, admin-dashboard
-- ═══════════════════════════════════════════════════════════

CREATE POLICY "Authenticated users can read site_locations"
  ON public.site_locations FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can insert site_locations"
  ON public.site_locations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND public.get_user_role() = 'admin');

CREATE POLICY "Admins can update site_locations"
  ON public.site_locations FOR UPDATE
  USING (auth.uid() IS NOT NULL AND public.get_user_role() = 'admin');

CREATE POLICY "Admins can delete site_locations"
  ON public.site_locations FOR DELETE
  USING (auth.uid() IS NOT NULL AND public.get_user_role() = 'admin');


-- ═══════════════════════════════════════════════════════════
-- TABLE: employees
-- Admin + Manager can READ. Admin only for write operations.
-- Used by: admin-dashboard
-- ═══════════════════════════════════════════════════════════

CREATE POLICY "Admin and manager can read employees"
  ON public.employees FOR SELECT
  USING (auth.uid() IS NOT NULL AND public.get_user_role() IN ('admin', 'manager'));

CREATE POLICY "Admins can insert employees"
  ON public.employees FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND public.get_user_role() = 'admin');

CREATE POLICY "Admins can update employees"
  ON public.employees FOR UPDATE
  USING (auth.uid() IS NOT NULL AND public.get_user_role() = 'admin');

CREATE POLICY "Admins can delete employees"
  ON public.employees FOR DELETE
  USING (auth.uid() IS NOT NULL AND public.get_user_role() = 'admin');


-- ═══════════════════════════════════════════════════════════
-- TABLE: certifications
-- Admin + Manager can READ. Admin only for write operations.
-- Used by: admin-dashboard
-- ═══════════════════════════════════════════════════════════

CREATE POLICY "Admin and manager can read certifications"
  ON public.certifications FOR SELECT
  USING (auth.uid() IS NOT NULL AND public.get_user_role() IN ('admin', 'manager'));

CREATE POLICY "Admins can insert certifications"
  ON public.certifications FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND public.get_user_role() = 'admin');

CREATE POLICY "Admins can update certifications"
  ON public.certifications FOR UPDATE
  USING (auth.uid() IS NOT NULL AND public.get_user_role() = 'admin');

CREATE POLICY "Admins can delete certifications"
  ON public.certifications FOR DELETE
  USING (auth.uid() IS NOT NULL AND public.get_user_role() = 'admin');


-- ═══════════════════════════════════════════════════════════
-- TABLE: module_progress
-- Users can read/write their OWN rows (via user_id).
-- Admin + Manager can read ALL rows.
-- Admin can delete.
-- Used by: all 20 lesson modules, admin-dashboard
-- ═══════════════════════════════════════════════════════════

CREATE POLICY "Users can read own module_progress"
  ON public.module_progress FOR SELECT
  USING (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "Admin and manager can read all module_progress"
  ON public.module_progress FOR SELECT
  USING (auth.uid() IS NOT NULL AND public.get_user_role() IN ('admin', 'manager'));

CREATE POLICY "Users can insert own module_progress"
  ON public.module_progress FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "Users can update own module_progress"
  ON public.module_progress FOR UPDATE
  USING (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "Admins can delete module_progress"
  ON public.module_progress FOR DELETE
  USING (auth.uid() IS NOT NULL AND public.get_user_role() = 'admin');


-- ═══════════════════════════════════════════════════════════
-- TABLE: corrective_actions
-- Admin + Manager can READ. Manager can UPDATE (status changes).
-- Admin only for INSERT/DELETE.
-- Used by: admin-dashboard
-- ═══════════════════════════════════════════════════════════

CREATE POLICY "Admin and manager can read corrective_actions"
  ON public.corrective_actions FOR SELECT
  USING (auth.uid() IS NOT NULL AND public.get_user_role() IN ('admin', 'manager'));

CREATE POLICY "Admins can insert corrective_actions"
  ON public.corrective_actions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND public.get_user_role() = 'admin');

CREATE POLICY "Admin and manager can update corrective_actions"
  ON public.corrective_actions FOR UPDATE
  USING (auth.uid() IS NOT NULL AND public.get_user_role() IN ('admin', 'manager'));

CREATE POLICY "Admins can delete corrective_actions"
  ON public.corrective_actions FOR DELETE
  USING (auth.uid() IS NOT NULL AND public.get_user_role() = 'admin');


-- ═══════════════════════════════════════════════════════════
-- TABLE: incidents
-- Admin + Manager full CRUD. Users have no access.
-- Used by: incident-report, admin-dashboard
-- ═══════════════════════════════════════════════════════════

CREATE POLICY "Admin and manager can read incidents"
  ON public.incidents FOR SELECT
  USING (auth.uid() IS NOT NULL AND public.get_user_role() IN ('admin', 'manager'));

CREATE POLICY "Admin and manager can insert incidents"
  ON public.incidents FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND public.get_user_role() IN ('admin', 'manager'));

CREATE POLICY "Admin and manager can update incidents"
  ON public.incidents FOR UPDATE
  USING (auth.uid() IS NOT NULL AND public.get_user_role() IN ('admin', 'manager'));

CREATE POLICY "Admin and manager can delete incidents"
  ON public.incidents FOR DELETE
  USING (auth.uid() IS NOT NULL AND public.get_user_role() IN ('admin', 'manager'));


-- ═══════════════════════════════════════════════════════════
-- TABLE: incident_medical
-- Admin + Manager full CRUD. Users have no access.
-- Used by: incident-report
-- ═══════════════════════════════════════════════════════════

CREATE POLICY "Admin and manager can read incident_medical"
  ON public.incident_medical FOR SELECT
  USING (auth.uid() IS NOT NULL AND public.get_user_role() IN ('admin', 'manager'));

CREATE POLICY "Admin and manager can insert incident_medical"
  ON public.incident_medical FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND public.get_user_role() IN ('admin', 'manager'));

CREATE POLICY "Admin and manager can update incident_medical"
  ON public.incident_medical FOR UPDATE
  USING (auth.uid() IS NOT NULL AND public.get_user_role() IN ('admin', 'manager'));

CREATE POLICY "Admin and manager can delete incident_medical"
  ON public.incident_medical FOR DELETE
  USING (auth.uid() IS NOT NULL AND public.get_user_role() IN ('admin', 'manager'));


-- ═══════════════════════════════════════════════════════════
-- TABLE: incident_statements
-- Admin + Manager full CRUD. Users have no access.
-- Used by: incident-report
-- ═══════════════════════════════════════════════════════════

CREATE POLICY "Admin and manager can read incident_statements"
  ON public.incident_statements FOR SELECT
  USING (auth.uid() IS NOT NULL AND public.get_user_role() IN ('admin', 'manager'));

CREATE POLICY "Admin and manager can insert incident_statements"
  ON public.incident_statements FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND public.get_user_role() IN ('admin', 'manager'));

CREATE POLICY "Admin and manager can update incident_statements"
  ON public.incident_statements FOR UPDATE
  USING (auth.uid() IS NOT NULL AND public.get_user_role() IN ('admin', 'manager'));

CREATE POLICY "Admin and manager can delete incident_statements"
  ON public.incident_statements FOR DELETE
  USING (auth.uid() IS NOT NULL AND public.get_user_role() IN ('admin', 'manager'));


-- ═══════════════════════════════════════════════════════════
-- TABLE: incident_investigation
-- Admin + Manager full CRUD. Users have no access.
-- Used by: incident-report
-- ═══════════════════════════════════════════════════════════

CREATE POLICY "Admin and manager can read incident_investigation"
  ON public.incident_investigation FOR SELECT
  USING (auth.uid() IS NOT NULL AND public.get_user_role() IN ('admin', 'manager'));

CREATE POLICY "Admin and manager can insert incident_investigation"
  ON public.incident_investigation FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND public.get_user_role() IN ('admin', 'manager'));

CREATE POLICY "Admin and manager can update incident_investigation"
  ON public.incident_investigation FOR UPDATE
  USING (auth.uid() IS NOT NULL AND public.get_user_role() IN ('admin', 'manager'));

CREATE POLICY "Admin and manager can delete incident_investigation"
  ON public.incident_investigation FOR DELETE
  USING (auth.uid() IS NOT NULL AND public.get_user_role() IN ('admin', 'manager'));


-- ═══════════════════════════════════════════════════════════
-- TABLE: incident_rtw
-- Admin + Manager full CRUD. Users have no access.
-- Used by: incident-report
-- ═══════════════════════════════════════════════════════════

CREATE POLICY "Admin and manager can read incident_rtw"
  ON public.incident_rtw FOR SELECT
  USING (auth.uid() IS NOT NULL AND public.get_user_role() IN ('admin', 'manager'));

CREATE POLICY "Admin and manager can insert incident_rtw"
  ON public.incident_rtw FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND public.get_user_role() IN ('admin', 'manager'));

CREATE POLICY "Admin and manager can update incident_rtw"
  ON public.incident_rtw FOR UPDATE
  USING (auth.uid() IS NOT NULL AND public.get_user_role() IN ('admin', 'manager'));

CREATE POLICY "Admin and manager can delete incident_rtw"
  ON public.incident_rtw FOR DELETE
  USING (auth.uid() IS NOT NULL AND public.get_user_role() IN ('admin', 'manager'));


-- ═══════════════════════════════════════════════════════════
-- TABLE: approved_clinics
-- Admin + Manager can READ. Admin only for write operations.
-- Used by: settings, incident-report
-- ═══════════════════════════════════════════════════════════

CREATE POLICY "Admin and manager can read approved_clinics"
  ON public.approved_clinics FOR SELECT
  USING (auth.uid() IS NOT NULL AND public.get_user_role() IN ('admin', 'manager'));

CREATE POLICY "Admins can insert approved_clinics"
  ON public.approved_clinics FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND public.get_user_role() = 'admin');

CREATE POLICY "Admins can update approved_clinics"
  ON public.approved_clinics FOR UPDATE
  USING (auth.uid() IS NOT NULL AND public.get_user_role() = 'admin');

CREATE POLICY "Admins can delete approved_clinics"
  ON public.approved_clinics FOR DELETE
  USING (auth.uid() IS NOT NULL AND public.get_user_role() = 'admin');


-- ═══════════════════════════════════════════════════════════
-- TABLE: hazard_observations
-- Admin + Manager full CRUD. Users have no access.
-- Used by: hazard-observation
-- ═══════════════════════════════════════════════════════════

CREATE POLICY "Admin and manager can read hazard_observations"
  ON public.hazard_observations FOR SELECT
  USING (auth.uid() IS NOT NULL AND public.get_user_role() IN ('admin', 'manager'));

CREATE POLICY "Admin and manager can insert hazard_observations"
  ON public.hazard_observations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND public.get_user_role() IN ('admin', 'manager'));

CREATE POLICY "Admin and manager can update hazard_observations"
  ON public.hazard_observations FOR UPDATE
  USING (auth.uid() IS NOT NULL AND public.get_user_role() IN ('admin', 'manager'));

CREATE POLICY "Admin and manager can delete hazard_observations"
  ON public.hazard_observations FOR DELETE
  USING (auth.uid() IS NOT NULL AND public.get_user_role() IN ('admin', 'manager'));


-- ═══════════════════════════════════════════════════════════
-- TABLE: company_settings
-- All authenticated can READ. Admin only for write operations.
-- Used by: settings, incident-report
-- ═══════════════════════════════════════════════════════════

CREATE POLICY "Authenticated users can read company_settings"
  ON public.company_settings FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can insert company_settings"
  ON public.company_settings FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND public.get_user_role() = 'admin');

CREATE POLICY "Admins can update company_settings"
  ON public.company_settings FOR UPDATE
  USING (auth.uid() IS NOT NULL AND public.get_user_role() = 'admin');

CREATE POLICY "Admins can delete company_settings"
  ON public.company_settings FOR DELETE
  USING (auth.uid() IS NOT NULL AND public.get_user_role() = 'admin');


-- ────────────────────────────────────────────────────────────
-- SECTION 5: VERIFICATION — List all policies after migration
-- ────────────────────────────────────────────────────────────

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;
