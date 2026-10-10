# KUVENTORY™ Documentation Library

**Commercial Restaurant & Kiosk Inventory Management System**  
**Version:** 2.4.0 (Production Release)  
**Production URL:** [https://kuventory.netlify.app](https://kuventory.netlify.app)  

---

## Master Consolidated Documentation

To eliminate fragmentation, redundant drafts, and scattered documentation, the entire KUVENTORY knowledge base has been consolidated into **5 authoritative, clearly labeled master manuals**:

```
docs/
├── 01_USER_OPERATIONS_MANUAL.md
├── 02_MASTER_ADMIN_AND_SECURITY_GOVERNANCE.md
├── 03_SYSTEM_ARCHITECTURE_AND_TECHNICAL_SPEC.md
├── 04_DEPLOYMENT_OPERATIONS_AND_DISASTER_RECOVERY.md
├── 05_QA_TESTING_AUDIT_AND_RELEASE_REPORT.md
├── SOFTWARE_DESIGN_PROJECT_DOCUMENTATION.md
└── archive_legacy/
```

---

### Navigation Index

| Document File | Purpose & Contents | Primary Audience |
| :--- | :--- | :--- |
| **[`01_USER_OPERATIONS_MANUAL.md`](./01_USER_OPERATIONS_MANUAL.md)** | Daily inventory shift routines, Beginning/Add/AM/PM calculations, FEFO batch receipts, real-time pop-up notifications, fast session lease keepalive teardown, reports & exports, and mobile touch guidelines. *(Companion Word document: [`KUVENTORY_USER_GUIDE.docx`](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/KUVENTORY_USER_GUIDE.docx))* | Floor Staff (`USER`) & Store Managers (`ADMIN`) |
| **[`02_MASTER_ADMIN_AND_SECURITY_GOVERNANCE.md`](./02_MASTER_ADMIN_AND_SECURITY_GOVERNANCE.md)** | Master Admin Tier 0 absolute authority architecture, login credentials table, hotline dispatch (`09917101298`), zero-trust 403 access denial shield for Admins, live telemetry stream pre-fetch on mount, monthly automated save-state checkpointing, point-in-time restore, stock drift auto-healer, and emergency maintenance lock. | Master Administrator (`MASTER_ADMIN`) |
| **[`03_SYSTEM_ARCHITECTURE_AND_TECHNICAL_SPEC.md`](./03_SYSTEM_ARCHITECTURE_AND_TECHNICAL_SPEC.md)** | Full-stack software architecture (React 19 + Vite + TypeScript + Supabase PostgreSQL 17 + Netlify), 11-table database schema, floating notification pop-up engine, keepalive session lease beacon, atomic stored procedures, zero dead code guarantee, UI/UX tokens, and responsive viewports. | Software Engineers & System Architects |
| **[`04_DEPLOYMENT_OPERATIONS_AND_DISASTER_RECOVERY.md`](./04_DEPLOYMENT_OPERATIONS_AND_DISASTER_RECOVERY.md)** | Local installation guide, NPM scripts, environment variables (`.env.local`), Netlify CI/CD build configuration, monthly save-state recovery continuity plan (365-day immutable lock), database backup vs. storage asset separation, and contingency failover playbooks. | DevOps & System Administrators |
| **[`05_QA_TESTING_AUDIT_AND_RELEASE_REPORT.md`](./05_QA_TESTING_AUDIT_AND_RELEASE_REPORT.md)** | Comprehensive quality assurance report covering 95 / 95 passed Playwright real-browser scenarios across all 5 browser/device engines and 10 viewports, multi-device responsive audit, and PRIDE versioning deliverables. | QA Leads, Auditors & Product Owners |
| **[`SOFTWARE_DESIGN_PROJECT_DOCUMENTATION.md`](./SOFTWARE_DESIGN_PROJECT_DOCUMENTATION.md)** | Exhaustive, academic software design project document covering design rationale, research methodology, functional specifications, and architectural diagrams. | Academic Reviewers & Project Stakeholders |

---

> [!NOTE]
> Historical drafts, temporary phase reports, and development notes prior to v2.4.0 have been consolidated and archived under [`archive_legacy/`](./archive_legacy/) to preserve historical lineage while ensuring the active documentation remains clean, modern, and unambiguous.
