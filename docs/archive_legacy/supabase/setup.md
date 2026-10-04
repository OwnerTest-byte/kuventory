# Local Supabase Project Setup & Workflow

This document details the local setup, linking, and workflow for the KUVENTORY Supabase backend.

## Prerequisites
- **Node.js**: v24.13.1
- **npm**: 11.10.0
- **Docker Desktop**: Required to run the local Supabase stack (version 29.6.2 installed).

## Supabase CLI Setup

The Supabase CLI is installed as a development dependency within the `frontend/` package to manage the project locally. 

**Installation**
```bash
cd frontend
npm install --save-dev supabase
```
*Note: The CLI can be run using `npx supabase` from the root directory or frontend directory.*

**Version installed**: 2.111.0

## Authentication
To authenticate the Supabase CLI with your account, run:
```bash
npx supabase login
```
*Do not print or expose access tokens in logs or git.*

## Linking the Local Project
The local setup is linked to the **KUVENTORY-DEV** project on Supabase Cloud.

**List available projects**:
```bash
npx supabase projects list
```

**Identify Reference ID**:
- KUVENTORY-DEV Reference ID: `wdwiqvkjbayvytavgkyy`

**Link project**:
```bash
npx supabase link --project-ref wdwiqvkjbayvytavgkyy
```

## Running the Local Stack
Ensure Docker Desktop is running before starting the local stack.

**Start Local Supabase**:
```bash
npx supabase start
```
This will spin up local Docker containers and provide URLs for:
- API URL
- Studio URL
- Database URL

**Stop Local Supabase**:
```bash
npx supabase stop
```

## Verifying the Local Environment
You can verify the status of the local stack by running:
```bash
npx supabase status
```

## Environment Variable Strategy
- Frontend `.env` and `.env.local` files are ignored by git (see `frontend/.gitignore`).
- The `frontend/.env.example` contains placeholders for `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- **Never commit `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` to the repository.**
- Only publishable keys should be accessible to the frontend.

## Development vs Cloud Workflow
1. Develop schema changes using local migrations (`npx supabase migration new`).
2. Test changes locally with `npx supabase start`.
3. Push migrations to the cloud using `npx supabase db push`.
*(Database schema design and migrations are handled in subsequent phases.)*
