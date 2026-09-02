# /security

## Objective
Validate authentication, authorization, RLS, secrets, and business-integrity boundaries.

## Procedure
1. Inspect auth/session handling.
2. Verify role resolution.
3. Attempt unauthorized UI operations.
4. Attempt unauthorized direct database/API operations.
5. Verify finalized report protection.
6. Verify inventory mutation integrity and authorization.
7. Verify no privileged key is shipped to the browser.
8. Review storage policies and file handling.
9. Document findings and fixes.
10. Re-run security tests.
