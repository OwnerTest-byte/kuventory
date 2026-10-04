# Disaster Recovery Plan

## Scope
This document covers the detection, response, and recovery procedures for major incidents impacting the Kuventory application.

## Incident Scenarios & Responses

### 1. Database Failure (Supabase Outage)
**Detection:** Frontend displays global connection errors or timeout errors. Supabase Status Page reports downtime.
**Response:**
- Communication: Notify management and staff that the system is down. Cashiers must revert to manual offline receipt logging temporarily.
- Recovery: Await Supabase resolution. No local rollback is necessary unless the region is permanently destroyed, in which case a new project must be spun up using the manual SQL dump backups.

### 2. Bad Migration Deployment
**Detection:** Post-deployment, users encounter RPC missing errors, table not found errors, or column type mismatch errors.
**Response:**
- Rollback: Revert the GitHub Pages frontend to the previous commit (see `deployment-and-rollback.md`).
- Recovery: Use Supabase CLI to rollback the migration if possible: `supabase migration down`. If irreversible destructive changes were deployed, coordinate a Point-In-Time Restore (PITR) to immediately prior to the deployment.

### 3. Accidental Mass Deletion or Corruption
**Detection:** Users report missing products, distorted inventory counts, or financial discrepancies.
**Response:**
- Detection: Review the `audit_logs` table via Supabase Dashboard to identify the exact timestamp of the destructive action.
- Recovery: Trigger a Point-In-Time Restore (PITR) to 1 minute before the identified timestamp.
- Communication: Inform users that any transactions logged between the restore point and current time must be re-entered.

### 4. RLS Misconfiguration (Security Leak)
**Detection:** Users report seeing records they shouldn't, or an audit reveals an overly permissive policy.
**Response:**
- Containment: Hotfix the RLS policy immediately via the Supabase SQL Editor.
- Recovery: Create an emergency migration tracking the RLS change and deploy it to synchronize the repository with production.
- Verification: Re-run the RLS testing scripts locally to ensure complete closure of the vulnerability.

### 5. Frontend Host Outage (GitHub Pages)
**Detection:** Users are unable to load the URL, or it returns a 404/503.
**Response:**
- Communication: Await GitHub Pages status resolution.
- Mitigation (Optional): Since Kuventory is a static Vite app, the `dist` folder can be served from any static host (Netlify, Vercel, S3) in an emergency by updating DNS records.

## Communication Protocol
- All outages must be logged internally.
- Resolution steps and post-mortem notes must be attached to the incident ticket for future reference.
