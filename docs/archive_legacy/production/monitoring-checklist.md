# Kuventory - Monitoring Checklist

## Daily Monitoring
- **Application Availability**: Check if the Kuventory dashboard loads on `main` URL.
- **Authentication Check**: Attempt logging in with a low-privileged test user account to verify Supabase Auth is active.
- **Database Availability**: Check Supabase Dashboard for DB compute usage and connection limits.
- **Error Logs**: Review Supabase edge logs and API error logs for 500s or timeouts.
- **Failed Transactions**: Filter `audit_logs` where `status = 'failed'` or `error` is not null (if captured).

## Weekly Monitoring
- **Inventory Inconsistencies**: Run a manual SQL check in Supabase identifying any `inventory_balances.quantity < 0`. (Should be zero rows due to DB constraint).
- **Cash Discrepancies**: Review open vs closed cash sessions. Ensure cashiers aren't leaving sessions open over multiple days.
- **GitHub Pages Builds**: Review the Actions tab in GitHub to ensure no silent build failures have blocked updates.

## Monthly Monitoring
- **Supabase Usage**: Review bandwidth and Database size to ensure limits of the current Supabase tier are not exceeded.
- **Storage Usage**: If receipt images or avatars are heavily uploaded, check Supabase Storage quotas.
- **Role Audits**: Verify `user_roles` to ensure no unauthorized users have been mistakenly granted `Administrator` privileges.
