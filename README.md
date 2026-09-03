# KUVENTORY

KUVENTORY is a comprehensive, real-time restaurant inventory management system built with React, Vite, and Supabase.

## Architecture

* **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, `shadcn/ui` components
* **Backend**: Supabase (PostgreSQL, Auth, RLS, Edge Functions)
* **Testing**: Vitest, Playwright

## Setup and Installation

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Configuration
Create a `.env.local` file based on `.env.example`:
```bash
cp .env.example .env.local
```
Fill in the `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for your development environment.

### 3. Database Setup (Supabase)
Ensure the Supabase CLI is installed and running locally, or connected to your remote project.
```bash
npx supabase start
npx supabase db push
```

### 4. Run the Development Server
```bash
npm run dev
```

## Available Commands

- `npm run dev`: Starts the local development server.
- `npm run build`: Compiles TypeScript and builds the production artifact via Vite.
- `npm run lint`: Runs Oxlint.
- `npm run typecheck`: Runs TypeScript compiler in no-emit mode.
- `npm run test`: Runs unit and integration tests using Vitest.
- `npm run e2e`: Runs Playwright end-to-end tests.

## Deployment

The application is configured to be deployed as a static Single Page Application (SPA).
Ensure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are provided to your deployment provider (e.g. Netlify).
The build output will be located in the `dist/` directory.

## Security Considerations

- **RLS**: Row Level Security is enforced in the Supabase database. Ensure all table policies are correctly migrated.
- **Client Variables**: Never expose `service_role` keys or database passwords in the `.env.local` or `.env` files, as these will be bundled into the client build.

## Documentation
Additional architectural and operational documentation can be found in the `docs/` directory.
