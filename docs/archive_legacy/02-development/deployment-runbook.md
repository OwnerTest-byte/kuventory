# Deployment Runbook

Follow these steps to deploy a new version of KUVENTORY manually or verify an automated deployment:

1. **Verify Branch**
   - Ensure you are on the `master` deployment branch.
   - Run `git status` to verify a clean working tree.

2. **Run Tests Locally**
   - Run `npm run test`
   - Run `npm run typecheck`
   - Run `npm run lint`

3. **Deploy Database Schema (Supabase)**
   - Link project: `npx supabase link --project-ref stotgoylyzltzpahuglc`
   - Enter your database password when prompted.
   - Push schema: `npx supabase db push`

4. **Deploy Frontend (Netlify)**
   - Ensure the repository is linked in the Netlify Dashboard.
   - If not, push your code to GitHub to trigger Netlify, or deploy locally:
     `npx netlify deploy --prod --build`

5. **Verify Supabase Auth Configuration**
   - Go to the Supabase Dashboard -> Authentication -> URL Configuration.
   - Ensure the Site URL matches the live Netlify domain.

6. **Verify Deployment**
   - Navigate to the deployed site in a browser.
   - Run through the standard smoke tests (Login, Load Inventory, Log Out).

7. **Record Version**
   - Tag the git commit used for deployment (e.g. `git tag v1.0.0`).
   - Push tags: `git push origin --tags`.
