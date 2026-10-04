# Test Deployment Access

This document tracks the deployment testing accounts and parameters for the live environment.

## Live Domain

**[Insert Netlify Domain Here]**

## Credentials

Use these accounts to test the live deployment environment. These accounts should be populated in the Supabase hosted project instance.

### System Administrator

- **Email**: `admin@kuventory.local`
- **Password**: `admin123`
- **Expected Role**: Operations Manager (Read/Write/Delete)

### Standard User

- **Email**: `user@kuventory.local`
- **Password**: `user123`
- **Expected Role**: Inventory Staff (Read/Write)

## Test Validation Points

1. **Login Flow**: Ensure both accounts can log in successfully.
2. **Data Isolation**: Ensure Standard Users cannot perform Admin actions (e.g., delete critical settings, change application configuration).
3. **Database Operations**: Perform CRUD operations on inventory items.
4. **Realtime Updates**: (If applicable) Ensure socket connections do not drop unexpectedly.
