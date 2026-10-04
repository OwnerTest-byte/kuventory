# Deployment & Rollback Pipeline

## GitHub Pages Deployment
Kuventory is deployed statically via GitHub Pages using the `.github/workflows/deploy.yml` pipeline.
Currently, this workflow executes `npm ci` and `npm run build` on the `main` branch.

### Critical Requirement: Environment Variables
Vite requires environment variables to be present **at build time** to inject them into the static bundle.
The current `deploy.yml` does not inject Supabase configuration. This will cause the production application to fail immediately on startup.

**Required Fix:**
1. Navigate to the GitHub Repository -> Settings -> Secrets and variables -> Actions.
2. Add the following **Repository Secrets**:
   - `VITE_SUPABASE_URL`: The production URL of the Supabase project.
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: The production Anon key.
3. Update `.github/workflows/deploy.yml` build step:
```yaml
      - name: Build
        run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.VITE_SUPABASE_PUBLISHABLE_KEY }}
```

### Pre-Deployment Checks
It is recommended to run `npm run lint` and `npm run typecheck` before `npm run build` in the GitHub Actions pipeline. If either step fails, the deployment should halt.

## Rollback Procedure

If a production deployment is found to be defective:

### 1. Identify the Target Commit
- Open the GitHub repository and navigate to the commit history.
- Locate the commit hash of the last known stable deployment.

### 2. Frontend Rollback
- Revert the main branch to the stable commit, or trigger a manual GitHub Actions dispatch using the stable commit.
- **WARNING**: Do not rollback the frontend if the target commit relies on a database schema that no longer exists (e.g. an intervening migration dropped a column).

### 3. Database Compatibility
- Frontend deployments are tightly coupled to the PostgreSQL Schema (RPC signatures, Views, Tables).
- If the defective deployment included a destructive Database Migration (`supabase migration up`), the rollback requires two parts:
  1. Rollback the database: `supabase migration down`.
  2. Rollback the frontend commit.
- If the Database Migration was purely additive (new columns, new views), it is usually safe to roll back the frontend *without* rolling back the database.
