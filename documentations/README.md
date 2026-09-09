# KUVENTORY Documentation Master Index

Welcome to the central technical and architectural documentation for **KUVENTORY**, a specialized commercial inventory management system engineered for high-volume food service kiosks and central bodega operations.

---

## 📁 Documentation Roadmap

### 🎨 Essential UI/UX Designer Documentation
Detailed specifications, research, user journeys, wireframes, and design guidelines:

1. [**User Personas and Research**](./ui-ux/01-user-personas-and-research.md)
   - Store Crew / Cashier, Bodega Custodian, Operations Manager, and Administrator personas, physical operating environments, and pain points.
2. [**User Flows and Sitemaps**](./ui-ux/02-user-flows-and-sitemaps.md)
   - Complete visual Mermaid diagrams for Daily Worksheet entry, FEFO batch stock intake, and dual image upload workflows.
3. [**Wireframes and Screen Blueprints**](./ui-ux/03-wireframes.md)
   - Low-fidelity structural blueprints for Mobile (<768px), Tablet, and Desktop (>=768px) views.
4. [**Clickable Prototypes and Micro-Interactions**](./ui-ux/04-clickable-prototypes-and-interactions.md)
   - Keyboard navigation shortcuts, debounced autosave states, slide-over drawers, and state transition diagrams.
5. [**Design System and Style Guide**](./ui-ux/05-design-system-and-style-guide.md)
   - Color palettes (Dark & Light mode HSL tokens), typography scale, status badge styling, and button variants.
6. [**Design Specifications (Specs)**](./ui-ux/06-design-specifications.md)
   - Breakpoint metrics, touch target ergonomics (>=40px), safe area insets, and WCAG 2.1 AA accessibility targets.

---

### 💻 Essential Developer Documentation
Technical specifications, API references, algorithms, setup guides, and deployment runbooks:

1. [**Product Requirements Document (PRD) & Tech Spec**](./developer/01-product-requirements-and-tech-spec.md)
   - System architecture, mathematical inventory formula, FEFO engine requirements, and snapshot immutability rules.
2. [**API and Database Documentation**](./developer/02-api-and-database-documentation.md)
   - Detailed schema tables, database views (`inventory_stock_view`), PL/pgSQL stored procedures (RPC), and Row Level Security (RLS) policies.
3. [**Developer README & Setup Guide**](./developer/03-readme-and-setup-guide.md)
   - Prerequisites, environment variables setup, local development commands, and Supabase CLI management.
4. [**Code Documentation & Algorithms**](./developer/04-code-documentation-and-algorithms.md)
   - Deep-dive technical documentation: FEFO consumption algorithm, client-side Canvas WebP/JPEG compression, and autosave mechanics.
5. [**Component Mapping & Design System**](./developer/05-component-mapping-and-design-system.md)
   - Component registry mapping source files directly to design system elements and domain feature packages.
6. [**Deployment and Testing Guides**](./developer/06-deployment-and-testing-guides.md)
   - QA verification pipeline (`oxlint`, `tsc`, `vite build`), Netlify production release runbook, and Supabase database push procedures.
