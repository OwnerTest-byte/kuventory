# Local Setup Guide

1. **Install Node.js**
   Ensure you are running Node.js v24 (refer to `.nvmrc`).

2. **Install Dependencies**
   Run `npm install` in the project root.

3. **Supabase Local Development**
   Ensure Docker is running, then start the local Supabase environment:

   ```bash
   supabase start
   ```

4. **Environment Variables**
   Copy `.env.example` to `.env.local` and populate it with the local Supabase URLs and keys (provided by the `supabase start` command).

5. **Start the Development Server**

   ```bash
   npm run dev
   ```

   The application will be accessible at `http://localhost:5173`.
