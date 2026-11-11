SIRA - STAGE / SUB-STAGE + DASHBOARD UPDATE (2026-08-11)
========================================================

Implemented
-----------
1. Franchise module removed from the mobile UI and project source.
2. Supabase cleanup migration drops public.sira_franchises and its dependent policies/indexes.
3. Every incident now has:
   - Stage
   - Sub-stage
   - Action Plan (when Action Plan / Formulation is selected)
4. New incidents start automatically at:
   Threat / Reported
5. Workflow values:
   Threat
     - Reported
     - Assessment
     - Avoidance Validation
   Action Plan
     - Formulation
     - Implementation
6. Action Plan / Formulation dropdown values:
   - Increase route patrolling frequency
   - Deploy night patrolling teams
   - Position static guards at vulnerable sites
   - Execute temporary fiber cable re-routing
   - Shift underground fiber cable to aerial
7. New Dashboard tab shows incident counts by Stage and Sub-stage in a grid layout.
8. Incident Detail now shows the current Stage / Sub-stage and lets the incident owner update it.
9. Every Stage/Sub-stage update is written to an immutable Supabase history table with:
   - application username
   - database timestamp
   - stage
   - sub-stage
   - action plan (when applicable)
10. Incident list cards now show their current Stage / Sub-stage.

IMPORTANT - APPLY DATABASE SQL FIRST
------------------------------------
In Supabase Dashboard -> SQL Editor, run the complete contents of:

supabase/APPLY_20260811_STAGE_DASHBOARD.sql

This script:
- removes public.sira_franchises
- adds stage, sub_stage and action_plan to public.sira_incidents
- initializes existing incidents as Threat / Reported
- creates public.sira_incident_stage_history
- creates the automatic audit-history trigger
- enables authenticated read access to stage history

Then update / overwrite the local SIRA project with this package.
No new npm package is required.

Start Expo with:

npx expo start --clear

Quick test
----------
1. Login and open Dashboard. Existing incidents should appear under Threat / Reported.
2. Open an incident that belongs to the logged-in user.
3. Tap "Update Stage / Sub-stage".
4. Change Threat / Reported -> Threat / Assessment and save.
5. Confirm Activity shows the username + timestamp for the update.
6. Move to Action Plan / Formulation and choose one of the five Action Plan dropdown values.
7. Open Dashboard again and confirm the counts move to the new Stage / Sub-stage.
8. Confirm Franchise is no longer present in the tab bar or navigation menu.

Validation performed on this package
------------------------------------
- Scanned the complete source tree for Franchise references after removal.
- Active Franchise source/data/scripts were removed; only the intentional DB cleanup DROP remains.
- TypeScript/TSX source files were syntax-parsed successfully with zero syntax diagnostics.
- The uploaded code dump did not include node_modules, so a full Expo dependency-aware compile must be run on the local development machine.
