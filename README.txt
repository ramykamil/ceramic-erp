DEPLOYMENT PACK v1.3.1
======================

** CRITICAL FIX FOR DB CONNECTION ERRORS **

CONTENTS:
Same components as v1.3, but with a fixed migration script.

INSTRUCTIONS:

1. Copy contents to 'ceramic-erp-platform'.
2. Run 'migrate_db.bat'. 
   - It will now look for '.env' in multiple places to ensure it finds your password.
   - If it still fails, it will tell you exactly which file it is missing.
3. Run 'start_app_safe.bat'.

CHANGELOG v1.3.1:
- FIXED: Migration script now correctly locates '.env' file in 'backend/' folder to load database password.
- ADDED: Debug logging to show which .env file is loaded.
