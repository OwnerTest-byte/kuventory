# KUVENTORY — Canonical Technical Documentation Suite

```
Directory:              docs/
Audience:               Technical Examiners, Software Architects, Operations Engineers, Developers
Purpose:                Canonical entry point, directory sitemap, and question-routing map for KUVENTORY.
Verification Status:    Verified against repository HEAD 135f10b
Audit Date:             2026-10-19
Authoritative HEAD SHA: 135f10b807fedec368383c9e34895566da3d69fc
```

---

## 1. Documentation Index & Sitemap

Welcome to the definitive engineering and operational documentation set for **KUVENTORY**. This directory contains the complete, source-verified documentation suite replacing all legacy, duplicate, and contradictory manuals.

| Document Name | Primary Subject & Content | Target Audience |
| :--- | :--- | :--- |
| [00_PROJECT_OVERVIEW_AND_HISTORY.md](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/00_PROJECT_OVERVIEW_AND_HISTORY.md) | Business purpose, operational context at Kape Uno Bistro, user personas, verified goals, milestones, and full 105-commit development timeline from 2026-09-02 to 2026-10-19. | All / Examiners |
| [01_REQUIREMENTS_AND_ACCEPTANCE.md](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/01_REQUIREMENTS_AND_ACCEPTANCE.md) | 13 Functional Requirements, 10 Non-Functional Requirements, business rules, acceptance criteria, and complete requirement-to-code traceability matrix. | QA / Architects |
| [02_SYSTEM_ARCHITECTURE.md](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/02_SYSTEM_ARCHITECTURE.md) | C4 architectural model (Context, Container, Component), edge topology, trust boundaries, network protocols, and architectural decisions. | Architects / DevOps |
| [03_TECH_STACK_AND_RATIONALE.md](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/03_TECH_STACK_AND_RATIONALE.md) | Verified technology stack with declared ranges and lockfile-resolved versions, technical purpose, selection rationale, and execution environments. | Evaluators / Devs |
| [04_FEATURES_AND_MODULE_CATALOG.md](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/04_FEATURES_AND_MODULE_CATALOG.md) | Complete catalog of all routes, user-visible screens, sub-modules, operations, data sources, permission gates, and verification statuses. | Devs / Evaluators |
| [05_DATABASE_AND_DATA_DICTIONARY.md](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/05_DATABASE_AND_DATA_DICTIONARY.md) | 18 public tables, column types, generated columns, constraints, foreign keys, triggers, stored procedures (RPCs), RLS policies, and 53 migrations in chronological order. | DBAs / Backend |
| [06_API_RPC_AND_INTEGRATION_REFERENCE.md](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/06_API_RPC_AND_INTEGRATION_REFERENCE.md) | PostgREST endpoints, PL/pgSQL RPC signatures (`consume_stock`, `finalize`, `renew_session_lease`), Realtime WebSocket topics, and auxiliary Express routes. | Backend / Integrators |
| [07_AUTH_SECURITY_AND_ROLES.md](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/07_AUTH_SECURITY_AND_ROLES.md) | Authentication lifecycle, Single-Session Lease Engine (30s heartbeat), RBAC hierarchy, Row Level Security policies, SECURITY DEFINER audit, and maintenance lockdown. | Security Officers |
| [08_INVENTORY_DAILY_WORKSHEETS_AND_FEFO.md](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/08_INVENTORY_DAILY_WORKSHEETS_AND_FEFO.md) | Mathematical balancing formulas, First-Expired First-Out (FEFO) algorithm, row-level locking concurrency controls (`FOR UPDATE`), and audited sheet revisions. | Operations / Devs |
| [09_REPORTS_CHARTS_AND_EXPORTS.md](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/09_REPORTS_CHARTS_AND_EXPORTS.md) | Detailed inventory of all 3 Recharts visualizations (Donut, Bar, Area), data pipelines, immutable report snapshots, and client-side export compilers (PDF, XLSX, CSV). | Frontend / QA |
| [10_AUTOMATION_SCHEDULERS_AND_REALTIME.md](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/10_AUTOMATION_SCHEDULERS_AND_REALTIME.md) | Clear architectural separation of pg_cron vs Database Triggers vs GitHub Actions vs node-cron vs Browser Timers vs Realtime WebSockets. | DevOps / Evaluators |
| [11_SUPER_ADMIN_OPERATIONS_MANUAL.md](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/11_SUPER_ADMIN_OPERATIONS_MANUAL.md) | Runbook for all 10 Control Center tabs: Overview, Audit Logs, Security, Incidents, Settings, Storage, Database Health, Telemetry, Recovery, and Deployments. | System Admins / Owner |
| [12_USER_AND_ADMIN_OPERATIONS_MANUAL.md](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/12_USER_AND_ADMIN_OPERATIONS_MANUAL.md) | Daily shift routines, step-by-step instructions for baristas and managers, screen labels, error handling, autosave, and shift finalization. | Baristas / Managers |
| [13_TESTING_QA_AND_BUG_FIX_HISTORY.md](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/13_TESTING_QA_AND_BUG_FIX_HISTORY.md) | Automated Vitest results (107/107 passing), typechecking, linting, test directory map, and historical bug-fix ledger (BUG-01 to BUG-10) with root cause analyses. | QA Leads / Examiners |
| [14_DEPLOYMENT_ENVIRONMENT_AND_RUNBOOKS.md](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/14_DEPLOYMENT_ENVIRONMENT_AND_RUNBOOKS.md) | Local developer setup, environment variable declarations (names only), Netlify edge config, Supabase migration deployment, and disaster recovery tiers. | DevOps / Admins |
| [15_KNOWN_ISSUES_RISKS_AND_ROADMAP.md](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/15_KNOWN_ISSUES_RISKS_AND_ROADMAP.md) | Transparent register of active limitations, disabled browser restore mode, node-cron hosting boundaries, technical debt, and 3-phase engineering roadmap. | Architects / Owner |
| [16_PROJECT_DEFENSE_MASTER_QA.md](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/16_PROJECT_DEFENSE_MASTER_QA.md) | Over 100 oral defense questions organized into 10 categories, each providing quick 1-3 sentence answers, expanded 30-90s explanations, code proof, and follow-ups. | Project Owner / Viva |
| [17_QUICK_DEFENSE_CHEAT_SHEET.md](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/17_QUICK_DEFENSE_CHEAT_SHEET.md) | One-page rapid reference card: 30-second elevator pitch, 1-line definitions, essential shift formulas, chart cheat sheet, and honest boundary reminders. | Presenter / Quick Ref |
| [18_GLOSSARY_AND_ABBREVIATIONS.md](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/18_GLOSSARY_AND_ABBREVIATIONS.md) | Standard definitions for FEFO, FIFO, RLS, RPC, ACID, CDC, WAL, SPA, PWA, JWT, Optimistic Concurrency, Pessimistic Locking, and related industry terms. | All |
| [19_EVIDENCE_AND_CLAIM_REGISTER.md](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/19_EVIDENCE_AND_CLAIM_REGISTER.md) | Master traceability matrix classifying every major system claim under concrete status labels (`[VERIFIED-SOURCE]`, `[VERIFIED-TEST]`, `[KNOWN-ISSUE]`, etc.). | External Auditors |
| [20_ARCHITECTURE_DECISIONS.md](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/20_ARCHITECTURE_DECISIONS.md) | Formal Architecture Decision Records (ADR-01 through ADR-08) covering React 19, Supabase BaaS, FEFO locking, non-negative stock, and timezone pinning. | Architects |
| [GENERATING_DOCUMENTS.md](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/GENERATING_DOCUMENTS.md) | Compilation guide for building publication-ready Microsoft Word (`DEV_LOGS.docx`) and PDF handover deliverables directly from Markdown sources. | Technical Writers |

---

## 2. Standalone Architectural Diagrams (`docs/diagrams/`)

KUVENTORY includes 10 standalone, renderer-compatible Mermaid `.mmd` diagram files located in [docs/diagrams/](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/diagrams/):
1. `system_context.mmd`: High-level system context diagram showing external actors, edge hosting, cloud services, and automation.
2. `system_architecture_container.mmd`: C4 container topology detailing client browser, Netlify CDN, Kong gateway, PostgREST, and PostgreSQL.
3. `auth_and_session_routing.mmd`: Complete decision tree for authentication, single-session lease verification, and route guards.
4. `inventory_fefo_consumption.mmd`: Algorithmic flowchart of the `consume_stock` stored procedure, batch ordering, and row locks.
5. `daily_inventory_workflow.mmd`: End-to-end operational shift lifecycle from business date selection to autosave, finalization, and correction.
6. `realtime_sync_dataflow.mmd`: Dataflow diagram illustrating how WAL mutations propagate through Supabase Realtime to update client query caches.
7. `automation_mechanisms_architecture.mmd`: Comprehensive automation diagram showing pg_cron, triggers, GitHub Actions, browser timers, and scripts.
8. `super_admin_operations_flow.mmd`: Super Admin operations console action lifecycle with preview, confirmation, and audit logging.
9. `database_er_diagram.mmd`: Complete Entity-Relationship diagram across all 18 tables with primary keys, foreign keys, and relationships.
10. `disaster_recovery_runbook.mmd`: 4-tier incident escalation and disaster recovery flowchart.
