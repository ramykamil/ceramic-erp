# Database & System Administration Guide

This document is a critical reference guide for any developer or AI assistant working on the Ceramic ERP system. It outlines the database structure, cached components, environment variables, and the correct procedures to perform administrative updates (like wiping data) safely.

---

## 1. Database Configuration (Supabase PostgreSQL)

- **Connection**: The backend connects to the online PostgreSQL database hosted on Supabase.
- **Environment File**: Always load secrets from `backend/.env`.
- **Database URL Variable**: `DATABASE_URL`
- **Replication / Foreign Keys**: During bulk updates, truncates, or migrations, triggers and constraints should be managed by setting:
  ```sql
  SET session_replication_role = 'replica';
  -- Perform bulk operation
  SET session_replication_role = 'origin';
  ```

---

## 2. The Materialized View Cache (`mv_Catalogue`)

- **Table Cache**: The catalogue product list screen queries from a PostgreSQL Materialized View called `mv_Catalogue` to optimize search performance and avoid massive group-by calculations.
- **The Gotcha**: Wiping or modifying the `products` table directly in PostgreSQL will **not** show up on the UI catalog until the materialized view is refreshed.
- **Refresh Command**:
  ```sql
  REFRESH MATERIALIZED VIEW mv_Catalogue;
  ```
- **Important**: Any database script that inserts, updates, or truncates products must run the refresh command at the end of the script, otherwise the UI will display outdated cached data.

---

## 3. Database Wiping / Truncation Rules

If you need to wipe transactional data or restart the app fresh:
- **Do not run truncates in a single global transaction block (BEGIN...COMMIT)** if you have optional tables or might encounter database-specific exceptions. A single table query failure will abort the entire transaction block and silently rollback all truncates.
- **Execute table truncations individually** outside of a transaction block or use savepoints.
- **Cascading Truncates Warning**: Truncating the `employees` table with `CASCADE` will automatically empty the `users` table because `users.employeeid` references `employees.employeeid`. If `users` is wiped:
  - Re-insert default users (especially **`Ramy`** with role `ADMIN`) using their original password hash.
  - Set `employeeid` to `null` to bypass FK requirements.
  - Reset the primary key sequence:
    ```sql
    SELECT setval('users_userid_seq', (SELECT MAX(userid) FROM "users"));
    ```

---

## 4. Default System Users (Original Hashes)

| UserID | Username | Role | Original Password Hash |
| :--- | :--- | :--- | :--- |
| 1 | `admin` | `ADMIN` | `$2b$10$0fHzYmPoOWcoyvqHU4qbe.DFr3jYMsiTKXcYALGqLCoZbJsyrPWqi` |
| 2 | `retail` | `SALES_RETAIL` | `$2b$10$h93mZmNKPlEP.FspWD/eoeA/dMLOFOTfbfSFB7ayiHKbP5LF4AgXK` |
| 3 | `wholesale` | `SALES_WHOLESALE` | `$2b$10$TLXwo50791p.y1dQ/TxXBufxWRPcI3dypbvxlfDlUoyE573RHx2/.` |
| 4 | `Ramy` | `ADMIN` | `$2b$10$ToRUZAgzO1GQVuJbitSpPeuR2Kw3qi.MpUhdNK08DW3hFFnoF8Rlq` |
| 5 | `Zineb` | `SALES_WHOLESALE` | `$2b$10$B1J8lYLDi7aurne.Kk84Luro5A/vX7a0luiMdepC3CpndOZc5LHjq` |
| 6 | `Détail` | `SALES_RETAIL` | `$2b$10$.SVfJPjxMDPjqQ4ypIddteCm/nhwJvo5ITAzHIqzymWXMIyz/ZFxa` |
| 7 | `seif eddine allaoua` | `ADMIN` | `$2b$10$U9cb71sk8Da9LJb.0lNwveEDFRrOYVQH9KGGQrAVl3/8pILiWQvYy` |
| 8 | `Cheima` | `SALES_WHOLESALE` | `$2b$10$GILAs5R6tamx3QDJvDVhWek31g9UYGQROgZ/Tuxn/kFULyUk/xREG` |
| 9 | `morad` | `SALES_RETAIL` | `$2b$10$7tsux/8z55D0vRPwznLdGOhh4yAHEmF//VXTY2S1Pj1rU2yvXfVYi` |
| 10 | `amine` | `SALES_RETAIL` | `$2b$10$B2yNSJoYUnGfwntnQzxavORGxrG/V2EBrXzG46LlYplhO5VEJMsIW` |
| 11 | `alla` | `SALES_RETAIL` | `$2b$10$6BiUrdP/8i94V3KbT57.UenAHXJf3gylMOdnpwVnRgo0nTV5crZSK` |
| 13 | `moumen` | `SALES_RETAIL` | `$2b$10$dDedN56UgG0Ojsu8rZEWt.Kgv7Zqj1nWyLxibwQ2zb2o41i2Z6hL.` |
| 15 | `younes` | `ADMIN` | `$2b$10$h1hOCuxwmv8y0X2Ro9v4IOZDbEDmBGAAaHmGudIFeUJPdPA4dUTEq` |

---

## 5. Core Business Logic Integrations

### Stock Management
- Inventory is calculated across multiple warehouses using the `Inventory` table.
- Every stock change must create a matching log in `InventoryTransactions`.

### Pricing Waterfall
1. **Customer Specific**: Checked first in `CustomerProductPrices`.
2. **Brand Rules**: Checked second in `CustomerFactoryRules` / global brand discounts.
3. **Base Price**: Checked last in `Products.BasePrice`.
