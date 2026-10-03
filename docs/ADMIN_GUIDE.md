# Administrator & Roles Guide

**KUVENTORY Enterprise · Kape Uno Bistro**  
**Version:** 2.0.0  

This guide covers system administration, role hierarchies, and security configurations.

---

## 1. Role-Based Access Control Architecture

KUVENTORY enforces a strict 3-tier operational hierarchy:

### Tier 0: Master Administrator (`MASTER_ADMIN`)
- **Authority:** Root superuser with unrestricted system authority.
- **Dedicated Console:** `/settings?tab=master`.
- **Exclusive Capabilities:**
  - One-click full database snapshot export (`.json`).
  - Disaster recovery dry-run validation and restoration.
  - Emergency force-override on locked/finalized daily inventory sheets.
  - Creation and promotion of other Administrators and Master Administrators.
  - Protected by PostgreSQL `protect_profile_role()` triggers against demotion by lower tiers.

### Tier 1: Store Administrator (`ADMIN`)
- **Authority:** Store Managers and Head Kitchen Supervisors.
- **Capabilities:**
  - Full access to catalog, categories, pricing, and suppliers.
  - FEFO batch receiving, adjustments, and expiration tracking.
  - Finalizing daily inventory closing sheets.
  - Generating and exporting PDF/Excel reports.
  - Creating and resetting passwords for floor staff (`USER`).
  - Access to audit trails and visitor access logs.
- **Restrictions:** Cannot promote users to Admin or Master Admin; cannot override finalized sheets without Master approval.

### Tier 2: Floor Staff (`USER`)
- **Authority:** Baristas, Kitchen Staff, and Shift Operators.
- **Capabilities:**
  - Recording shift counts on the Daily Inventory worksheet.
  - Viewing catalog stock levels and expiration notices.
  - Viewing personal account details and updating own password.
- **Restrictions:** Cannot modify item prices, categories, or audit logs; cannot access the Administrative console or system settings.

---

## 2. Daily Closing Procedures (Store Admin)

1. **Verify Sheet Entries:** Verify that the shift staff entered all AM Sales, PM Sales, and Portion usages.
2. **Review Variances:** Inspect auto-calculated variance between Expected Stock and Counted Stock.
3. **Lock & Finalize:** Click **Finalize Inventory** to write an immutable snapshot to the database.
4. **Export Daily Report:** Download the consolidated Daily Inventory summary for bookkeeping and food cost analysis.
