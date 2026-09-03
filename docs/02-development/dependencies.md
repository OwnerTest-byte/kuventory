# KUVENTORY Dependencies

| Dependency | Purpose | Rationale |
| --- | --- | --- |
| `react` / `react-dom` | UI Library | Core framework selected for the KUVENTORY frontend. |
| `react-router-dom` | Routing | Standard, lightweight client-side routing. Needed for navigation. |
| `@tanstack/react-query` | Data Fetching/State | Manages async server state and caching natively. Eliminates need for Redux. |
| `@supabase/supabase-js` | Database Client | Official client for communicating with Supabase PostgreSQL and Auth. |
| `react-hook-form` | Form State | High performance, uncontrolled form state management. Essential for complex data entry. |
| `zod` / `@hookform/resolvers` | Validation | Schema validation integrated with forms. Ensures data integrity before submission. |
| `lucide-react` | Icons | Minimal, clean SVG icon set. |
| `clsx` / `tailwind-merge` | Styling Utilities | Required by shadcn/ui to merge Tailwind classes cleanly without conflicts. |

## Development Dependencies

- `vite` / `@vitejs/plugin-react`: Fast modern build tool and development server.
- `tailwindcss` / `@tailwindcss/vite`: Utility-first CSS framework for rapid UI styling.
- `typescript` / `@types/*`: Strict type checking for reliability.
- `oxlint`: Fast rust-based linter.
- `vitest` / `@testing-library/*` / `jsdom`: Fast unit testing environment.
- `@playwright/test`: E2E testing framework for critical workflows.
