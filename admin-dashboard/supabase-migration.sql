-- ================================================================
-- SafetyVerse Admin Dashboard — Supabase Migration
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard)
-- Project: cfuupedcjroqarmgqcyn
-- ================================================================

-- 1. EMPLOYEES TABLE
-- Core employee registry for user management
CREATE TABLE IF NOT EXISTS employees (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'User' CHECK (role IN ('Admin', 'User')),
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
    department TEXT DEFAULT 'Unassigned',
    date_added TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS (but allow anon for now — tighten with auth later)
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON employees FOR ALL USING (true) WITH CHECK (true);

-- 2. CORRECTIVE ACTIONS TABLE (SQMS)
-- Tracks safety deviations and corrective measures
CREATE TABLE IF NOT EXISTS corrective_actions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    action_id TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'Minor' CHECK (severity IN ('Critical', 'Major', 'Minor')),
    assigned_to TEXT,
    due_date DATE,
    status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'In Progress', 'Closed')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE corrective_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON corrective_actions FOR ALL USING (true) WITH CHECK (true);

-- Auto-generate action_id sequence helper
CREATE OR REPLACE FUNCTION generate_ca_id()
RETURNS TRIGGER AS $$
DECLARE
    next_num INT;
BEGIN
    SELECT COALESCE(MAX(CAST(SUBSTRING(action_id FROM 'CA-\d{4}-(\d+)') AS INT)), 0) + 1
    INTO next_num
    FROM corrective_actions;
    NEW.action_id := 'CA-' || EXTRACT(YEAR FROM now())::TEXT || '-' || LPAD(next_num::TEXT, 3, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_ca_id
    BEFORE INSERT ON corrective_actions
    FOR EACH ROW
    WHEN (NEW.action_id IS NULL OR NEW.action_id = '')
    EXECUTE FUNCTION generate_ca_id();

-- 3. CERTIFICATIONS TABLE
-- Tracks employee certification expiry dates
CREATE TABLE IF NOT EXISTS certifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_name TEXT NOT NULL,
    cert_type TEXT NOT NULL,
    expiry_date DATE NOT NULL,
    issued_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE certifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON certifications FOR ALL USING (true) WITH CHECK (true);

-- 4. MODULE PROGRESS TABLE
-- Syncs localStorage lesson progress to Supabase for admin visibility
CREATE TABLE IF NOT EXISTS module_progress (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_name TEXT NOT NULL,
    department TEXT DEFAULT 'Unassigned',
    module_slug TEXT NOT NULL,
    module_name TEXT NOT NULL,
    completed BOOLEAN DEFAULT false,
    quiz_score INT DEFAULT 0,
    attempts INT DEFAULT 0,
    last_activity TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(employee_name, module_slug)
);

ALTER TABLE module_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON module_progress FOR ALL USING (true) WITH CHECK (true);

-- 5. SEED DATA — Employees
INSERT INTO employees (name, email, role, status, department, date_added) VALUES
    ('Katie Johnson', 'katie.johnson@safetyverse.com', 'Admin', 'Active', 'Office', '2024-08-15'),
    ('Marcus Rivera', 'marcus.rivera@safetyverse.com', 'User', 'Active', 'Operations', '2024-09-02'),
    ('Sarah Chen', 'sarah.chen@safetyverse.com', 'User', 'Active', 'Warehouse', '2024-09-10'),
    ('James Okonkwo', 'james.okonkwo@safetyverse.com', 'User', 'Active', 'Maintenance', '2024-10-01'),
    ('Lisa Patel', 'lisa.patel@safetyverse.com', 'Admin', 'Active', 'Office', '2024-10-15'),
    ('David Kowalski', 'david.kowalski@safetyverse.com', 'User', 'Inactive', 'Maintenance', '2024-11-01'),
    ('Maria Garcia', 'maria.garcia@safetyverse.com', 'User', 'Active', 'Warehouse', '2024-11-20'),
    ('Tyler Brooks', 'tyler.brooks@safetyverse.com', 'User', 'Active', 'Field', '2024-12-05'),
    ('Aisha Mohammed', 'aisha.mohammed@safetyverse.com', 'User', 'Active', 'Operations', '2025-01-10'),
    ('Brian Nguyen', 'brian.nguyen@safetyverse.com', 'User', 'Inactive', 'Field', '2025-01-22')
ON CONFLICT (email) DO NOTHING;

-- 6. SEED DATA — Corrective Actions
INSERT INTO corrective_actions (action_id, description, severity, assigned_to, due_date, status) VALUES
    ('CA-2026-001', 'Missing guard on conveyor belt B3 — exposed pinch point', 'Critical', 'Marcus Rivera', '2026-02-25', 'Open'),
    ('CA-2026-002', 'Emergency exit lighting failure in Building 2, east corridor', 'Major', 'James Okonkwo', '2026-03-01', 'In Progress'),
    ('CA-2026-003', 'Forklift pre-shift inspection logs missing for week of Feb 3', 'Minor', 'Maria Garcia', '2026-02-20', 'Closed'),
    ('CA-2026-004', 'Chemical spill kit in Lab A expired — needs replenishment', 'Major', 'Sarah Chen', '2026-02-28', 'Open'),
    ('CA-2026-005', 'Ladder inspection tags overdue in warehouse zone 4', 'Minor', 'Tyler Brooks', '2026-03-05', 'In Progress'),
    ('CA-2026-006', 'LOTO procedure not followed during pump maintenance — near miss', 'Critical', 'James Okonkwo', '2026-02-22', 'Open'),
    ('CA-2026-007', 'Noise survey needed for new compressor room — exceeded 85 dB', 'Major', 'Lisa Patel', '2026-03-10', 'In Progress'),
    ('CA-2026-008', 'Slip hazard — drainage grate missing cover near loading dock', 'Critical', 'Marcus Rivera', '2026-02-21', 'In Progress')
ON CONFLICT (action_id) DO NOTHING;

-- 7. SEED DATA — Certifications
INSERT INTO certifications (employee_name, cert_type, expiry_date) VALUES
    ('Marcus Rivera', 'Forklift Operator License', '2026-03-05'),
    ('James Okonkwo', 'Confined Space Entry', '2026-03-10'),
    ('Tyler Brooks', 'First Aid / CPR', '2026-03-15'),
    ('Sarah Chen', 'HAZWOPER 40-Hour', '2026-04-02'),
    ('Maria Garcia', 'Fall Protection Competent Person', '2026-04-10'),
    ('Lisa Patel', 'OSHA 30-Hour General Industry', '2026-04-18'),
    ('David Kowalski', 'Electrical Safety (NFPA 70E)', '2026-05-01'),
    ('Aisha Mohammed', 'Crane & Rigging Operator', '2026-05-10'),
    ('Brian Nguyen', 'Scaffold Competent Person', '2026-05-15'),
    ('Katie Johnson', 'Certified Safety Professional (CSP)', '2026-05-20');

-- 8. SEED DATA — Module Progress (sample records)
INSERT INTO module_progress (employee_name, department, module_slug, module_name, completed, quiz_score, attempts, last_activity, completed_at) VALUES
    ('Marcus Rivera', 'Operations', 'intro-to-osha', 'Introduction to OSHA', true, 3, 1, '2026-02-01', '2026-02-01'),
    ('Marcus Rivera', 'Operations', 'hazard-recognition', 'Hazard Recognition', true, 3, 1, '2026-02-03', '2026-02-03'),
    ('Marcus Rivera', 'Operations', 'safety-reporting', 'Safety Reporting', true, 2, 2, '2026-02-05', '2026-02-05'),
    ('Marcus Rivera', 'Operations', 'emergency-action-plans', 'Emergency Action Plans', true, 3, 1, '2026-02-06', '2026-02-06'),
    ('Marcus Rivera', 'Operations', 'first-aid', 'First Aid & AED', true, 3, 1, '2026-02-07', '2026-02-07'),
    ('Marcus Rivera', 'Operations', 'walking-working-surfaces', 'Walking-Working Surfaces', true, 2, 1, '2026-02-08', '2026-02-08'),
    ('Marcus Rivera', 'Operations', 'fire-safety', 'Fire Safety & Prevention', true, 3, 1, '2026-02-09', '2026-02-09'),
    ('Marcus Rivera', 'Operations', 'driving-safety', 'Driving Safety', true, 3, 1, '2026-02-09', '2026-02-09'),
    ('Marcus Rivera', 'Operations', 'ppe', 'Personal Protective Equipment', true, 2, 2, '2026-02-10', '2026-02-10'),
    ('Marcus Rivera', 'Operations', 'electrical-safety', 'Electrical Safety & Arc Flash', true, 3, 1, '2026-02-11', '2026-02-11'),
    ('Marcus Rivera', 'Operations', 'loto', 'Lockout/Tagout (LOTO)', true, 3, 1, '2026-02-12', '2026-02-12'),
    ('Marcus Rivera', 'Operations', 'hazcom', 'Hazard Communication (HazCom)', true, 2, 1, '2026-02-13', '2026-02-13'),
    ('Marcus Rivera', 'Operations', 'heat-stress', 'Heat Stress', true, 3, 1, '2026-02-14', '2026-02-14'),
    ('Marcus Rivera', 'Operations', 'cold-stress', 'Cold Stress', true, 3, 1, '2026-02-14', '2026-02-14'),
    ('Marcus Rivera', 'Operations', 'hearing-conservation', 'Hearing Conservation', true, 3, 1, '2026-02-15', '2026-02-15'),
    ('Marcus Rivera', 'Operations', 'ergonomics', 'Ergonomics', true, 2, 1, '2026-02-16', '2026-02-16'),
    ('Marcus Rivera', 'Operations', 'bloodborne-pathogens', 'Bloodborne Pathogens', true, 3, 1, '2026-02-17', '2026-02-17'),
    ('Marcus Rivera', 'Operations', 'infectious-disease', 'Infectious Disease', true, 3, 1, '2026-02-17', '2026-02-17'),
    ('Sarah Chen', 'Warehouse', 'intro-to-osha', 'Introduction to OSHA', true, 3, 1, '2026-01-15', '2026-01-15'),
    ('Sarah Chen', 'Warehouse', 'hazard-recognition', 'Hazard Recognition', true, 3, 1, '2026-01-17', '2026-01-17'),
    ('Sarah Chen', 'Warehouse', 'safety-reporting', 'Safety Reporting', true, 3, 1, '2026-01-19', '2026-01-19'),
    ('Sarah Chen', 'Warehouse', 'emergency-action-plans', 'Emergency Action Plans', true, 3, 1, '2026-01-20', '2026-01-20'),
    ('Sarah Chen', 'Warehouse', 'first-aid', 'First Aid & AED', true, 3, 1, '2026-01-21', '2026-01-21'),
    ('Sarah Chen', 'Warehouse', 'walking-working-surfaces', 'Walking-Working Surfaces', true, 3, 1, '2026-01-22', '2026-01-22'),
    ('Sarah Chen', 'Warehouse', 'fire-safety', 'Fire Safety & Prevention', true, 3, 1, '2026-01-23', '2026-01-23'),
    ('Sarah Chen', 'Warehouse', 'driving-safety', 'Driving Safety', true, 3, 1, '2026-01-24', '2026-01-24'),
    ('Sarah Chen', 'Warehouse', 'ppe', 'Personal Protective Equipment', true, 3, 1, '2026-01-25', '2026-01-25'),
    ('Sarah Chen', 'Warehouse', 'electrical-safety', 'Electrical Safety & Arc Flash', true, 3, 1, '2026-01-26', '2026-01-26'),
    ('Sarah Chen', 'Warehouse', 'loto', 'Lockout/Tagout (LOTO)', true, 3, 1, '2026-01-27', '2026-01-27'),
    ('Sarah Chen', 'Warehouse', 'hazcom', 'Hazard Communication (HazCom)', true, 3, 1, '2026-01-28', '2026-01-28'),
    ('Sarah Chen', 'Warehouse', 'heat-stress', 'Heat Stress', true, 3, 1, '2026-01-29', '2026-01-29'),
    ('Sarah Chen', 'Warehouse', 'cold-stress', 'Cold Stress', true, 3, 1, '2026-01-30', '2026-01-30'),
    ('Sarah Chen', 'Warehouse', 'hearing-conservation', 'Hearing Conservation', true, 3, 1, '2026-01-31', '2026-01-31'),
    ('Sarah Chen', 'Warehouse', 'ergonomics', 'Ergonomics', true, 3, 1, '2026-02-01', '2026-02-01'),
    ('Sarah Chen', 'Warehouse', 'bloodborne-pathogens', 'Bloodborne Pathogens', true, 3, 1, '2026-02-02', '2026-02-02'),
    ('Sarah Chen', 'Warehouse', 'infectious-disease', 'Infectious Disease', true, 3, 1, '2026-02-03', '2026-02-03'),
    ('Sarah Chen', 'Warehouse', 'lone-worker-safety', 'Lone Worker Safety', true, 3, 1, '2026-02-05', '2026-02-05'),
    ('Sarah Chen', 'Warehouse', 'workplace-violence-prevention', 'Workplace Violence Prevention', true, 3, 1, '2026-02-14', '2026-02-14'),
    ('James Okonkwo', 'Maintenance', 'intro-to-osha', 'Introduction to OSHA', true, 3, 1, '2026-01-20', '2026-01-20'),
    ('James Okonkwo', 'Maintenance', 'hazard-recognition', 'Hazard Recognition', true, 2, 2, '2026-01-22', '2026-01-22'),
    ('James Okonkwo', 'Maintenance', 'safety-reporting', 'Safety Reporting', true, 3, 1, '2026-01-25', '2026-01-25'),
    ('James Okonkwo', 'Maintenance', 'emergency-action-plans', 'Emergency Action Plans', true, 3, 1, '2026-01-28', '2026-01-28'),
    ('James Okonkwo', 'Maintenance', 'first-aid', 'First Aid & AED', true, 3, 1, '2026-01-30', '2026-01-30'),
    ('James Okonkwo', 'Maintenance', 'walking-working-surfaces', 'Walking-Working Surfaces', true, 2, 1, '2026-02-01', '2026-02-01'),
    ('James Okonkwo', 'Maintenance', 'fire-safety', 'Fire Safety & Prevention', true, 3, 1, '2026-02-03', '2026-02-03'),
    ('James Okonkwo', 'Maintenance', 'driving-safety', 'Driving Safety', true, 3, 1, '2026-02-05', '2026-02-05'),
    ('James Okonkwo', 'Maintenance', 'ppe', 'Personal Protective Equipment', true, 3, 1, '2026-02-07', '2026-02-07'),
    ('James Okonkwo', 'Maintenance', 'electrical-safety', 'Electrical Safety & Arc Flash', true, 3, 1, '2026-02-08', '2026-02-08'),
    ('James Okonkwo', 'Maintenance', 'loto', 'Lockout/Tagout (LOTO)', true, 2, 2, '2026-02-09', '2026-02-09'),
    ('James Okonkwo', 'Maintenance', 'hazcom', 'Hazard Communication (HazCom)', true, 3, 1, '2026-02-10', '2026-02-10')
ON CONFLICT (employee_name, module_slug) DO NOTHING;

-- Done! After running this SQL, your admin dashboard will have live data to pull from.
