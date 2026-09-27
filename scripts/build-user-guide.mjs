import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  ShadingType,
  ImageRun,
  Header,
  Footer,
  PageNumber,
  PageBreak
} from 'docx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Clean, high-contrast palette
const COLOR_PRIMARY = '1E293B';   // Slate Dark
const COLOR_ACCENT = '8A5A36';    // KUVENTORY Coffee Bronze
const COLOR_TEXT = '334155';      // Body text charcoal
const COLOR_MUTED = '64748B';     // Cool gray
const COLOR_LIGHT_BG = 'F8FAFC';  // Alternate table row fill
const COLOR_BORDER = 'E2E8F0';    // Subtle border

// Callout Styles
const CALLOUT_TIP = { border: '16A34A', bg: 'F0FDF4', titleColor: '15803D' };
const CALLOUT_NOTE = { border: '2563EB', bg: 'EFF6FF', titleColor: '1D4ED8' };
const CALLOUT_IMPORTANT = { border: 'D97706', bg: 'FFFBEB', titleColor: 'B45309' };
const CALLOUT_WARNING = { border: 'DC2626', bg: 'FEF2F2', titleColor: 'B91C1C' };

function createTitle(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 240, after: 120 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 48, // 24pt
        color: COLOR_PRIMARY,
        font: 'Segoe UI'
      })
    ]
  });
}

function createSubtitle(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 60, after: 240 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 24, // 12pt
        color: COLOR_ACCENT,
        font: 'Segoe UI'
      })
    ]
  });
}

function createHeading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 140 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 30, // 15pt
        color: COLOR_PRIMARY,
        font: 'Segoe UI'
      })
    ]
  });
}

function createHeading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 260, after: 100 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 24, // 12pt
        color: COLOR_ACCENT,
        font: 'Segoe UI'
      })
    ]
  });
}

function createHeading3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 180, after: 80 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 21, // 10.5pt
        color: COLOR_PRIMARY,
        font: 'Segoe UI'
      })
    ]
  });
}

function createParagraph(text, options = {}) {
  return new Paragraph({
    spacing: { before: 80, after: 100, line: 260 },
    alignment: options.alignment || AlignmentType.LEFT,
    children: [
      new TextRun({
        text,
        size: 20, // 10pt
        color: options.color || COLOR_TEXT,
        bold: options.bold || false,
        italics: options.italics || false,
        font: 'Segoe UI'
      })
    ]
  });
}

function createBullet(text, boldPrefix = '') {
  const children = [];
  if (boldPrefix) {
    children.push(new TextRun({ text: boldPrefix + ' ', bold: true, size: 20, color: COLOR_PRIMARY, font: 'Segoe UI' }));
  }
  children.push(new TextRun({ text, size: 20, color: COLOR_TEXT, font: 'Segoe UI' }));

  return new Paragraph({
    bullet: { level: 0 },
    spacing: { before: 50, after: 50, line: 250 },
    children
  });
}

function createNumberedStep(stepNum, stepTitle, stepBody) {
  return new Paragraph({
    spacing: { before: 90, after: 100, line: 250 },
    children: [
      new TextRun({
        text: `${stepNum}. `,
        bold: true,
        size: 20,
        color: COLOR_ACCENT,
        font: 'Segoe UI'
      }),
      new TextRun({
        text: stepTitle + ': ',
        bold: true,
        size: 20,
        color: COLOR_PRIMARY,
        font: 'Segoe UI'
      }),
      new TextRun({
        text: stepBody,
        size: 20,
        color: COLOR_TEXT,
        font: 'Segoe UI'
      })
    ]
  });
}

function createCallout(type, title, text) {
  const cfg = type === 'TIP' ? CALLOUT_TIP :
              type === 'WARNING' ? CALLOUT_WARNING :
              type === 'IMPORTANT' ? CALLOUT_IMPORTANT : CALLOUT_NOTE;

  return new Paragraph({
    spacing: { before: 120, after: 140 },
    border: {
      left: { style: BorderStyle.SINGLE, size: 24, color: cfg.border, space: 12 }
    },
    shading: {
      type: ShadingType.CLEAR,
      fill: cfg.bg
    },
    children: [
      new TextRun({
        text: `[${type}] ${title} — `,
        bold: true,
        size: 20,
        color: cfg.titleColor,
        font: 'Segoe UI'
      }),
      new TextRun({
        text,
        size: 19,
        color: COLOR_TEXT,
        font: 'Segoe UI'
      })
    ]
  });
}

function createTable(headers, rows, colWidths = []) {
  const tableRows = [];

  // Header Row
  tableRows.push(
    new TableRow({
      tableHeader: true,
      children: headers.map((headerText, idx) => {
        return new TableCell({
          width: colWidths[idx] ? { size: colWidths[idx], type: WidthType.DXA } : undefined,
          shading: { fill: COLOR_PRIMARY, type: ShadingType.CLEAR },
          margins: { top: 100, bottom: 100, left: 120, right: 120 },
          children: [
            new Paragraph({
              alignment: AlignmentType.LEFT,
              children: [
                new TextRun({
                  text: headerText,
                  bold: true,
                  size: 19,
                  color: 'FFFFFF',
                  font: 'Segoe UI'
                })
              ]
            })
          ]
        });
      })
    })
  );

  // Data Rows
  rows.forEach((row, rowIdx) => {
    const isEven = rowIdx % 2 === 1;
    tableRows.push(
      new TableRow({
        children: row.map((cellText, colIdx) => {
          return new TableCell({
            width: colWidths[colIdx] ? { size: colWidths[colIdx], type: WidthType.DXA } : undefined,
            shading: isEven ? { fill: COLOR_LIGHT_BG, type: ShadingType.CLEAR } : undefined,
            margins: { top: 90, bottom: 90, left: 120, right: 120 },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
              left: { style: BorderStyle.NONE },
              right: { style: BorderStyle.NONE }
            },
            children: [
              new Paragraph({
                spacing: { line: 240 },
                alignment: AlignmentType.LEFT,
                children: [
                  new TextRun({
                    text: cellText,
                    size: 18,
                    color: COLOR_TEXT,
                    font: 'Segoe UI'
                  })
                ]
              })
            ]
          });
        })
      })
    );
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: tableRows
  });
}

export async function generateUserGuideDocx() {
  console.log('Generating KUVENTORY Official User Guide (.docx)...');

  // Load Logo
  const logoPath = path.join(projectRoot, 'public', 'logo-original.png');
  let logoBuffer = null;
  if (fs.existsSync(logoPath)) {
    logoBuffer = fs.readFileSync(logoPath);
  }

  const content = [];

  // ==========================================
  // COVER PAGE
  // ==========================================
  if (logoBuffer) {
    content.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 600, after: 240 },
        children: [
          new ImageRun({
            data: logoBuffer,
            transformation: { width: 130, height: 130 }
          })
        ]
      })
    );
  }

  content.push(
    createTitle('KUVENTORY™'),
    createSubtitle('USER GUIDE & OPERATING MANUAL'),
    createParagraph('Commercial Restaurant & Kiosk Inventory Management System', {
      alignment: AlignmentType.CENTER,
      bold: true,
      color: COLOR_PRIMARY
    }),
    createParagraph('Daily Inventory Recording • FEFO Stock Management • Automated Snapshot Reports', {
      alignment: AlignmentType.CENTER,
      italics: true,
      color: COLOR_MUTED
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 800, after: 100 },
      children: [
        new TextRun({
          text: 'Official User Guide for Staff & Administrators',
          bold: true,
          size: 20,
          color: COLOR_PRIMARY,
          font: 'Segoe UI'
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 40, after: 80 },
      children: [
        new TextRun({
          text: 'System URL: https://kuventory.netlify.app | Version 2.4 (Production)',
          size: 18,
          color: COLOR_MUTED,
          font: 'Segoe UI'
        })
      ]
    }),
    new Paragraph({ children: [new PageBreak()] })
  );

  // ==========================================
  // TABLE OF CONTENTS & QUICK REFERENCE
  // ==========================================
  content.push(
    createHeading1('Table of Contents'),
    createBullet('1. System Purpose & User Roles (User vs Admin)'),
    createBullet('2. Getting Started & Navigation (Login, Menu & Command Palette)'),
    createBullet('3. Daily Inventory Worksheet (Step-by-Step Shift Routine)'),
    createBullet('4. Managing Stations & Custom Category Tables'),
    createBullet('5. Inventory Items Catalog (Adding, Editing & Archiving Items)'),
    createBullet('6. Stock Management & FEFO Expiration Batches (Add, Deduct, Adjust)'),
    createBullet('7. Reports Library & Data Exports (Daily Snapshots, Valuation, Movement Audit)'),
    createBullet('8. Real-Time Notification Center (Low Stock & Expiry Alerts)'),
    createBullet('9. Administration & Settings (User Accounts, Roles & Restaurant Profile)'),
    createBullet('10. Troubleshooting & Common Operational Solutions'),
    new Paragraph({ children: [new PageBreak()] })
  );

  // ==========================================
  // SECTION 1: SYSTEM PURPOSE & USER ROLES
  // ==========================================
  content.push(
    createHeading1('1. System Purpose & User Roles'),
    createParagraph('KUVENTORY is a specialized, practical inventory management system engineered to digitize daily stock recording, shift reconciliations, stock intake/deductions, FEFO batch tracking, and audit report generation. It focuses purely on efficient inventory control without unnecessary ERP or accounting bloat.'),
    createHeading2('User Roles in KUVENTORY'),
    createParagraph('KUVENTORY provides two clear user roles with role-based access control (RLS):'),
    createTable(
      ['User Role', 'Primary Responsibilities', 'System Permissions'],
      [
        [
          'User (Staff)',
          'Daily operational inventory recording, shift count verification, sales deductions, stock additions, and reading notifications.',
          'Can access Dashboard, Daily Inventory Worksheet, Items Catalog, Batches (FEFO), Movement History, Reports Library, and Notification Center.'
        ],
        [
          'Admin (Manager)',
          'Complete operational management, staff account creation, role assignment, category/station management, report reopening, and system configuration.',
          'Full access to all areas PLUS User Management, Categories configuration, System Settings, Restaurant Profile, and Global Archival controls.'
        ]
      ]
    ),
    createCallout('IMPORTANT', 'Role Distinction', 'Users focus on daily inventory entry and stock tracking. Admins have additional controls to manage users, reset staff passwords, add/edit categories, and reopen finalized reports.')
  );

  // ==========================================
  // SECTION 2: GETTING STARTED & NAVIGATION
  // ==========================================
  content.push(
    createHeading1('2. Getting Started & Navigation'),
    createHeading2('2.1 Logging In to KUVENTORY'),
    createNumberedStep(1, 'Access the Web Application', 'Open any modern web browser (Google Chrome, Safari, Edge) on your smartphone, tablet, or PC and go to: https://kuventory.netlify.app'),
    createNumberedStep(2, 'Enter Credentials', 'Type your registered Work Email and Password in the login fields.'),
    createNumberedStep(3, 'Sign In', 'Click the "Sign In to KUVENTORY" button. You will be taken directly to the main Dashboard.'),
    createNumberedStep(4, 'Forgot Password', 'If you forgot your password, click "Forgot password?" below the password input. Enter your email to receive an instant secure reset link.'),
    createCallout('TIP', 'Install as an App (PWA)', 'On mobile or tablet, tap the browser menu (or share button) and select "Add to Home Screen" to install KUVENTORY as a high-speed Progressive Web App that opens like a native app.'),

    createHeading2('2.2 Global Navigation & Command Palette'),
    createParagraph('You can navigate KUVENTORY using the sidebar navigation (on desktop/tablet) or the bottom navigation bar (on mobile phones):'),
    createBullet('Dashboard: High-level overview of total inventory value, items count, low-stock alerts, and quick actions.', '•'),
    createBullet('Daily Inventory: The core daily worksheet matching your physical paper count sheets.', '•'),
    createBullet('Items Catalog: Full directory of all inventory items, batches, movement history, and categories.', '•'),
    createBullet('Reports: Historical daily snapshot sheets, stock valuation, and stock movement logs.', '•'),
    createBullet('Notifications: Real-time bell icon with alerts for low stock and expiring items.', '•'),
    createBullet('Settings: Profile, password management, and (for Admins) user management & system settings.', '•'),
    createCallout('TIP', 'Instant Search with Command Palette', 'Press Ctrl + K (or Cmd + K on iPad/Mac) anywhere in the application to summon the Command Palette. Type any item name, category, or page to jump straight to it in one keystroke.')
  );

  // ==========================================
  // SECTION 3: DAILY INVENTORY WORKSHEET
  // ==========================================
  content.push(
    createHeading1('3. Daily Inventory Worksheet (Daily Shift Routine)'),
    createParagraph('The Daily Inventory Worksheet is designed to match the natural layout of a physical paper inventory sheet. It organizes items into dynamic category-driven stations (e.g., Grilled Stock, Portion Stock, Per Cases, Beverages, Snacks).'),
    
    createHeading2('3.1 The 4 Core Mathematical Formulas'),
    createParagraph('KUVENTORY automatically calculates balances in real time so staff never have to perform manual mental math:'),
    createTable(
      ['Column', 'Formula & Rule', 'Explanation'],
      [
        ['BEG (Beginning)', 'Carried from previous day\'s ending stock', 'The unopened/available quantity on shelves at the start of the day.'],
        ['ADD (Stock In)', 'Direct entry or via Add Stock modal', 'Any new deliveries or restocks received during the day.'],
        ['TOTAL (Total Stock)', 'TOTAL = BEG + ADD', 'The total available stock available for sale or preparation today.'],
        ['SALES AM & PM', 'Entered during or after morning/evening shifts', 'Total units consumed, sold, or dispensed during each shift.'],
        ['ENDING (Expected)', 'ENDING = TOTAL - SALES AM - SALES PM', 'The expected remaining physical units that should be on the shelf.'],
        ['DISCREPANCY', 'DISCREPANCY = Physical Count - ENDING', 'Variance between what is physically counted and what the system expects.']
      ]
    ),

    createHeading2('3.2 Step-by-Step Daily Inventory Shift Workflow'),
    createNumberedStep(1, 'Select Date', 'Open "Daily Inventory". Use the date selector at the top to choose today\'s date (defaults to current date).'),
    createNumberedStep(2, 'Check Beginning Quantities (BEG)', 'Verify that the "BEG" column reflects the stock on hand at store opening. If starting a new session, KUVENTORY carries over the finalized ending quantities from the previous day.'),
    createNumberedStep(3, 'Record Incoming Stock (ADD)', 'When a supplier delivery or stock transfer arrives, click the "+" icon beside the item in the ADD column or type the quantity directly. The Total Stock column immediately updates.'),
    createNumberedStep(4, 'Enter Morning Deductions (SALES AM)', 'At the end of the morning rush (around 12:00 PM - 1:00 PM), enter the units consumed into the "SALES AM" column.'),
    createNumberedStep(5, 'Enter Afternoon/Evening Deductions (SALES PM)', 'At the end of the evening rush (around 8:00 PM - 9:00 PM), enter the units consumed into the "SALES PM" column.'),
    createNumberedStep(6, 'Perform Closing Physical Count', 'Count the physical items remaining on shelves and compare with the auto-calculated "ENDING" column. If Ending is negative, it will highlight in red indicating that more units were deducted than were in Total Stock.'),
    createNumberedStep(7, 'Finalize the Shift Worksheet', 'Once all counts are verified, click "Finalize Daily Inventory" at the top right. Confirming this action locks the worksheet into an immutable Daily Report Snapshot for accounting.'),
    createCallout('IMPORTANT', 'Automatic Real-Time Autosave', 'As you type numbers in the worksheet, KUVENTORY automatically saves changes after a 350ms pause. You will see the indicator change to "Saved" with a green checkmark. Your draft is protected even if the page is accidentally closed.')
  );

  // ==========================================
  // SECTION 4: MANAGING STATIONS & CUSTOM CATEGORIES
  // ==========================================
  content.push(
    createHeading1('4. Managing Stations & Custom Category Tables'),
    createParagraph('In KUVENTORY, the Daily Inventory Worksheet is divided into distinct category-driven station tables (such as Grilled Stock, Portion Stock, Per Cases, Beverages, Snacks, or custom stations).'),
    
    createHeading2('4.1 Creating a New Station / Category Table'),
    createNumberedStep(1, 'Click "+ Add Station"', 'At the top of the Daily Inventory page, click the "+ Add Station" button.'),
    createNumberedStep(2, 'Enter Station Name', 'Type the name for your new station (for example: "FROZEN GOODS", "DESSERTS", or "CLEANING SUPPLIES").'),
    createNumberedStep(3, 'Confirm Creation', 'Click "Create Station". A new station table immediately appears in your daily worksheet with its own quick-jump tab and icon.'),

    createHeading2('4.2 Adding an Item Directly to a Station'),
    createNumberedStep(1, 'Locate the Station Header', 'Find the station table where you want the new item to belong.'),
    createNumberedStep(2, 'Click "+ Add Item"', 'Click the small "+ Add Item" button located right inside the station header bar.'),
    createNumberedStep(3, 'Complete Item Details', 'The item creation modal will open with the station category pre-selected. Enter the Item Code, Name, Unit, and Initial Stock, then click "Create Item". The item immediately appears in that station table ready for daily counting.')
  );

  // ==========================================
  // SECTION 5: INVENTORY ITEMS CATALOG
  // ==========================================
  content.push(
    createHeading1('5. Inventory Items Catalog'),
    createParagraph('The Items Catalog (`/items`) is your master database of all products, ingredients, packaging, and raw materials.'),
    
    createHeading2('5.1 Catalog Tabs Overview'),
    createBullet('Items Catalog: Grid and list view of all active inventory items with search, filters, and quick stock updates.', '•'),
    createBullet('Stock Batches (FEFO): Overview of all active batches sorted by expiration date to prevent spoilage.', '•'),
    createBullet('Movement History: Complete chronological transaction log of every addition, deduction, and adjustment.', '•'),
    createBullet('Categories: Manage categories and station assignments.', '•'),
    createBullet('Suppliers: Directory of registered suppliers.', '•'),

    createHeading2('5.2 Adding a New Item to the Catalog'),
    createNumberedStep(1, 'Open Add Modal', 'Navigate to "Items Catalog" and click the "+ Add Item" button at the top right.'),
    createNumberedStep(2, 'Fill Required Fields', 'Provide: Item Code (SKU or barcode), Item Name, Category (Station), and Unit of Measure (pcs, packs, cans, bottles, kg, L).'),
    createNumberedStep(3, 'Set Cost & Safety Threshold', 'Enter the Unit Cost (in PHP) and Minimum Quantity (Min Threshold). If stock drops to or below this number, the system automatically triggers a Low Stock notification.'),
    createNumberedStep(4, 'Suppliers & Initial Stock (Optional)', 'Optionally select primary (Supplier A) and secondary (Supplier B) vendors and enter an Initial Stock quantity to seed opening inventory immediately.'),
    createNumberedStep(5, 'Save Item', 'Click "Create Item". The item is now tracked across the catalog and daily worksheets.'),

    createHeading2('5.3 Editing & Archiving Items'),
    createBullet('Editing: Click the pencil ("Edit") icon on any item row to modify prices, descriptions, units, or safety thresholds.', '•'),
    createBullet('Archiving: Click the "Archive" icon on obsolete or discontinued items. Archived items are hidden from daily inventory but their historical transaction records remain intact.', '•'),
    createBullet('Filter Active vs Archived: Use the status filter dropdown at the top of the catalog to toggle between Active and Archived items.', '•')
  );

  // ==========================================
  // SECTION 6: STOCK MANAGEMENT & FEFO BATCHES
  // ==========================================
  content.push(
    createHeading1('6. Stock Management & FEFO Batches (Add, Deduct, Adjust)'),
    createParagraph('KUVENTORY handles stock changes using Atomic Transactions to guarantee 100% balance integrity without race conditions or lost updates.'),
    
    createHeading2('6.1 Updating Stock via the Stock Modal'),
    createParagraph('On any item card or catalog row, click "Update Stock" (or click the plus/minus icon) to open the Stock Management modal. Choose one of three actions:'),
    createTable(
      ['Action', 'When to Use', 'Required Inputs', 'Resulting System Effect'],
      [
        [
          'ADD (+)',
          'When receiving new shipments, supplier restocks, or transferred goods.',
          'Quantity received, Expiry Date (optional for perishables), and Reason.',
          'Increases current stock balance, creates a new batch with expiration date for FEFO tracking, and records an ADD transaction.'
        ],
        [
          'REMOVE (-)',
          'When recording ingredient consumption, damaged items, or food waste.',
          'Quantity to remove, Batch selection (Auto-FEFO or specific batch), and Reason.',
          'Decreases current stock balance, deducts from the earliest expiring batch first, and records a REMOVE transaction.'
        ],
        [
          'ADJUST (=)',
          'During formal weekly audits or physical recount corrections.',
          'Actual physical counted quantity and Reason (e.g., Weekly Audit Reconciliation).',
          'Overrides current stock balance with the physical count and logs an ADJUST transaction showing previous vs new balance.'
        ]
      ]
    ),

    createHeading2('6.2 How FEFO (First Expire, First Out) Works'),
    createParagraph('FEFO ensures that older and near-expiry stock is prioritized before fresher stock is opened:'),
    createNumberedStep(1, 'Batch Creation', 'Whenever stock is added with an Expiry Date, KUVENTORY generates a distinct batch (e.g., BATCH-A1B2C3).'),
    createNumberedStep(2, 'Automatic Deduction Queue', 'When "REMOVE" is selected with "Auto-FEFO", the system automatically consumes units from the batch with the earliest expiration date.'),
    createNumberedStep(3, 'Expiration Status Badges', 'In the Batches view, items are color-coded:\n• Green: Safe / In Stock (> 30 days remaining)\n• Amber: Expiring Soon (within 30 days)\n• Red: Expired (past expiry date — flagged for immediate quarantine).')
  );

  // ==========================================
  // SECTION 7: REPORTS LIBRARY & EXPORTS
  // ==========================================
  content.push(
    createHeading1('7. Reports Library & Data Exports'),
    createParagraph('The Reports Library (`/reports`) provides centralized visibility into daily operations, financial inventory valuation, and historical audit logs.'),
    
    createHeading2('7.1 Report Types'),
    createBullet('Daily Inventory Sheets: Master list of all finalized daily worksheets. Clicking any report opens its full breakdown with itemized beginning, added, AM/PM usage, and ending totals.', '•'),
    createBullet('Live Stock & Valuation: Instant real-time financial report showing total units on hand, unit acquisition costs, and total inventory value in PHP grouped by category.', '•'),
    createBullet('Stock Movement History: Comprehensive audit trail of every stock addition, deduction, and recount adjustment with user timestamps.', '•'),
    createBullet('Alerts (Low Stock & Expiry): Filterable lists of items that need immediate reordering or perishable batches near their expiration date.', '•'),

    createHeading2('7.2 Exporting Reports (PDF, Excel XLSX, CSV)'),
    createParagraph('When viewing any Daily Report snapshot (`/reports/:id`), use the action buttons in the top toolbar:'),
    createBullet('Export to PDF: Downloads a clean, professional, high-contrast PDF document formatted for standard letter/A4 printing or POS receipt thermal printers.', '•'),
    createBullet('Export to Excel (.xlsx): Downloads a formatted Microsoft Excel spreadsheet with structured columns, headers, and formulas for bookkeeping.', '•'),
    createBullet('Export to CSV: Downloads a comma-separated values file suitable for importing into external business tools.', '•'),
    createBullet('Print: Instantly opens the browser system print dialog for immediate physical printing.', '•'),
    createCallout('IMPORTANT', 'Immutable Snapshots', 'Finalized reports are saved as permanent snapshots. Editing active catalog item names or prices later will NEVER alter past historical reports.')
  );

  // ==========================================
  // SECTION 8: NOTIFICATION CENTER
  // ==========================================
  content.push(
    createHeading1('8. Real-Time Notification Center'),
    createParagraph('The Notification Center (`/notifications`) alerts users to critical inventory events without needing to search through tables:'),
    createTable(
      ['Notification Type', 'Trigger Condition', 'Color Badge', 'Recommended Staff Action'],
      [
        ['LOW STOCK', 'Current stock is at or below the item\'s Minimum Threshold.', 'Amber Badge', 'Place restock order with primary supplier (Supplier A).'],
        ['OUT OF STOCK', 'Current stock reaches 0 units.', 'Red Badge', 'Inform kitchen/bar staff immediately and initiate emergency replenishment.'],
        ['EXPIRING SOON', 'A stock batch is within the warning threshold (e.g. 7-14 days).', 'Amber Badge', 'Prioritize using this batch for today\'s food preparation.'],
        ['EXPIRED', 'A stock batch has passed its Best-Before expiration date.', 'Red Badge', 'Quarantine batch immediately and record under Remove -> Expired.']
      ]
    ),
    createBullet('Mark as Read: Click the checkmark icon on any notification to acknowledge it.', '•'),
    createBullet('Mark All as Read: Click "Mark All Read" at the top right to clear all unread badges at once.', '•')
  );

  // ==========================================
  // SECTION 9: SETTINGS & ADMINISTRATION
  // ==========================================
  content.push(
    createHeading1('9. Administration & Settings (Admins Only)'),
    createParagraph('The Settings area (`/settings`) allows system personalization and administrative staff controls. Admins have access to exclusive management tabs:'),
    
    createHeading2('9.1 Staff & User Management (Admin Only)'),
    createNumberedStep(1, 'View Active Users', 'Navigate to Settings -> "Staff & Users". You will see all registered accounts, their display names, and their roles (ADMIN or USER).'),
    createNumberedStep(2, 'Create New Staff Account', 'Click "+ Add New Staff". Enter their Email, Display Name, Temporary Password, and select their Role (User or Admin).'),
    createNumberedStep(3, 'Change User Roles', 'Use the role selector to switch an existing staff member between "USER" and "ADMIN".'),
    createNumberedStep(4, 'Reset Staff Password', 'If a staff member forgets their password, click "Reset Password" beside their name and input a new secure password for them.'),

    createHeading2('9.2 Establishment & Restaurant Profile (Admin Only)'),
    createParagraph('Under Settings -> "Establishment", Admins can update the store name, contact phone number, address, and upload an official business logo. This branding automatically appears on generated PDF and Excel reports.'),

    createHeading2('9.3 Notification Settings & Thresholds (Admin Only)'),
    createParagraph('Admins can customize system-wide alert triggers:'),
    createBullet('Low Stock Alert: Enable/disable system-wide low stock banners.', '•'),
    createBullet('Batch Expiration Notice: Configure how many days in advance the system warns staff before a batch expires (default: 7 days).', '•')
  );

  // ==========================================
  // SECTION 10: TROUBLESHOOTING & FAQS
  // ==========================================
  content.push(
    createHeading1('10. Troubleshooting & Common Operational Solutions'),
    createTable(
      ['Operational Scenario', 'Likely Cause', 'Corrective Action Steps'],
      [
        [
          'Ending Stock displays negative (highlighted in red)',
          'More units were entered under SALES AM or SALES PM than existed in Total Stock (BEG + ADD).',
          '1. Verify if incoming deliveries were received but not recorded in the ADD column.\n2. Recount physical shelf items.\n3. Check if sales entries were mistyped (e.g. typed 20 instead of 2).'
        ],
        [
          'Worksheet is locked and cannot be edited',
          'The daily worksheet has already been Finalized for this date.',
          'Finalized sheets are locked to prevent tampering. If a correction is required, an Admin can reopen the sheet or make an Adjustment in the Items Catalog.'
        ],
        [
          'Internet connection drops during shift count',
          'Kiosk Wi-Fi fluctuation.',
          'Do NOT refresh or close the browser tab. KUVENTORY caches entries locally. As soon as connectivity returns, changes automatically sync with the cloud.'
        ],
        [
          'Staff member cannot access Admin or Settings tabs',
          'Account is assigned the "USER" role.',
          'User accounts have restricted permissions for security. Contact an Admin to upgrade your role if management access is required.'
        ],
        [
          'Batch expired notification is showing',
          'Stock batch passed its recorded expiry date.',
          'Inspect the physical stock. If expired, remove from service shelves, open "Update Stock", select "Remove", choose "Expired inventory", and deduct the quantity.'
        ]
      ]
    ),
    createParagraph('— End of KUVENTORY User Guide & Operating Manual —', {
      alignment: AlignmentType.CENTER,
      italics: true,
      color: COLOR_MUTED
    })
  );

  // ==========================================
  // COMPILE DOCUMENT
  // ==========================================
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: 'Segoe UI',
            size: 20,
            color: COLOR_TEXT
          },
          paragraph: {
            spacing: { line: 260 }
          }
        }
      }
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              bottom: 1440,
              left: 1440,
              right: 1440
            }
          }
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { after: 120 },
                children: [
                  new TextRun({
                    text: 'KUVENTORY™ User Guide & Operating Manual',
                    size: 16,
                    color: COLOR_MUTED,
                    font: 'Segoe UI'
                  })
                ]
              })
            ]
          })
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: 'Page ',
                    size: 16,
                    color: COLOR_MUTED,
                    font: 'Segoe UI'
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 16,
                    color: COLOR_MUTED,
                    font: 'Segoe UI'
                  }),
                  new TextRun({
                    text: ' of ',
                    size: 16,
                    color: COLOR_MUTED,
                    font: 'Segoe UI'
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    size: 16,
                    color: COLOR_MUTED,
                    font: 'Segoe UI'
                  })
                ]
              })
            ]
          })
        },
        children: content
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  const docxPath = path.join(projectRoot, 'documentations', 'KUVENTORY_USER_GUIDE.docx');
  const rootDocxPath = path.join(projectRoot, 'KUVENTORY_USER_GUIDE.docx');

  fs.writeFileSync(docxPath, buffer);
  fs.writeFileSync(rootDocxPath, buffer);
  console.log(`Word file generated at:\n- ${docxPath}\n- ${rootDocxPath} (${buffer.length} bytes)`);

  return docxPath;
}

generateUserGuideDocx().catch(err => {
  console.error('Failed to generate user guide:', err);
  process.exit(1);
});
