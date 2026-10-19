# KUVENTORY — Document Generation & Handover Compiling Guide

```
Document:               docs/GENERATING_DOCUMENTS.md
Audience:               Technical Writers, Project Owners, System Administrators, DevOps Engineers
Purpose:                Instructions for building printable, consolidated .docx and .pdf technical handover packages
                        directly from the authoritative Markdown documentation sources.
Verification Status:    Verified against scripts/build-dev-logs-docx.mjs and docx npm package
Audit Date:             2026-10-19
Authoritative HEAD SHA: 135f10b807fedec368383c9e34895566da3d69fc
```

---

## 1. Single Source of Truth Principle

In accordance with strict technical writing rules, **Markdown documents under `docs/` are the authoritative canonical source of truth** for the KUVENTORY project.

Word (`.docx`) and printable PDF deliverables are **derived artifacts** compiled automatically from these Markdown sources. Developers and technical writers must **never** manually edit `.docx` files separately, as doing so introduces documentation divergence and contradictions.

---

## 2. Compiling the Consolidated Technical Handover (`DEV_LOGS.docx`)

The repository includes an automated compilation script ([scripts/build-dev-logs-docx.mjs](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/scripts/build-dev-logs-docx.mjs)) built on the `docx` npm library (`^9.7.2`). It reads the canonical documentation files in sequence and produces a styled, publication-ready Microsoft Word document complete with page headers, footers, syntax-highlighted code blocks, tables, and callout banners.

### Compilation Command
```bash
# Execute the automated docx build script via npm
npm run docs:dev-logs
```

### Script Execution Flow
1. **Reads Canonical Sources:** Ingests documentation chapters in logical sequence:
   * Overview & History (`docs/00_PROJECT_OVERVIEW_AND_HISTORY.md`)
   * Requirements & Acceptance (`docs/01_REQUIREMENTS_AND_ACCEPTANCE.md`)
   * Architecture & Topology (`docs/02_SYSTEM_ARCHITECTURE.md`)
   * Tech Stack & Rationale (`docs/03_TECH_STACK_AND_RATIONALE.md`)
   * Feature Catalog (`docs/04_FEATURES_AND_MODULE_CATALOG.md`)
   * Database Schema & Data Dictionary (`docs/05_DATABASE_AND_DATA_DICTIONARY.md`)
   * APIs, RPCs & Realtime Contracts (`docs/06_API_RPC_AND_INTEGRATION_REFERENCE.md`)
   * Security & RBAC Governance (`docs/07_AUTH_SECURITY_AND_ROLES.md`)
   * Inventory & FEFO Engine (`docs/08_INVENTORY_DAILY_WORKSHEETS_AND_FEFO.md`)
   * Reports, Charts & Exports (`docs/09_REPORTS_CHARTS_AND_EXPORTS.md`)
   * Automation & Schedulers (`docs/10_AUTOMATION_SCHEDULERS_AND_REALTIME.md`)
   * Super Admin Operations Runbook (`docs/11_SUPER_ADMIN_OPERATIONS_MANUAL.md`)
   * Staff & Admin Manual (`docs/12_USER_AND_ADMIN_OPERATIONS_MANUAL.md`)
   * Testing, QA & Bug History (`docs/13_TESTING_QA_AND_BUG_FIX_HISTORY.md`)
   * Deployment & Runbooks (`docs/14_DEPLOYMENT_ENVIRONMENT_AND_RUNBOOKS.md`)
   * Known Issues & Roadmap (`docs/15_KNOWN_ISSUES_RISKS_AND_ROADMAP.md`)
   * Project Defense Master Q&A (`docs/16_PROJECT_DEFENSE_MASTER_QA.md`)
   * Quick Defense Cheat Sheet (`docs/17_QUICK_DEFENSE_CHEAT_SHEET.md`)
   * Glossary & Abbreviations (`docs/18_GLOSSARY_AND_ABBREVIATIONS.md`)
   * Evidence & Claim Register (`docs/19_EVIDENCE_AND_CLAIM_REGISTER.md`)
   * Architecture Decisions (`docs/20_ARCHITECTURE_DECISIONS.md`)
2. **Parses Markdown Syntax:** Converts headings, lists, tables, inline bold/italics, and fenced code blocks into native Word OpenXML nodes.
3. **Applies Professional Styling:** Injects bistro branding palette (Slate Dark `#1E293B`, Coffee Bronze `#8A5A36`), Consolas code shading, alternating table row backgrounds (`#F8FAFC`), and `"Page X of Y"` footers.
4. **Outputs Deliverables:** Writes `DEV_LOGS.docx` in the project root and in `documentations/DEV_LOGS.docx`.
