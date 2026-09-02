# PHASE 09: REPORT LIBRARY AND EXPORTS REPORT

## 1. Report Library

- **ReportsLibraryPage**: Implemented as the primary destination for accessing past inventory reports. 
- **Filters**: Included filters for 'From Date', 'To Date', and 'Status'.
- **Bounded Pagination**: Used Tanstack Query paired with Supabase `.range(offset, offset + limit - 1)` to fetch bounded pages of reports (20 per page).

## 2. Report Retrieval

- **Search Strategy**: Avoided full-text search infrastructure. The primary vectors are Date ranges and Status (FINALIZED/CORRECTED).
- **Queries**: `useReportsList` executes a precise select with exact counts for pagination over the `reports` table without fetching the heavy nested `report_items` for the list view.
- **Detailed Retrieval**: `useReport` retrieves the full snapshot only when the user clicks 'Open' to enter `ReportViewPage`.

## 3. PDF Export

- **Library**: `jspdf` and `jspdf-autotable`. Chosen for reliability and explicit table-rendering capabilities which fit KUVENTORY perfectly without the overhead of heavy HTML-to-PDF puppeteer infrastructure.
- **Strategy**: The PDF logic is separated into `export/pdf.ts`. It re-groups the items by "PORTION STOCK" and "PER CASES" strictly matching the original Kiosk and Bodega paper document aesthetic.
- **Code Splitting**: The function is loaded via dynamic import `import('../export/pdf')` only when the user clicks the "PDF" button.

## 4. XLSX Export

- **Library**: `xlsx` (SheetJS). The industry standard for robust spreadsheet generation in the browser.
- **Strategy**: Generates a flat table containing all metrics (Beginning, Add, Total, AM, PM, Ending). Includes column-width styling.
- **Code Splitting**: Loaded dynamically `import('../export/xlsx')` to preserve fast initial page loads.

## 5. CSV Export

- **Library**: None. Native JavaScript `Blob` used to serialize the report arrays.
- **Strategy**: Correctly escapes quotes, commas, and line breaks ensuring RFC 4180 compatibility.
- **Code Splitting**: Dynamically imported similarly to PDF/XLSX for consistency.

## 6. Security

- **Export Authorization**: RLS enforces that users can only fetch reports and report items they are permitted to view. Since all exports happen client-side utilizing the already fetched `report` data payload, the export functionality inherits the security bounds of the API fetch exactly.

## 7. Performance

- **Measurements**: Initial page load remains untouched. Activating a PDF or XLSX export triggers a single JS chunk download (< 200KB gzipped).
- No unnecessary report data is pre-fetched on the library screen.

## 8. Responsive Design

- **Report View**: The detailed report is constrained by `max-w-5xl`. The data table is wrapped in an `overflow-x-auto` container, ensuring the complex table can scroll horizontally on mobile without breaking the parent layout constraints.

## 9. Tests

- Verified via Playwright (`e2e/reports.spec.ts`):
  1. `can load and view a report if valid id is given`
  2. `can browse report library, filter, view report, and trigger exports`
  - Playwright `waitForEvent('download')` is successfully capturing the PDF, XLSX, and CSV downloads in the CI.

## 10. Dependencies

- **Added**: `jspdf`, `jspdf-autotable`, `xlsx`.
- **Reason**: Needed for professional, standards-compliant, client-side generation of document exports per specifications. 

## 11. Code Quality

- No dead code. Refactored `App.tsx` routes. Removed extraneous imports (`Search` from lucide-react).

## 12. Documentation

- Created `docs/03-features/PHASE-09-REPORT-LIBRARY-EXPORTS-REPORT.md`.

## 13. Known Issues

- The exact categorisation into "PORTION STOCK" vs "PER CASES" in the PDF is currently inferred using substring matching (`toUpperCase().includes('CASE')`). In production, this should map to explicit `unit` or `category` enums in the DB if the business mandates strict enforcement.

## 14. Version

- **KUVENTORY 0.1.0 (Phase 09 Completed)**
