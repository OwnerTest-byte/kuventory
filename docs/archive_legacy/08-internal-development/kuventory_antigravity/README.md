# KUVENTORY — Antigravity Development Package

This package is the controlled development operating system for KUVENTORY.

## Purpose

KUVENTORY is a focused web-based inventory and stock-recording system built around the real Kiosk and Bodega daily inventory workflow.

The system must remain small, fast, secure, maintainable, and usable on older devices.

## Approved product scope

- Authentication
- Inventory
- Categories
- Daily Inventory
- Stock Batches
- FEFO
- Stock History
- Notifications
- Reports
- Archive
- PDF/XLSX/CSV exports

Explicitly out of scope:

- Sales
- POS
- Purchases
- Customers
- Expenses
- Accounting
- Revenue
- Profit
- Orders

## Recommended stack

- React + TypeScript + Vite
- Tailwind CSS + shadcn/ui
- TanStack Query v5
- React Hook Form + Zod
- Supabase + PostgreSQL
- Supabase Auth
- PostgreSQL RLS
- Supabase Functions/RPC and server-side scheduling where appropriate
- Supabase Realtime where justified
- Vitest + React Testing Library
- Playwright
- Supabase CLI + Docker for local development
- Git + GitHub

## How to use this package

1. Put `.antigravity/` and `AGENTS.md` in the KUVENTORY repository.
2. Read `prompts/00-bootstrap.md` before coding.
3. Execute phases in numerical order.
4. Never skip the quality gates unless explicitly documented.
5. Every completed phase must produce a phase report and update relevant documentation.
6. Every release must produce release notes, patch notes, and a version report.

## Core engineering rule

Build the smallest complete system that satisfies the approved requirements. Do not add speculative features, dependencies, abstractions, or code.
