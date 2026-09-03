# KUVENTORY Deployment Guide

This document outlines the deployment strategy for the KUVENTORY web application.

## 1. Hosting Providers

- **Frontend**: Netlify (Git-based continuous deployment)
- **Backend**: Supabase (Managed PostgreSQL & Auth)
- **Repository**: GitHub

## 2. Netlify Setup

1. Connect your GitHub repository to a new Netlify Site.
2. Build Settings:
   - **Base directory**: `/`
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
3. Environment Variables:
   - `VITE_SUPABASE_URL`: The hosted Supabase API URL.
   - `VITE_SUPABASE_ANON_KEY`: The hosted Supabase Anon Key.
   *(Note: The build process requires these keys to bake them into the SPA client bundle. They are strictly public)*

## 3. SPA Routing

The repository includes a `public/_redirects` file that tells Netlify to direct all traffic to `index.html`. This ensures that routes like `/inventory` resolve correctly when visited directly.

```text
/* /index.html 200
```

## 4. Supabase Setup

1. Link your local project to the remote project:

   ```bash
   npx supabase link --project-ref <your-project-ref>
   ```

2. Apply the schema and migrations:

   ```bash
   npx supabase db push
   ```

3. Configure **Supabase Auth Redirect URLs**:
   In the Supabase Dashboard, go to **Authentication > URL Configuration** and add your Netlify deployed URL (e.g., `https://your-site.netlify.app`) to the Site URL and allowed Redirect URLs.

## 5. Security Note

Never commit `.env.local` or `.env` files containing actual secrets (like the `SERVICE_ROLE_KEY` or database passwords) to GitHub. The Git history should remain clean and secure.
