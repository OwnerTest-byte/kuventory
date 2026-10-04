# KUVENTORY ARCHITECTURE

## Overview
KUVENTORY follows a modern React (Vite) Single Page Application architecture communicating directly with a Supabase PostgreSQL backend. It strictly separates presentation logic from data persistence and privileged business logic.

## Frontend Architecture
- **Framework**: React 18 with TypeScript, bundled via Vite.
- **Routing**: React Router DOM (v6).
- **State Management**: React Query (for server state caching and optimistic updates) and React Context (for global Auth).
- **Styling**: Tailwind CSS + Custom CSS (index.css) for responsive parity with the Kuventory brand.
- **Component Design**: Atomic design principles with reusable layout containers (Header, Sidebar) and functional modules (eatures/*).

## Backend Architecture (Supabase)
- **Database**: PostgreSQL with Row Level Security (RLS) enabled on all exposed tables.
- **Authentication**: Native Supabase Auth providing JWT tokens.
- **Data Integrity**: Enforced via Foreign Keys, Check Constraints, and Atomic RPC operations.
- **Business Logic**: Stored Procedures (RPCs) handle complex inventory transactions (e.g., FEFO allocations, atomic stock balance updates).
- **Automation**: Supabase Edge Functions (scheduled via pg_cron or edge-cron) for automated daily snapshot generation.

## Data Flow
1. User authenticates via Supabase Auth (JWT stored securely).
2. Frontend makes requests to Supabase via @supabase/supabase-js client.
3. Requests are intercepted by PostgreSQL RLS policies; unauthorized requests are rejected at the DB layer.
4. Reads are processed via PostgREST.
5. Complex Writes (e.g., consuming stock from multiple batches) are routed to RPCs to ensure ACID compliance and prevent race conditions.

## Deployment Architecture
- **Frontend Hosting**: Netlify (Continuous Deployment linked to GitHub).
- **Backend Hosting**: Supabase (Database, Auth, Storage, Edge Functions).

## Critical Architectural Rules
1. **Never trust the frontend**: All roles and permissions are validated by RLS and RPCs.
2. **Immutable History**: Finalized reports and stock transactions are immutable; they cannot be altered or deleted.
3. **Archive over Delete**: Soft-deletes (rchived_at) are preferred over hard-deletes (DELETE) to maintain historical report integrity.
