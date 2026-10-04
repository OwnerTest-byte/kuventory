# Known Limitations

**Kuventory v2.0.0**

As of version 2.0.0, Kuventory operates strictly as a Frontend SPA (Single Page Application) for demonstration and evaluation purposes. 

## 1. Frontend-Only Architecture
There is currently no live backend server running. The application relies entirely on JavaScript executing within the user's browser.

## 2. Mock Data & Lack of Persistence
All data within the application is stored in memory (`mockServices.ts`). 
- **Limitation**: Any modifications (e.g., adding an inventory item, recording a sale) will be lost immediately upon refreshing the browser.
- **Resolution**: This will be fixed once the Django (Previous backend architecture discarded. New backend architecture pending.) PostgreSQL (Previous backend architecture discarded. New backend architecture pending.) backend is integrated.

## 3. Simulated Authentication
The current authentication system is mocked.
- Any email and password combination will grant access.
- Role switching is handled entirely on the client side for testing layouts.
- **Resolution**: True secure authentication requires JWT implementation on the backend.

## 4. No Live Database Constraints
While the frontend enforces calculations (e.g., preventing negative inventory), a determined user could bypass these client-side restrictions. True data integrity will be enforced by the PostgreSQL (Previous backend architecture discarded. New backend architecture pending.) database schema and backend serializers.

## 5. Global Search Constraints
The `⌘K` global search currently searches against a static, hardcoded list of pages and mocked features. It does not perform a full-text search against the (mock) database records.

