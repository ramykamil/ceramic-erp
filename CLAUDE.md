# Ceramic ERP System - Developer Guide

## System Architecture
A full-stack ERP for ceramic/tile inventory management, integrated with real-time stock tracking and complex pricing logic.
- **Frontend**: Next.js 14 (App Router) deployed on **Vercel**.
- **Backend**: Node.js/Express (v5) hosted on **Render**.
- **Database**: PostgreSQL (Managed/Supabase) with direct SQL migrations.
- **API Strategy**: Custom `ApiClient` (`frontend/lib/api.ts`) wrapping `fetch` with JWT auth.

## Online Catalogue & Sync Engine
The system features a high-performance Online Catalogue designed for rapid searching and massive data synchronization.

### Materialized View (`mv_Catalogue`)
- **Purpose**: A pre-computed, indexed snapshot of the product catalog used for ultra-fast searching in the POS and Catalog UI.
- **Refresh**: Automatically refreshed via `REFRESH MATERIALIZED VIEW mv_Catalogue` at the end of every successful Catalogue Sync.
- **Performance**: Bridges the gap between normalized relational tables and the need for sub-millisecond search responses.

### Catalogue Sync Workflow (`catalogueSync.controller.js`)
A two-phase process for importing/updating data from Excel files:
1.  **Phase 1: Analyze**:
    - Detects column headers (Libellé, Famille, Prix, Qté, Calibre, Choix).
    - Classifies every row as `NEW`, `CHANGED`, `UNCHANGED`, or `REMOVED`.
    - Generates a transient `syncSessionId` and a detailed analysis report for user review.
2.  **Phase 2: Execute**:
    - Processes changes in **atomic transactions** (rollback on failure).
    - Uses **PostgreSQL CTEs (Common Table Expressions)** for highly efficient bulk UPSERTs.
    - Synchronizes inventory levels and product metadata in batches of 100 to optimize throughput.
    - Deactivates (soft-delete) products missing from the Excel file while warning if they have pending orders.

## Core Tech Stack
- **Languages**: TypeScript (Frontend), JavaScript (Backend).
- **Styling**: Tailwind CSS + Lucide React.
- **Processing**: `xlsx` and `papaparse` for Excel/CSV data manipulation.
- **UI Components**: `react-virtuoso` for high-performance rendering of the catalog.

## Development & Deployment
### Required Environment Variables
| Variable | Description |
| :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string (Supabase) |
| `JWT_SECRET` | Secret key for token signing |
| `NEXT_PUBLIC_API_URL` | URL of the Render backend |
| `FRONTEND_URL` | URL of the Vercel frontend (for CORS) |

## Database Schema Highlights
- **Fiscal Data**: Comprehensive tracking of NIF, AI, NIS, RC, and RIB for both Company and Customers.
- **Sequences**: Custom document numbering: `orders_seq`, `po_seq`, `gr_seq`, `returns_seq`.
- **Integrity**: Every stock move requires an entry in `InventoryTransactions`.

## Critical Business Logic
- **Stock Tracking**: Three-tier system: `QuantityOnHand`, `QuantityReserved`, and `QuantityAvailable`.
- **Packaging Logic**: Tracks stock in `PalletCount` and `ColisCount` (Cartons) based on `QteParColis` and `QteColisParPalette`.
- **Price Waterfall**:
  1. Customer-Specific Price (`CustomerProductPrices`)
  2. Brand/Size Rule (Global brand-based discounts)
  3. Product Base Price
- **Printing**: Dual-format support (`TICKET` 80mm vs `STANDARD` A4/A5) via `react-to-print`.

## Coding Standards
- **API Interaction**: Always use the `api` instance from `frontend/lib/api.ts`.
- **Authorization**: Roles include `ADMIN`, `MANAGER`, `SALES_RETAIL`, `SALES_WHOLESALE`, `WAREHOUSE`.
- **Naming**: `snake_case` for DB columns, `camelCase` for JS variables.
