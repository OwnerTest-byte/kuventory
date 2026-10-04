# Deployment Guide

**Kuventory v2.0.1**

Kuventory is currently deployed as a static React Single Page Application (SPA) to GitHub Pages. The deployment is fully automated using GitHub Actions.

## Development Deployment (Local Testing)
To verify the production build locally before pushing:
1. Navigate to the `frontend/` directory.
2. Run `npm run build`. This will typecheck the code and generate the optimized output in the `frontend/dist` folder.
3. Run `npm run preview`. This will serve the `dist` folder on a local web server (typically `http://localhost:4173`).

## Production Deployment (GitHub Pages)

### GitHub Actions Workflow
The deployment is managed by the `.github/workflows/deploy.yml` file.

**Trigger**: 
The workflow automatically triggers on any `push` to the `main` branch.

**Build Process**:
1. Checks out the repository.
2. Sets up Node.js.
3. Navigates to the `frontend/` directory.
4. Installs dependencies (`npm ci`).
5. Runs the build script (`npm run build`).
6. Configures GitHub Pages and uploads the `frontend/dist` directory as an artifact.

**Deployment Process**:
1. The `deploy` job downloads the artifact.
2. Deploys the artifact to the GitHub Pages environment.

### Environment Variables
For GitHub Pages deployment, environment variables must be baked into the build at compile time.
Currently, the application relies on mock services, so no external API keys are required.
When transitioning to a live backend, ensure that `VITE_API_URL` is set in the GitHub Repository Secrets and passed to the build step in the `deploy.yml` workflow.

### Rollback Procedure
If a broken deployment reaches GitHub Pages:
1. Identify the last known stable commit hash on the `main` branch.
2. Revert the commit: `git revert <commit-hash>`.
3. Push the reversion to `main`: `git push origin main`.
4. GitHub Actions will automatically trigger and deploy the stable state.
