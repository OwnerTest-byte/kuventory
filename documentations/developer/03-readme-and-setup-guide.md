# Developer README & Environment Setup Guide

## 1. Prerequisites
- **Node.js**: v18.0.0 or higher (v20+ recommended).
- **Package Manager**: npm v9+ or pnpm.
- **Git**: Git 2.30+.
- **Supabase Account / Project**: For PostgreSQL database and GoTrue authentication.

---

## 2. Environment Variables Configuration

Create a `.env` file in the project root:
```env
# Supabase Configuration
VITE_SUPABASE_URL=https://stotgoylyzltzpahuglc.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_your_publishable_key_here
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_publishable_key_here
```

> [!IMPORTANT]
> Never commit `service_role` keys to the frontend repository. Only anon/publishable keys are permitted on client builds.

---

## 3. Installation & Local Development

1. **Clone the repository**:
   ```bash
   git clone https://github.com/OwnerTest-byte/kuventory.git
   cd kuventory
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start local development server**:
   ```bash
   npm run dev
   ```
   The application will boot at `http://localhost:5173`.

4. **Linting & Typechecking**:
   ```bash
   npm run lint        # Runs oxlint high-speed linter
   npm run typecheck   # Runs tsc --noEmit
   npm run build       # Validates production Vite compilation
   ```

---

## 4. Supabase Database Migrations Management

All database migrations reside in `supabase/migrations/`.

To push schema migrations to the live Supabase instance:
```bash
npx supabase db push
```
