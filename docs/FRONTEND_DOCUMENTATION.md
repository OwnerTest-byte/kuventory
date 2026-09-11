# Frontend Documentation

**Kuventory v2.0.0**

This document details the structure, state management, and component architecture of the Kuventory React application.

## Directory Structure
The application code lives in the `frontend/src` directory, structured by domain and technical concern:

- `assets/`: Static assets, branding images, and global CSS.
- `components/`: Reusable React components.
  - `common/`: Generic UI elements (loaders, status badges, theme toggles).
  - `navigation/`: Sidebar, Navbar, Breadcrumbs, and Mobile Drawer.
  - `ui/`: shadcn/ui base components (buttons, cards, dialogs, inputs).
  - Domain-specific folders (`inventory/`, `sales/`, `expenses/`, etc.).
- `contexts/`: React Context providers for global state (e.g., `AuthContext`, `ThemeProvider`).
- `hooks/`: Custom React hooks, often wrapping TanStack Query or abstracting complex logic.
- `layouts/`: Master layout wrappers (e.g., `DashboardLayout`, `AuthLayout`).
- `pages/`: Page-level components corresponding to application routes.
- `services/`: API layer. Currently populated with mock asynchronous functions simulating backend delays.
- `types/`: TypeScript interfaces and type definitions defining domain models.
- `utils/`: Helper functions (e.g., date formatting, currency formatting).

## State Management
### Asynchronous State (Data Fetching)
Kuventory uses **TanStack Query (React Query)** to handle all asynchronous state, caching, and background synchronization.
- API calls are wrapped in custom hooks (e.g., `useInventory()`).
- Data is aggressively cached but invalidated upon mutation (e.g., when creating a new inventory entry).

### Local UI State
Standard React hooks (`useState`, `useReducer`) manage local component state, such as modal visibility and form inputs.

### Form State
**React Hook Form** paired with **Zod** provides robust, performant form state management and strict schema validation. This prevents unnecessary re-renders during typing and ensures data integrity before submission.

## Routing
Routing is handled by **React Router DOM (v7)**.
- Defined in `App.tsx`.
- Utilizes `React.lazy()` and `Suspense` for code-splitting routes, reducing the initial load size.
- A central `DashboardLayout` wraps all authenticated routes, maintaining the Sidebar and Navbar context.

## Memoization & Performance Optimization
As of v2.0.0, rendering-heavy components (particularly DataTables like `InventoryTable`, `SalesTable`, etc.) are wrapped in `React.memo()`. This prevents deep re-renders when parent components update state unrelated to the table's props.

## Component Design
The UI is constructed using the Atomic Design philosophy, heavily leaning on `shadcn/ui` components customized with Tailwind CSS.
Components are built to be responsive, accepting standard HTML attributes alongside specialized props.
