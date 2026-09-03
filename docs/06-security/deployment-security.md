# KUVENTORY Deployment Security

## 1. Secrets Management

The frontend deployment requires environment variables to connect to the backend.

- `VITE_SUPABASE_URL`: Public endpoint. Safe to expose.
- `VITE_SUPABASE_ANON_KEY`: Public Anon Key. Safe to expose.

**CRITICAL RULES**:

- Never add the `SERVICE_ROLE_KEY` to the Netlify environment variables.
- Never add the Supabase PostgreSQL database connection string (`postgresql://...`) to Netlify.
- Never track actual passwords in the GitHub repository.

## 2. Authentication Flow Integrity

KUVENTORY uses Supabase Auth to handle secure JWT handshakes.

- **Allowed Redirect URLs**: The Supabase project must be explicitly configured to only accept redirect requests originating from the authorized Netlify domain. This prevents token-leakage via rogue domains.

## 3. Database Migration Posture

- Migrations are defined locally and tracked in version control.
- Pushing to the remote database (`npx supabase db push`) guarantees that the strict Row-Level Security (RLS) policies developed and tested locally are identically applied to the production/test environment.
- Any manual modification in the Supabase Dashboard may introduce schema drift and potential security vulnerabilities.

## 4. Netlify Build Pre-checks

During the CI process, the frontend is vetted for:

- Static type integrity (TypeScript check)
- Security vulnerability dependencies (`npm audit` if enabled)
- Linter validation
If any check fails, the deployment is aborted, ensuring a compromised build cannot replace the live application.
