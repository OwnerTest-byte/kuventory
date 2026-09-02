# Performance Baseline

Initial baseline measurements for the minimal application shell. These serve as the constraint threshold before implementing actual business logic.

## Baseline 1: Greenfield Application Shell

**Date:** 2026-09-02
**Environment:** Node v24, Vite v8, React v19, Tailwind v4

### Production Build Sizes
- **HTML (`index.html`)**: 0.45 kB (gzip: 0.28 kB)
- **CSS (`index.css`)**: 2.14 kB (gzip: 0.62 kB)
- **JavaScript (`index.js`)**: 253.12 kB (gzip: 80.11 kB)

**Notes:** The JS bundle includes React, React DOM, React Router, React Query, React Hook Form, Zod, and Supabase JS clients, representing the complete foundation. This is a very healthy starting point.
