-- Fix auth.users tokens being NULL which crashes GoTrue
-- In older GoTrue versions (and some specific docker tags), having NULL in token columns
-- causes a "Scan error on column index X: converting NULL to string is unsupported".
-- GoTrue will return a 500 which the frontend parses as "Database error querying schema".

UPDATE auth.users
SET 
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, '');
