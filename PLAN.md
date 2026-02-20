# Incident Reporting Expansion — Implementation Plan

## Overview

Expand the existing incident-report tool from a single 9-step wizard into a **unified Incident File** system. When a supervisor submits the core incident report, it generates an **Incident ID** and unlocks 5 additional form tabs — all pre-filled with shared data from the original report via Supabase.

Additionally, add an **Approved Occupational Clinic Finder** and a **Workers' Comp Quick-Start** section so supervisors know where to send employees and what WC paperwork to initiate.

---

## What Changes

### Current State
- **Tab bar**: New Report | Past Reports | OSHA Downloads
- **Wizard**: 9 steps → submits to `incidents` table → gets `case_number`
- **Settings page**: Company info only (name, address, NAICS, phone, employees, hours)

### Proposed State
- **Tab bar**: New Report | Past Reports | Incident File | OSHA Downloads
- **Incident File tab**: Appears after an incident is submitted (or selected from Past Reports). Contains 6 sub-tabs, all linked by Incident ID:

| Sub-tab | Combined Forms | Who Fills It | When |
|---------|---------------|-------------|------|
| **Summary** | Incident snapshot + status tracker + occupational clinic finder | Auto-generated | On submit |
| **Medical** | Medical Referral/Auth + Refusal of Treatment (mutually exclusive) + Approved Clinic Lookup + WC Quick-Start checklist | Supervisor | Immediate |
| **Statements** | Employee's Own Account + Witness Statements (expanded from current Step 6) | Employee / Witnesses | Day of incident |
| **Investigation** | Supervisor Investigation + Root Cause Analysis + Close-Out Report (from doc) + Corrective Action Tracker | Supervisor / Safety team | 1-14 days |
| **Return to Work** | Fit for Duty Certification + Modified/Light Duty Assignment | Physician fills / Supervisor records | Before return |
| **Documents** | PDF download hub for all generated forms for this incident | Auto-generated | Anytime |

---

## Form Consolidation Strategy (Reducing Friction)

### Forms That Get Combined

1. **Medical Referral + Refusal of Treatment** → One "Medical" sub-tab
   - Radio toggle: "Employee accepted medical referral" vs "Employee refused medical treatment"
   - If accepted → show referral fields (clinic name pulled from approved list, authorization, WC claim info)
   - If refused → show refusal acknowledgment with signature-capture and witness field
   - Both share: employee name, DOB, date of injury, description, body part (all auto-filled from incident)

2. **Supervisor Investigation + Root Cause Analysis + Close-Out Report** → One "Investigation" sub-tab
   - Current Step 8 (root cause checkboxes) already captures contributing factors
   - ADD: the Who/What/When/Where/Why structure from the Close-Out doc
   - ADD: Corrective action tracker with owner + due date + status
   - ADD: Close-out approval section (Safety Manager + Supervisor sign-off)
   - All incident core data auto-filled

3. **Fit for Duty + Modified Duty Assignment** → One "Return to Work" sub-tab
   - Toggle: "Full duty" vs "Modified/Light duty" vs "Not yet cleared"
   - If modified → show restrictions, duty description, duration, next follow-up
   - Physician info and restriction fields in one flow
   - Auto-fills employee name, injury info, date of injury

4. **Employee Statement + Witness Statements** → One "Statements" sub-tab
   - Employee's own narrative section at top
   - Witness statement cards below (expand from current 2 to up to 4)
   - Each witness block gets a full statement text area (not just name/contact)
   - All linked to same Incident ID

### What Does NOT Get Combined (Kept Separate for Legal Reasons)
- OSHA 301/300/300A → Already built, stay in OSHA Downloads tab
- Workers' Comp FROI → State-specific, too variable to template. Instead: WC Quick-Start checklist guides the supervisor through what to do.

---

## Incident ID System

### Format
`[YEAR]-[4-DIGIT SEQUENTIAL]` → e.g., `2026-0001`

### Implementation
- The `case_number` column already exists in Supabase (auto-incrementing integer)
- We'll format it as a display ID: `YYYY-NNNN` using the incident year + zero-padded case_number
- This display ID appears on every sub-tab header and every generated PDF
- All sub-tab data saves to new Supabase tables linked by `incident_id` (the row's primary key from `incidents` table)

---

## Approved Occupational Clinic Finder

### Where It Lives
- Inside the **Medical** sub-tab of the Incident File
- Also accessible from the **Summary** sub-tab as a quick-link card

### How It Works
- New Supabase table: `approved_clinics`
  - Columns: `id`, `name`, `address`, `city`, `state`, `zip`, `phone`, `hours`, `services` (array), `notes`, `is_primary`, `created_at`
- Admin can add/edit clinics from the existing admin-dashboard (add a new "Clinics" section)
- Settings page gets a new "Approved Clinics" card for adding clinics
- In the Medical sub-tab: displays the clinic list as cards with address, phone, hours
  - Primary clinic highlighted at top
  - Click-to-call phone numbers (mobile friendly)
  - "Directions" link (opens Google Maps)

---

## Workers' Comp Quick-Start

### Where It Lives
- Inside the **Medical** sub-tab, below the referral/refusal form

### What It Contains
A guided checklist WITH intake fields (lightweight FROI substitute):

**Checklist (interactive, saves state):**
1. ☐ Notify HR immediately
2. ☐ Provide employee with WC claim forms
3. ☐ Route to approved Occupational Clinic (link to clinic finder above)
4. ☐ Document medical facility and treatment provided
5. ☐ Submit all WC paperwork within 24 hours
6. ☐ HR coordinates follow-up with employee and insurance

**WC Intake Fields (saves to `incident_medical`):**
- WC Claim Number (assigned by insurer — entered when received)
- Insurance Carrier Name
- Policy Number
- Date Employer Notified Insurer
- Date Employee Left Work
- Date of Disability Onset
- Notes

Each checklist item can be checked off and the state saves to Supabase. The intake fields capture the essential WC tracking data so everything lives in one place.

---

## New Supabase Tables Needed

### `incident_medical` (Medical sub-tab)
- `id`, `incident_id` (FK), `medical_decision` (accepted/refused), `clinic_name`, `clinic_address`, `clinic_phone`, `authorization_notes`, `wc_claim_number`, `wc_insurance_carrier`, `wc_policy_number`, `wc_date_insurer_notified`, `wc_date_left_work`, `wc_date_disability_onset`, `wc_notes`, `refusal_reason`, `refusal_employee_signature` (text), `refusal_witness_name`, `refusal_date`, `wc_checklist` (jsonb), `created_at`, `updated_at`

### `incident_statements` (Statements sub-tab)
- `id`, `incident_id` (FK), `statement_type` (employee/witness), `person_name`, `person_title`, `person_contact`, `statement_text`, `statement_date`, `created_at`

### `incident_investigation` (Investigation sub-tab)
- `id`, `incident_id` (FK), `who_involved`, `what_happened`, `when_details`, `where_details`, `why_root_cause`, `contributing_factors` (jsonb — from close-out doc checkboxes), `corrective_actions` (jsonb array: [{action, owner, due_date, status, completed_date}]), `closeout_safety_mgr`, `closeout_supervisor`, `closeout_date`, `status` (open/in_progress/closed), `created_at`, `updated_at`

### `incident_rtw` (Return to Work sub-tab)
- `id`, `incident_id` (FK), `clearance_status` (full/modified/not_cleared), `physician_name`, `eval_date`, `restrictions` (text), `modified_duties`, `restriction_duration`, `next_followup_date`, `supervisor_name`, `employee_acknowledged`, `created_at`, `updated_at`

### `approved_clinics`
- `id`, `name`, `address`, `city`, `state`, `zip`, `phone`, `hours`, `services` (text[]), `notes`, `is_primary` (bool), `created_at`

---

## Implementation Steps

### Step 1: Supabase Schema
- Create the 5 new tables above via SQL
- Add RLS policies matching existing `incidents` table

### Step 2: Incident File Tab (Container)
- Add "Incident File" tab to the tab bar
- Build the sub-tab navigation (Summary | Medical | Statements | Investigation | Return to Work | Documents)
- Add incident selector dropdown (pulls from Past Reports)
- Build the auto-fill system: when an incident is selected, query `incidents` table and populate shared fields across all sub-tabs

### Step 3: Summary Sub-tab
- Auto-generated incident snapshot card (who, what, when, where, severity, treatment)
- Status tracker showing which sub-tabs are complete
- Quick-link cards: "Find Approved Clinic" / "Start WC Process" / "Download OSHA 301"

### Step 4: Medical Sub-tab
- Medical Referral vs Refusal toggle
- Referral form with approved clinic picker
- Refusal form with acknowledgment fields
- WC Quick-Start checklist
- All shared fields auto-filled from incident

### Step 5: Statements Sub-tab
- Employee's own account (full narrative text area)
- Witness statement cards (up to 4)
- Each card: name, title, contact, full statement text, date
- Save each statement as a row in `incident_statements`

### Step 6: Investigation Sub-tab
- Who/What/When/Where/Why sections (from Close-Out doc)
- Contributing factors checkboxes (from Close-Out doc: Unsafe Act, Unsafe Condition, Equipment Failure, Inadequate Training, Inadequate Procedure/SOP, PPE Issue, Environmental/Weather, Communication Breakdown, Management System Deficiency, Other)
- Corrective action tracker: add rows with action, owner, due date, status
- Close-out approval section
- Root cause fields from existing Step 8 migrated/linked here

### Step 7: Return to Work Sub-tab
- Clearance status toggle (Full / Modified / Not Cleared)
- Physician info + eval date
- Restriction details + duration
- Modified duty assignment description
- Follow-up date
- Employee acknowledgment

### Step 8: Documents Sub-tab
- PDF download hub for this specific incident
- Generate PDFs: OSHA 301, Medical Referral, Refusal of Treatment, Investigation Report, RTW Clearance
- All auto-filled from Supabase data for this incident

### Step 9: Approved Clinics Management
- Add "Approved Clinics" section to the **Settings page** (add/edit/delete clinics)
- New `approved_clinics` Supabase table
- Clinic cards display in Medical sub-tab with phone, address, Google Maps link
- Primary clinic highlighted, click-to-call on mobile

### Step 10: Triage → Report Integration
- Add a "Start Incident Report" button on every decision tree outcome card
- Button passes triage data via URL params or localStorage:
  - `triage_outcome` (e.g., "out_heat_exhaustion")
  - `triage_severity` (red/amber/green)
  - `triage_treatment` (mapped from outcome: 911/ER/Clinic/First Aid)
  - `triage_injury_type` (mapped from pathway: Fall/Wound/Chemical/Heat/Cold/Other)
- Incident report wizard auto-fills:
  - Step 3: Treatment radio → mapped from triage outcome
  - Step 4: Injury type checkbox → pre-checked from triage pathway
  - Step 4: Severity dropdown → mapped from triage level

### Step 11: Workflow Integration
- After submitting a new incident report, auto-redirect to Incident File tab for that incident
- Past Reports cards become clickable → open Incident File for that case
- Success screen shows: "Continue to Incident File" as primary action
