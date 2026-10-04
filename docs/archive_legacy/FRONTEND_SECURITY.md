# Frontend Security Measures

**Kuventory v2.0.1**

This document outlines the security strategies currently implemented in the frontend application, and details the future responsibilities of the backend.

## Implemented Security Measures

### 1. Protected Routes & Navigation Guard
The application utilizes a `ProtectedRoute` wrapper component within `App.tsx`. 
- **Idle State**: Unauthenticated users are strictly redirected to the `/login` route.
- **Role-Based Navigation**: The Sidebar checks the `allowedRoles` array on each navigation item. If the authenticated user's role (e.g., `Staff`) is not present (e.g., on the `Settings` page restricted to `Admin` or `Manager`), the link is entirely hidden from the UI.

### 2. Input Validation & Sanitization
All user-facing inputs are routed through **React Hook Form** and validated against strict **Zod** schemas.
- Types (string, number, date) are strictly enforced before an API call is even attempted.
- Empty payloads are blocked locally.
- Negative numbers are blocked for critical stock values.

### 3. Safe Error Handling
Error messages caught by TanStack Query are sanitized using `sonner` toasts. Detailed stack traces or internal component states are **never** exposed to the end user in the production UI.

### 4. Production Build Optimization
- The Vite build process minifies the source code.
- `console.log` statements and React Query Devtools are automatically stripped from the production bundle, preventing accidental exposure of internal application state.

---

## Future Backend Security Responsibilities
Since Kuventory v2.0.1 is running against mock services, true security will be implemented during the Django (Previous backend architecture discarded. New backend architecture pending.) integration phase.

### 1. Token Storage Strategy (Planned)
- Authentication will transition to stateless JSON Web Tokens (JWT).
- **Access Tokens**: Should be stored strictly in memory (React context/state).
- **Refresh Tokens**: Should be stored in `HttpOnly`, `Secure`, `SameSite=Strict` cookies, preventing XSS attacks from reading the token via JavaScript.

### 2. Backend Validation (Planned)
- The Django REST Framework (Previous backend architecture discarded. New backend architecture pending.) (DRF) layer must re-validate all payloads. Frontend validation is for UX; backend validation is for security.

### 3. Idle Logout & Session Cleanup (Planned)
- The frontend will implement an inactivity timer (e.g., 15 minutes of no mouse/keyboard events).
- Upon triggering, the frontend will clear in-memory tokens, invoke a backend logout endpoint (to invalidate the refresh cookie), and redirect the user.

