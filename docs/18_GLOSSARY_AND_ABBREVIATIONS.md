# KUVENTORY — Glossary & Abbreviations

```
Document:               docs/18_GLOSSARY_AND_ABBREVIATIONS.md
Audience:               Technical Examiners, Software Architects, Developers, System Administrators
Purpose:                Standard terminology definitions, industry acronyms, and operational jargon.
Verification Status:    Verified against repository engineering architecture
Audit Date:             2026-10-19
```

---

## 1. Industry Terms & Architectural Acronyms

* **ACID (Atomicity, Consistency, Isolation, Durability):** The four foundational properties of database transactions. Atomicity guarantees all-or-nothing execution; Consistency enforces data constraints; Isolation isolates concurrent operations; Durability ensures committed changes survive restarts.
* **CDC (Change Data Capture):** A design pattern where database mutations (inserts, updates, deletes) are extracted from transaction logs (WAL) and streamed to external consumers in real time.
* **CORS (Cross-Origin Resource Sharing):** An HTTP-header-based browser security mechanism allowing a server to declare which origins (domains) are permitted to access its resources.
* **CSP (Content Security Policy):** An HTTP response header enabling site operators to restrict the resources (JavaScript, CSS, Images) that the browser is allowed to load.
* **CRUD (Create, Read, Update, Delete):** The four basic persistence operations performed on database records.
* **ESM (ECMAScript Modules):** The official standard format for packaging JavaScript code for reuse, utilizing `import` and `export` statements.
* **FEFO (First-Expired, First-Out):** An inventory rotation algorithm that prioritizes the consumption and sale of goods with the earliest expiration dates, minimizing perishable spoilage.
* **FIFO (First-In, First-Out):** An inventory rotation method where goods received earliest are consumed first, regardless of actual expiration dates.
* **GoTrue:** The open-source authentication microservice utilized by Supabase to handle user signups, logins, and JWT generation.
* **HMR (Hot Module Replacement):** A developer tooling feature in Vite that exchanges, adds, or removes code modules in a running browser application without a full page reload.
* **HSTS (HTTP Strict Transport Security):** A web security header informing browsers that the site must only be accessed over encrypted HTTPS connections.
* **Idempotency:** A property of an operation wherein executing it multiple times produces the exact same outcome as executing it once (e.g., deduplicated notifications or upserts).
* **JWT (JSON Web Token):** A compact, URL-safe means of representing claims to be transferred between two parties, digitally signed by the identity provider.
* **Optimistic UI Caching:** A client-side state strategy where the user interface updates immediately upon user input before waiting for the server's network response.
* **Pessimistic Row-Level Locking (`FOR UPDATE`):** A database locking strategy where records are exclusively locked when read, forcing concurrent transactions to wait until the lock is released.
* **PITR (Point-in-Time Recovery):** A database backup mechanism allowing restoration of a database cluster to its exact state at any specific microsecond in time.
* **PostgREST:** A standalone web server that automatically turns a PostgreSQL database directly into a RESTful API.
* **PWA (Progressive Web Application):** A web application utilizing service workers and web app manifests to provide app-like loading speeds and home-screen installability.
* **RBAC (Role-Based Access Control):** An access control method restricting system operations to authorized users based on their assigned role (`USER`, `ADMIN`, `SUPER_ADMIN`).
* **RLS (Row Level Security):** A PostgreSQL security feature that restricts which rows in a table can be returned or modified by specific users based on SQL policy expressions.
* **RPC (Remote Procedure Call):** Invocation of a stored procedure located on a remote server/database over an HTTP request.
* **SECURITY DEFINER:** A PostgreSQL function attribute specifying that the function executes with the privileges of the user that owns it rather than the user that invokes it.
* **Session Lease:** A time-bound token issued to a specific client device that must be periodically refreshed via heartbeat to maintain authenticated authorization.
* **SPA (Single Page Application):** A web application that loads a single HTML page and dynamically updates content as the user interacts, without reloading full web pages.
* **WAL (Write-Ahead Log):** A core PostgreSQL append-only transaction log recording changes before they are written to data tables, ensuring durability and driving CDC streams.
