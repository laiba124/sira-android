SIRA GAL Bulk User Importer

1. Rotate the secret key that appeared in the screenshot.
2. Extract this ZIP into the VS Code project root.
3. Rename .env.sira-import.example to .env.sira-import.
4. Paste the NEW secret key into .env.sira-import.
5. Keep .env.sira-import out of Git.

PowerShell commands:

Add-Content .gitignore "`n.env.sira-import`nSIRA_GAL_Consolidated_User_Profiles_Password_At123.csv`nsira-import-report-*.csv"
npm install @supabase/supabase-js dotenv csv-parse csv-stringify

Validate only:
node .\import-sira-gal-users.cjs --dry-run

Test five records:
node .\import-sira-gal-users.cjs --limit=5

Full import:
node .\import-sira-gal-users.cjs

The importer:
- Creates confirmed Supabase Auth users.
- Uses each Auth UUID in public.sira_user_profiles.
- Skips users whose Auth account and profile already exist.
- Creates a missing profile for an existing Auth account.
- Rolls back a newly created Auth user if profile creation fails.
- Writes a Created / Skipped / Failed report CSV.
- Never prints passwords to the console.
