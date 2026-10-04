# Testing Guide

**Kuventory v2.0.0**

This guide outlines the testing strategies for the Kuventory frontend.

## Static Analysis
Before any code is committed, static analysis must be run to catch syntax errors, strict typing violations, and formatting inconsistencies.
```bash
npm run typecheck
npm run lint
```
No PR will be accepted if these commands throw errors.

## Manual QA Testing
Until automated E2E tests are configured, the frontend requires manual Quality Assurance checks based on the `QA_TEST_REPORT.md` checklist. Focus specifically on:
1. **Forms**: Ensure Zod validation blocks empty submissions and enforces correct data types.
2. **Responsiveness**: Resize the browser window to verify `DataTables` gain `overflow-x-auto` scrolling.

## Future Automated Testing
Once the backend is integrated, the following testing layers will be introduced:

### Unit Testing (Vitest + React Testing Library)
For testing isolated React components and custom hooks (e.g., verifying `mockServices` transformations).
```bash
npm run test
```

### End-to-End Testing (Playwright / Cypress)
To simulate actual user journeys (e.g., logging in, recording a sale, generating a report).
