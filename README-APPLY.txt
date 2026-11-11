SIRA MAP + INCIDENT DETAIL UPDATE
=================================

Updated files
-------------
1. src/app/(tabs)/map.tsx
2. src/app/incident/[id].tsx
3. components/LeafletMiniMap.tsx
4. lib/pakistanDistricts.ts (new)

What changed
------------
- The map summary now uses mutually exclusive groups:
  Total = Open + Progress + Closed.
- Added a searchable district selector with an All Districts option.
- Selecting a district zooms the map to its centre and shows a district-centre marker.
- District names from the Pakistan administrative gazetteer are available, and
  values already stored in sira_incidents.city are merged automatically.
- Added an incident map to the detail page with an exact incident marker.
- Added a full-screen interactive map opened by View Bigger Map.
- Incident map-marker popups can open the relevant incident detail page.
- No new npm package is required.

Apply in PowerShell
-------------------
1. Stop the Expo development server.
2. Extract this ZIP directly into the SIRA project root and overwrite the files.

Example, after placing the ZIP in Downloads:

Expand-Archive -Path "$HOME\Downloads\SIRA-map-detail-update.zip" -DestinationPath "C:\NextJS\SIRA-Mobile" -Force

Then run:

cd C:\NextJS\SIRA-Mobile
npx expo start --clear

Optional validation:

npx tsc --noEmit

Notes
-----
- Leaflet/OpenStreetMap tiles require an internet connection, as in the existing app.
- Frequently used district centres are bundled. Other gazetteer districts are
  resolved through OpenStreetMap geocoding when selected.
- The project dump did not include node_modules, so the changed source files were
  syntax-validated but a complete dependency-aware TypeScript build must be run
  inside the local project.
