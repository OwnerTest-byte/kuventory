# Deployment and Testing Guides

## 1. Automated Verification Pipeline

Before releasing or pushing code, run the three-stage verification pipeline:

### Stage 1: Static Code Analysis
```bash
npm run lint
```
- Validates code style, dead imports, and React hook dependencies via `oxlint`.

### Stage 2: Type System Verification
```bash
npm run typecheck
```
- Runs `tsc --noEmit` to ensure 100% strict TypeScript compliance across all 60+ files.

### Stage 3: Production Compilation
```bash
npm run build
```
- Compiles production bundle with Vite and Rolldown tree-shaking into `dist/`.

---

## 2. Netlify Production Release Runbook

### Prerequisites
- Build command: `npm run build`
- Publish directory: `dist`
- SPA Redirects: Handled automatically via `public/_redirects` containing:
  ```
  /*    /index.html   200
  ```

### Environment Configuration in Netlify Dashboard
Set the following environment variables in **Site settings > Environment variables**:
- `VITE_SUPABASE_URL`: Your production Supabase URL.
- `VITE_SUPABASE_ANON_KEY`: Your production Supabase publishable/anon key.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: Identical publishable key.

---

## 3. Database Migration Deployment Runbook

1. **Verify Database Health**:
   ```bash
   npx supabase status
   ```
2. **Review Pending Migrations**:
   Inspect files in `supabase/migrations/`.
3. **Deploy Migrations**:
   ```bash
   npx supabase db push
   ```
4. **Post-Deployment Verification**:
   - Verify views: `inventory_stock_view`
   - Check RLS policies on `public.inventory_items`, `public.stock_batches`, and `public.daily_inventory_sessions`.
