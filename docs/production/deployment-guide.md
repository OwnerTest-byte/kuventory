# Kuventory - Deployment Guide

## Prerequisites
- A valid Supabase Project (Production Environment).
- A GitHub repository hosting the Kuventory codebase.
- Access to GitHub Repository Secrets.

## Environment Variables Configuration
Before deploying to production, ensure the GitHub Actions Runner is configured with the following repository secrets:
- `VITE_SUPABASE_URL`: The production URL provided by Supabase.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: The production anon key provided by Supabase.

*Note: Never commit these variables in plaintext to the repository.*

## GitHub Pages Deployment
Kuventory uses GitHub Pages as its static hosting solution.
1. Push your code to the `main` branch.
2. The GitHub Action `.github/workflows/deploy.yml` will trigger automatically.
3. The Action runs `npm ci` followed by `npm run build` injecting the secrets.
4. The generated static assets in `dist/` are uploaded and deployed to GitHub Pages.

## Supabase Configuration
- Ensure all migrations in `supabase/migrations/` have been applied to the production database via the Supabase CLI:
  ```bash
  supabase db push
  ```
- Configure the Authentication settings in Supabase to allow redirect URLs pointing to your specific GitHub Pages domain (e.g. `https://your-org.github.io/kuventory/`).

## Post-Deployment Verification
1. Navigate to the GitHub Pages URL.
2. Verify you can view the login screen.
3. Test a login attempt with a test user to ensure `VITE_SUPABASE_URL` is functioning correctly in the deployed bundle.
