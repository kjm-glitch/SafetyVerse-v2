-- ================================================================
-- Incident File System — Supabase Migration
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard)
-- Project: cfuupedcjroqarmgqcyn
-- ================================================================

-- 1. INCIDENT MEDICAL TABLE
-- Stores medical referral/refusal data and WC intake for each incident
CREATE TABLE IF NOT EXISTS incident_medical (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    medical_decision TEXT CHECK (medical_decision IN ('accepted', 'refused')),
    clinic_name TEXT,
    clinic_address TEXT,
    clinic_phone TEXT,
    authorization_notes TEXT,
    wc_claim_number TEXT,
    wc_insurance_carrier TEXT,
    wc_policy_number TEXT,
    wc_date_insurer_notified DATE,
    wc_date_left_work DATE,
    wc_date_disability_onset DATE,
    wc_notes TEXT,
    refusal_reason TEXT,
    refusal_employee_signature TEXT,
    refusal_witness_name TEXT,
    refusal_date DATE,
    wc_checklist JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(incident_id)
);

ALTER TABLE incident_medical ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON incident_medical FOR ALL USING (true) WITH CHECK (true);

-- 2. INCIDENT STATEMENTS TABLE
-- Stores employee and witness statements linked to an incident
CREATE TABLE IF NOT EXISTS incident_statements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    statement_type TEXT NOT NULL CHECK (statement_type IN ('employee', 'witness')),
    person_name TEXT,
    person_title TEXT,
    person_contact TEXT,
    statement_text TEXT,
    statement_date DATE,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE incident_statements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON incident_statements FOR ALL USING (true) WITH CHECK (true);

-- 3. INCIDENT INVESTIGATION TABLE
-- Stores investigation details, root cause, corrective actions, and close-out
CREATE TABLE IF NOT EXISTS incident_investigation (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    who_involved TEXT,
    what_happened TEXT,
    when_details TEXT,
    where_details TEXT,
    why_root_cause TEXT,
    contributing_factors JSONB DEFAULT '[]'::jsonb,
    corrective_actions JSONB DEFAULT '[]'::jsonb,
    closeout_safety_mgr TEXT,
    closeout_supervisor TEXT,
    closeout_date DATE,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(incident_id)
);

ALTER TABLE incident_investigation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON incident_investigation FOR ALL USING (true) WITH CHECK (true);

-- 4. INCIDENT RETURN TO WORK TABLE
-- Stores fit-for-duty and modified duty data
CREATE TABLE IF NOT EXISTS incident_rtw (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    clearance_status TEXT CHECK (clearance_status IN ('full', 'modified', 'not_cleared')),
    physician_name TEXT,
    eval_date DATE,
    restrictions TEXT,
    modified_duties TEXT,
    restriction_duration TEXT,
    next_followup_date DATE,
    supervisor_name TEXT,
    employee_acknowledged BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(incident_id)
);

ALTER TABLE incident_rtw ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON incident_rtw FOR ALL USING (true) WITH CHECK (true);

-- 5. APPROVED CLINICS TABLE
-- Stores approved occupational clinics managed from Settings page
CREATE TABLE IF NOT EXISTS approved_clinics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    phone TEXT,
    hours TEXT,
    services TEXT[] DEFAULT '{}',
    notes TEXT,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE approved_clinics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON approved_clinics FOR ALL USING (true) WITH CHECK (true);

-- Done! After running this SQL, the Incident File system tables are ready.
