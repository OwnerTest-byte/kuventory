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

// Brand Colors
const COLOR_PRIMARY = '2A1B14';   // Deep Roast Coffee Slate
const COLOR_ACCENT = '8A5A36';    // Warm Caramel Bronze
const COLOR_DARK = '1E293B';      // Charcoal Slate
const COLOR_MUTED = '64748B';     // Cool Gray
const COLOR_LIGHT_BG = 'F8FAFC';  // Crisp Light Neutral
const COLOR_BORDER = 'E2E8F0';    // Subtle Border

// Callout Colors
const CALLOUT_TIP = { border: '16A34A', bg: 'F0FDF4', titleColor: '15803D' };
const CALLOUT_NOTE = { border: '2563EB', bg: 'EFF6FF', titleColor: '1D4ED8' };
const CALLOUT_IMPORTANT = { border: 'D97706', bg: 'FFFBEB', titleColor: 'B45309' };
const CALLOUT_WARNING = { border: 'DC2626', bg: 'FEF2F2', titleColor: 'B91C1C' };

// Styling Helpers
function createHeading1(text) {
  return new Paragraph({
    text: text,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 180 },
    children: [
      new TextRun({
        text: text,
        bold: true,
        size: 32, // 16pt
        color: COLOR_PRIMARY,
        font: 'Segoe UI'
      })
    ]
  });
}

function createHeading2(text) {
  return new Paragraph({
    text: text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 140 },
    children: [
      new TextRun({
        text: text,
        bold: true,
        size: 26, // 13pt
        color: COLOR_ACCENT,
        font: 'Segoe UI'
      })
    ]
  });
}

function createHeading3(text) {
  return new Paragraph({
    text: text,
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 100 },
    children: [
      new TextRun({
        text: text,
        bold: true,
        size: 22, // 11pt
        color: COLOR_DARK,
        font: 'Segoe UI'
      })
    ]
  });
}

function createParagraph(text, options = {}) {
  return new Paragraph({
    spacing: { before: 80, after: 120, line: 276 },
    alignment: options.alignment || AlignmentType.LEFT,
    children: [
      new TextRun({
        text: text,
        size: 20, // 10pt
        color: options.color || COLOR_DARK,
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
    children.push(new TextRun({ text: boldPrefix + ' ', bold: true, size: 20, color: COLOR_DARK, font: 'Segoe UI' }));
  }
  children.push(new TextRun({ text: text, size: 20, color: COLOR_DARK, font: 'Segoe UI' }));

  return new Paragraph({
    bullet: { level: 0 },
    spacing: { before: 60, after: 60, line: 260 },
    children
  });
}

function createNumberedStep(stepNum, stepTitle, stepBody) {
  return new Paragraph({
    spacing: { before: 100, after: 120, line: 260 },
    children: [
      new TextRun({
        text: `Step ${stepNum}: `,
        bold: true,
        size: 20,
        color: COLOR_ACCENT,
        font: 'Segoe UI'
      }),
      new TextRun({
        text: stepTitle + ' — ',
        bold: true,
        size: 20,
        color: COLOR_PRIMARY,
        font: 'Segoe UI'
      }),
      new TextRun({
        text: stepBody,
        size: 20,
        color: COLOR_DARK,
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
    spacing: { before: 140, after: 160 },
    border: {
      left: { style: BorderStyle.SINGLE, size: 28, color: cfg.border, space: 14 }
    },
    shading: {
      type: ShadingType.CLEAR,
      fill: cfg.bg
    },
    children: [
      new TextRun({
        text: `[${type}] ${title}: `,
        bold: true,
        size: 20,
        color: cfg.titleColor,
        font: 'Segoe UI'
      }),
      new TextRun({
        text: text,
        size: 19,
        color: COLOR_DARK,
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
          margins: { top: 120, bottom: 120, left: 140, right: 140 },
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
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
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
                    color: COLOR_DARK,
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

async function buildUserDocumentation() {
  console.log('Generating KUVENTORY User Documentation (Word .docx)...');

  // Load Logo
  const logoPath = path.join(projectRoot, 'public', 'logo-original.png');
  let logoBuffer = null;
  if (fs.existsSync(logoPath)) {
    logoBuffer = fs.readFileSync(logoPath);
  }

  const sections = [];

  // ==========================================
  // SECTION 1: COVER PAGE
  // ==========================================
  const coverChildren = [];

  if (logoBuffer) {
    coverChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 800, after: 300 },
        children: [
          new ImageRun({
            data: logoBuffer,
            transformation: { width: 140, height: 140 }
          })
        ]
      })
    );
  }

  coverChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 100 },
      children: [
        new TextRun({
          text: 'KUVENTORY™',
          bold: true,
          size: 56, // 28pt
          color: COLOR_PRIMARY,
          font: 'Segoe UI'
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 60, after: 200 },
      children: [
        new TextRun({
          text: 'COMMERCIAL INVENTORY & FEFO MANAGEMENT SYSTEM',
          bold: true,
          size: 24, // 12pt
          color: COLOR_ACCENT,
          font: 'Segoe UI'
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 100, after: 400 },
      children: [
        new TextRun({
          text: 'Official User Operating Manual & Standard Operating Procedures (SOP)',
          italics: true,
          size: 22,
          color: COLOR_MUTED,
          font: 'Segoe UI'
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 800, after: 100 },
      children: [
        new TextRun({
          text: 'Prepared for: Kape Uno Bistro Operations & Central Bodega',
          bold: true,
          size: 20,
          color: COLOR_DARK,
          font: 'Segoe UI'
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 40, after: 80 },
      children: [
        new TextRun({
          text: 'Target Audience: Store Crew, Baristas, Bodega Custodians & Branch Supervisors',
          size: 18,
          color: COLOR_MUTED,
          font: 'Segoe UI'
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 40, after: 80 },
      children: [
        new TextRun({
          text: 'Production URL: https://kuventory.netlify.app | Version 2.4.0 (Enterprise Release)',
          size: 18,
          color: COLOR_MUTED,
          font: 'Segoe UI'
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 40, after: 200 },
      children: [
        new TextRun({
          text: 'Effective Date: September 2026 | Document Reference: KUV-SOP-MANUAL-2026-V2.4',
          size: 18,
          color: COLOR_MUTED,
          font: 'Segoe UI'
        })
      ]
    }),
    new Paragraph({ children: [new PageBreak()] })
  );

  // ==========================================
  // SECTION 2: DOCUMENT CONTROL & REVISIONS
  // ==========================================
  coverChildren.push(
    createHeading1('Document Control & Governance'),
    createParagraph('This operational manual establishes the mandatory standard operating procedures and software interaction protocols for all restaurant crew, warehouse custodians, and management personnel operating the KUVENTORY system at Kape Uno Bistro.'),
    createTable(
      ['Document Property', 'Specification Details'],
      [
        ['System Title', 'KUVENTORY Commercial Inventory & FEFO Management Platform'],
        ['Production Environment', 'https://kuventory.netlify.app'],
        ['Document Classification', 'Commercial Standard Operating Procedure (Confidential / Internal)'],
        ['Document Owner', 'Kape Uno Bistro Quality Assurance & Inventory Operations'],
        ['Current Revision', 'Version 2.4.0 (Stable Production Release)'],
        ['Effective Release Date', 'September 2026'],
        ['Review Cadence', 'Bi-Monthly or upon major feature rollouts']
      ]
    ),
    createHeading2('Document Revision History'),
    createTable(
      ['Version', 'Release Date', 'Author / Role', 'Summary of Changes'],
      [
        ['1.0.0', 'Jan 2026', 'Lead Architect', 'Initial release: Basic master item catalog and single-count shift logs.'],
        ['2.0.0', 'May 2026', 'Systems Team', 'Engine upgrade: FEFO batch tracking, barcode scanning, Supabase sync.'],
        ['2.3.0', 'Aug 2026', 'Full-Stack Team', 'Station/Category unification, mobile card layouts, and offline autosave.'],
        ['2.4.0', 'Sep 2026', 'QA & Documentation', 'Comprehensive SOP User Manual authored per TechSmith Documentation Standards.']
      ]
    ),
    new Paragraph({ children: [new PageBreak()] })
  );

  // ==========================================
  // SECTION 3: TECHSMITH FRAMEWORK ANALYSIS
  // ==========================================
  coverChildren.push(
    createHeading1('1. Analysis of TechSmith User Documentation Framework'),
    createParagraph('Per TechSmith’s industry-standard manual engineering principles (TechSmith User Documentation Guide), effective user documentation transforms complex technical software into an intuitive, frictionless daily utility. The core tenets analyzed and implemented in this manual are structured below:'),
    createHeading2('1.1 Definition & Nature of a Commercial User Manual'),
    createParagraph('TechSmith explicitly establishes that a user manual is NOT a novel or a technical design whitepaper. Instead, it functions as a fast, task-oriented reference guide designed for immediate action. Users do not read manuals from front to back; they consult them under pressure when executing a task or diagnosing an operational hurdle. Therefore, three architectural pillars must anchor the manual:'),
    createBullet('Table of Contents & Modular Numbering: Immediate navigation to exact workflows.', 'Structural Anchor:'),
    createBullet('5-Minute Quick-Start Guide: Enables rapid onboarding without cognitive overload.', 'Operational Anchor:'),
    createBullet('Troubleshooting & Emergency Playbooks: Provides instant remediation for real-world kiosk errors.', 'Diagnostic Anchor:'),

    createHeading2('1.2 The Seven Standard Manual Types (Contextualized to KUVENTORY)'),
    createTable(
      ['Manual Type', 'TechSmith Definition', 'KUVENTORY Implementation'],
      [
        ['Instruction Manual', 'Step-by-step how-to guide for common tasks.', 'Daily Worksheet logging, AM/PM usage input, mobile card view navigation.'],
        ['Training Manual', 'Comprehensive curriculum for onboarding new hires.', '5-Minute onboarding guide for incoming baristas and kitchen crew.'],
        ['Service Manual', 'Technical diagnostic and maintenance protocols.', 'Supabase connection status checks, offline cache reset, PWA cache management.'],
        ['Operation Manual', 'Day-to-day continuous operating procedures.', 'Opening stock audit, shift handover counts, closing store reconciliations.'],
        ['Organizational Policy', 'High-level business rules and compliance standards.', 'FEFO rotation compliance, mandatory photo uploads for damaged stock.'],
        ['SOP Manual', 'Rigid, audit-compliant procedural recipes.', 'Formal SOPs 01 through 05 covering intake, deductions, and variance audits.'],
        ['Quick Reference Guide', 'Cheat sheet of hotkeys, formulas, and keys.', 'Command Palette (Ctrl+K) cheat sheet and inventory balance formula card.']
      ]
    ),

    createHeading2('1.3 The 8 Essential Elements of a Great Manual Applied to KUVENTORY'),
    createNumberedStep(1, 'Plain Language', 'Avoid engineering jargon (e.g., "PostgreSQL RPC transaction lock") in favor of clear commercial action words (e.g., "Saved shift count", "Batch expiration date").'),
    createNumberedStep(2, 'Simplicity & Chunking', 'Break operational flows into discrete numbered steps (1, 2, 3) limited to one distinct action per sentence.'),
    createNumberedStep(3, 'Visuals & Field Dictionaries', 'Support procedural steps with exact button names, color badges, and explicit input field definitions.'),
    createNumberedStep(4, 'Problem-Solving Focus', 'Organize modules around frontline problems ("How to log a spilled syrup bottle", "What to do when physical count is lower than expected").'),
    createNumberedStep(5, 'Logical Hierarchy & Flow', 'Chronological journey matching a physical restaurant shift: Morning Opening -> Afternoon Intake -> Evening Reconcile -> Management Audit.'),
    createNumberedStep(6, 'Accessibility & Legibility', 'High-contrast typography (Dark Roast Slate #2A1B14 on Light Neutral #F8FAFC), minimum 18pt/20pt font sizes, and clear status keys.'),
    createNumberedStep(7, 'Cohesive Design & Brand Tokens', 'Consistent visual tokens matching Kape Uno Bistro aesthetics: Coffee Slate, Bronze Amber, and clear warning borders.'),
    createNumberedStep(8, 'Continuous User Feedback Loop', 'Structured feedback mechanism for crew members to submit clarity improvements directly to the store operations manager.'),

    new Paragraph({ children: [new PageBreak()] })
  );

  // ==========================================
  // SECTION 4: USER PERSONAS & ACCESS MATRIX
  // ==========================================
  coverChildren.push(
    createHeading1('2. User Personas & Role-Based Access Control (RBAC)'),
    createParagraph('KUVENTORY accommodates four distinct operational personas within the restaurant ecosystem:'),
    createHeading2('2.1 Persona Profiles'),
    createBullet('Stationed at the front coffee bar or kitchen. Primary responsibilities include recording morning opening checks, logging AM/PM ingredient deductions, reporting damaged items, and inputting evening physical counts.', 'Persona A: Frontline Crew / Barista —'),
    createBullet('Stationed in the back stockroom or central warehouse. Responsible for receiving wholesale supplier shipments, inspecting expiration dates, generating FEFO batch labels, and executing bodega stock-in.', 'Persona B: Bodega Custodian —'),
    createBullet('Oversees restaurant shifts and kiosk operations. Reviews real-time discrepancy variances, approves waste write-offs, executes daily snapshot locks, and exports accounting reports.', 'Persona C: Shift Supervisor / Branch Manager —'),
    createBullet('Configures system stations, assigns user accounts and roles, manages master catalog pricing, audits security logs, and manages database backups.', 'Persona D: System Administrator —'),

    createHeading2('2.2 Role-Based Access Control (RBAC) Permission Matrix'),
    createTable(
      ['Functional Module', 'Store Crew', 'Bodega Custodian', 'Supervisor / Manager', 'System Admin'],
      [
        ['Daily Worksheet Entry (AM/PM Usage)', 'Full Access', 'View Only', 'Full Access', 'Full Access'],
        ['Physical Ending Stock Count Input', 'Full Access', 'View Only', 'Full Access & Override', 'Full Access'],
        ['Stock-In & FEFO Batch Tagging', 'Restricted', 'Full Access', 'Full Access', 'Full Access'],
        ['Waste & Spoilage Write-Off Logging', 'Submit Only', 'Submit Only', 'Approve & Finalize', 'Full Access'],
        ['Daily Shift Snapshot Creation', 'No Access', 'No Access', 'Full Access', 'Full Access'],
        ['Master Catalog Edit & Pricing', 'View Only', 'View Only', 'Restricted Edit', 'Full Access'],
        ['Category & Station Customization', 'No Access', 'No Access', 'Full Access', 'Full Access'],
        ['Export Reports (PDF / Excel XLSX)', 'No Access', 'No Access', 'Full Access', 'Full Access'],
        ['User Account & Password Admin', 'No Access', 'No Access', 'No Access', 'Full Access']
      ]
    ),
    createCallout('IMPORTANT', 'Role Separation Policy', 'Crew members must never share login credentials. High-value stock adjustments and waste disposals exceeding 500 PHP strictly require Supervisor PIN or managerial sign-off.')
  );

  // ==========================================
  // SECTION 5: 5-MINUTE QUICK-START GUIDE
  // ==========================================
  coverChildren.push(
    createHeading1('3. 5-Minute Quick-Start Guide (Frontline Onboarding)'),
    createParagraph('Follow these four chronological steps to run your daily shift on KUVENTORY in under 5 minutes:'),
    createNumberedStep(1, 'Launch & Authenticate', 'Open Google Chrome or Safari on the kiosk tablet or smartphone. Navigate to https://kuventory.netlify.app. Enter your assigned Work Email and Password, then click "Sign In to KUVENTORY". (Tip: Click "Add to Home Screen" to install the app as a zero-latency PWA).'),
    createNumberedStep(2, 'Morning Station Inspection', 'From the navigation sidebar or bottom mobile bar, tap "Daily Inventory". Select your current operating station tab (e.g., "Bar Station" or "Kitchen"). Verify that the "Beginning Stock" column matches the unopened physical items on your shelves. If there is a discrepancy from yesterday’s close, notify your supervisor immediately.'),
    createNumberedStep(3, 'Log Shift Deductions', 'During or immediately following peak rush hours (11:00 AM and 5:00 PM), input items used or dispensed in the "AM Deductions" or "PM Deductions" fields. The system automatically calculates your expected remaining stock in real time.'),
    createNumberedStep(4, 'Shift Closing Physical Count', 'At shift closing (9:30 PM), count all physical units on the station shelves and enter the values into the "Physical Count" column. The system will instantly highlight variances in Green (Exact/Surplus) or Red (Shortage). Tap "Save Shift Worksheet" to finalize your shift records.'),
    createCallout('TIP', 'Speed Hotkey', 'Press Ctrl + K (or Cmd + K on iPad/Mac) anywhere in the application to summon the Command Palette. Type any product name, station, or action to jump directly to it without clicking multiple menus.')
  );

  // ==========================================
  // SECTION 6: STANDARD OPERATING PROCEDURES (SOPs)
  // ==========================================
  coverChildren.push(
    createHeading1('4. Standard Operating Procedures (SOP Manual)'),
    createParagraph('Standard Operating Procedures are mandatory protocols designed to maintain 100% data integrity, eliminate inventory shrinkage, and comply with commercial food safety regulations.'),

    createHeading2('SOP-01: Shift Opening & Initial Count Verification'),
    createBullet('Ensure the kiosk tablet is placed on its charging dock and connected to the bistro Wi-Fi network.', 'Step 1 (Hardware):'),
    createBullet('Sign into KUVENTORY and tap the "Daily Inventory" module.', 'Step 2 (Login):'),
    createBullet('Select the "Bar Station" tab. Conduct a rapid 2-minute visual check of the top 5 high-turnover ingredients (Whole Milk, Espresso Beans, Caramel Syrup, Vanilla Syrup, Paper Cups).', 'Step 3 (Spot Audit):'),
    createBullet('Confirm that physical containers match the "Beginning Stock" numbers shown on the screen.', 'Step 4 (Verification):'),
    createBullet('If beginning numbers are incorrect, do NOT alter them. Tap "Add Shift Note" and flag the variance for the opening supervisor.', 'Step 5 (Variance Flag):'),

    createHeading2('SOP-02: Receiving Goods & FEFO Batch Tagging (Stock-In)'),
    createParagraph('All incoming supplier deliveries must be processed via the Bodega Stock-In module before items are moved to active service shelves:'),
    createBullet('Unload shipment crates onto the receiving counter. Match the physical packages against the delivery receipt (DR) and supplier invoice.', 'Step 1 (Physical Inspection):'),
    createBullet('Examine packaging integrity. Reject any crushed cartons, unsealed milk jugs, or compromised foil bags.', 'Step 2 (Quality Inspection):'),
    createBullet('Open KUVENTORY and select "Stock-In". Click "New Stock-In Batch".', 'Step 3 (System Entry):'),
    createBullet('Select the item from the catalog dropdown. Enter the Quantity Received and Unit Purchase Cost.', 'Step 4 (Data Entry):'),
    createBullet('Input the Manufacturer Batch Number and Best-Before Expiration Date from the product label.', 'Step 5 (FEFO Tagging):'),
    createBullet('Affix a physical KUVENTORY color sticker indicating the expiration month. Place the new stock BEHIND existing older inventory on the shelves (strict FEFO rotation).', 'Step 6 (Physical Placement):'),
    createCallout('IMPORTANT', 'The FEFO Golden Rule', 'First-Expired, First-Out (FEFO) is strictly enforced. The batch with the nearest expiration date MUST always be consumed first, regardless of when it arrived at the store.'),

    createHeading2('SOP-03: Real-Time Shift Deductions (AM & PM Service)'),
    createBullet('At the conclusion of the morning peak rush (12:00 PM), baristas enter total milk gallons opened and syrup bottles transferred into the "AM Deductions" cell.', 'Timing:'),
    createBullet('At the conclusion of the evening peak rush (6:00 PM), staff enter afternoon quantities into the "PM Deductions" cell.', 'Afternoon Entry:'),
    createBullet('Always enter quantities in the designated Unit of Measure (e.g., Bottles, Gallons, Packs). Never enter partial decimals unless the unit specifies Liters or Kilograms.', 'Precision:'),

    createHeading2('SOP-04: Spoilage, Damage, and Spill Disposal Logging'),
    createParagraph('Every unit of stock removed from inventory due to spoilage, expiration, dropped containers, or incorrect recipe calibration must be recorded as Waste:'),
    createBullet('Do NOT simply discard broken or spoiled items in the trash without logging them.', 'Step 1 (Immediate Stop):'),
    createBullet('In KUVENTORY Daily Inventory, locate the damaged item row and tap the "Log Waste / Spoilage" button.', 'Step 2 (Locate Row):'),
    createBullet('Input the exact quantity lost and select the reason: "Accidental Drop / Spill", "Customer Remake", "Expired Past Best-Before", or "Defective Seal".', 'Step 3 (Categorize):'),
    createBullet('For losses exceeding 200 PHP in value, take a quick photo using the tablet camera and attach it to the waste ticket.', 'Step 4 (Photo Evidence):'),
    createBullet('Supervisor reviews and signs off on the waste ticket during the shift closing audit.', 'Step 5 (Sign-Off):'),

    createHeading2('SOP-05: Evening Closing Physical Count & Discrepancy Reconciliation'),
    createParagraph('Shift closing counts determine the financial and material balance of the store:'),
    createBullet('30 minutes prior to store close, begin counting sealed back-stock items.', 'Step 1 (Pre-Close Count):'),
    createBullet('At closing time, conduct a complete count of all opened and unopened units at each station.', 'Step 2 (Active Shelf Count):'),
    createBullet('Input the numbers directly into the "Physical Count" column on the Daily Worksheet.', 'Step 3 (Input):'),
    createBullet('Observe the auto-calculated Discrepancy column. If any red badge appears (shortage > 1 unit):', 'Step 4 (Variance Check):'),
    createBullet('a) Recount the physical shelf and verify undercounter cabinets.', 'Check A:'),
    createBullet('b) Check if any waste was thrown away during the rush without being recorded.', 'Check B:'),
    createBullet('c) Check if items were transferred to another station (e.g., milk borrowed by Kitchen).', 'Check C:'),
    createBullet('Once verified, the Shift Supervisor taps "Finalize Daily Shift & Create Snapshot". This locks the day’s ledger and prepares tomorrow’s beginning stock.', 'Step 5 (Lock & Archive):'),

    new Paragraph({ children: [new PageBreak()] })
  );

  // ==========================================
  // SECTION 7: DETAILED MODULE MANUAL
  // ==========================================
  coverChildren.push(
    createHeading1('5. Detailed Functional Module Guides'),
    createParagraph('This section provides comprehensive instructions for every major screen and feature inside KUVENTORY.'),

    createHeading2('5.1 Master Catalog & Categories / Stations Management'),
    createParagraph('The Master Catalog is the central database of all sellable goods, raw ingredients, packaging, and operating supplies.'),
    createBullet('Navigate to "Master Catalog". Use the search bar to find items by name, SKU, or Barcode.', 'Search & Filtering:'),
    createBullet('Click the Station Filter buttons (All, Bar, Kitchen, Bodega, Storage, Dining) to isolate station-specific stock.', 'Station Filters:'),
    createBullet('Click "+ Add New Item". Fill in Item Name, Category, Primary Station, Base Unit of Measure (UOM), Minimum Safe Reorder Threshold, and Unit Cost.', 'Adding Items:'),
    createBullet('KUVENTORY supports dual photo uploads (Front Pack & Barcode / Nutrition Tag). Images are automatically compressed client-side to lightweight WebP format to prevent storage bloat and ensure sub-second mobile loading.', 'Dual Photo Attachment:'),

    createHeading2('5.2 Daily Inventory Shift Worksheet'),
    createParagraph('The Daily Worksheet is the core operational cockpit used during every working shift.'),
    createBullet('On desktop computers, use the high-density Table View. On tablets and mobile phones, toggle the "Card View" switch for an ergonomic, finger-friendly touch layout.', 'Table vs. Card View:'),
    createBullet('Every cell edit is automatically sent to the server with an intelligent 500ms debounce. Watch the top-right status indicator: "Saving..." turns to a green checkmark "All Changes Saved". Even if your Wi-Fi flickers, your work is stored safely in local browser memory.', 'Autosave Indicator:'),
    createBullet('Columns: [Item Name] | [Beginning Stock] | [Stock-In] | [AM Use] | [PM Use] | [Waste] | [Expected Ending] | [Physical Count] | [Discrepancy] | [Status].', 'Column Layout:'),

    createHeading2('5.3 Stock-In & FEFO Batch Expiration Engine'),
    createParagraph('KUVENTORY’s FEFO engine actively monitors expiration dates across all batches to eliminate inventory waste.'),
    createBullet('Green Badge (> 30 Days Remaining): Fresh stock; safe for standard storage.', 'Batch Status Levels:'),
    createBullet('Yellow Badge (8 - 30 Days Remaining): Attention required; prioritize for immediate daily preparation.', 'Moderate Warning:'),
    createBullet('Orange Badge (1 - 7 Days Remaining): High priority! Must be consumed within the current week.', 'Urgent Expiration:'),
    createBullet('Red Flashing Badge (0 Days / Expired): Immediate quarantine! Item must not be served under any circumstances.', 'Expired Alert:'),

    createHeading2('5.4 Inventory Snapshots & Audit Reports'),
    createParagraph('Managers can generate permanent, tamper-proof snapshots of daily counts for accounting and payroll reconciliation.'),
    createBullet('In the Reports module, choose between Today, Yesterday, This Week, This Month, or Custom Date Range.', 'Date Filtering:'),
    createBullet('Generate a clean, high-contrast, black-and-white PDF document formatted for kiosk receipt printers or standard A4 paper.', 'PDF Export:'),
    createBullet('Generate a structured Microsoft Excel (.xlsx) file complete with formula columns, category groupings, and unit costs for corporate bookkeeping.', 'Excel Export:'),

    new Paragraph({ children: [new PageBreak()] })
  );

  // ==========================================
  // SECTION 8: MATHEMATICAL INVENTORY FORMULA & DATA DICTIONARY
  // ==========================================
  coverChildren.push(
    createHeading1('6. Mathematical Equilibrium Formula & Data Dictionary'),
    createParagraph('KUVENTORY operates on a closed-loop mass-balance mathematical equation. Understanding this formula ensures complete clarity during shift reconciliation:'),

    createHeading2('6.1 The Core Inventory Formula'),
    createTable(
      ['Equation Component', 'Mathematical Definition', 'Practical Example (Caramel Syrup)'],
      [
        ['Beginning Stock (B)', 'Physical units available at 6:00 AM shift start.', '10 Bottles'],
        ['+ Stock In (I)', 'Units received from supplier delivery during the shift.', '+ 5 Bottles received from Bodega'],
        ['- AM Deductions (D1)', 'Units consumed during morning service (6:00 AM - 1:00 PM).', '- 3 Bottles consumed'],
        ['- PM Deductions (D2)', 'Units consumed during afternoon/evening service (1:00 PM - 9:00 PM).', '- 4 Bottles consumed'],
        ['- Waste / Spoilage (W)', 'Units broken, spilled, or discarded.', '- 1 Bottle dropped and broken'],
        ['= Expected Ending (E)', 'Calculated: E = B + I - D1 - D2 - W', '= 7 Bottles expected on the shelf'],
        ['Ending Physical Count (P)', 'Actual physical units counted at 9:30 PM shift close.', '6 Bottles counted by barista'],
        ['= Discrepancy Variance (V)', 'Calculated: V = P - E', '6 - 7 = -1 Bottle Shortage (Red Alert)']
      ]
    ),

    createHeading2('6.2 Comprehensive Data Field Dictionary'),
    createTable(
      ['Field Identifier', 'Data Type', 'Description & Business Rules', 'Example Value'],
      [
        ['item_name', 'String (Max 100)', 'Official commercial name of the inventory item.', 'Whole Dairy Milk 1L'],
        ['sku', 'String (Alphanumeric)', 'Stock Keeping Unit unique barcode or catalog code.', 'BEV-MILK-001'],
        ['station', 'Enum / String', 'Assigned workstation (Bar, Kitchen, Bodega, Storage).', 'Bar Station'],
        ['unit_of_measure', 'Enum', 'Unit in which counts are recorded (Bottle, Can, Pack, Kg, L).', 'Bottle'],
        ['min_threshold', 'Integer (>= 0)', 'Minimum safe inventory before Low Stock warning triggers.', '5'],
        ['unit_cost', 'Decimal (PHP)', 'Standard wholesale acquisition cost per single unit.', '85.50'],
        ['beginning_stock', 'Integer / Decimal', 'Units on hand at the start of the operating cycle.', '12'],
        ['stock_in', 'Integer / Decimal', 'Sum of all verified intake batches received today.', '24'],
        ['am_deductions', 'Integer / Decimal', 'Stock consumed during morning operating hours.', '8'],
        ['pm_deductions', 'Integer / Decimal', 'Stock consumed during evening operating hours.', '10'],
        ['waste_quantity', 'Integer / Decimal', 'Damaged, spoiled, or expired units removed from stock.', '1'],
        ['expected_stock', 'Computed', 'Mathematical remaining balance: (B + I - D1 - D2 - W).', '17'],
        ['physical_count', 'Integer / Decimal', 'Actual manual count entered by closing crew.', '17'],
        ['discrepancy', 'Computed', 'Variance between Physical Count and Expected Stock (P - E).', '0 (Balanced)']
      ]
    ),

    new Paragraph({ children: [new PageBreak()] })
  );

  // ==========================================
  // SECTION 9: TROUBLESHOOTING & EDGE-CASE PLAYBOOK
  // ==========================================
  coverChildren.push(
    createHeading1('7. Troubleshooting, Edge Cases & Error Playbook'),
    createParagraph('When operational hiccups occur during a busy shift, consult this troubleshooting matrix for immediate resolution:'),

    createHeading2('Issue 1: Red Discrepancy Alert (Shortage / Negative Variance)'),
    createBullet('Problem: Physical Count is lower than Expected Stock (e.g., Discrepancy = -2 Bottles).', 'Symptom:'),
    createBullet('1. Recount shelf: Check behind other bottles and undercounter cold storage.\n2. Verify Waste: Did someone spill a bottle without logging it? If so, tap "Log Waste" and record it.\n3. Verify Deductions: Check if morning or afternoon deductions were recorded accurately.\n4. Check Inter-Station Borrowing: Did Kitchen borrow 2 bottles from Bar without recording it?\n5. If unresolved, submit the count with a mandatory discrepancy explanation note.', 'Action Steps:'),

    createHeading2('Issue 2: Yellow Discrepancy Alert (Surplus / Positive Variance)'),
    createBullet('Problem: Physical Count is higher than Expected Stock (e.g., Discrepancy = +3 Units).', 'Symptom:'),
    createBullet('1. Verify Stock-In: Was a delivery placed directly on shelves without logging Stock-In?\n2. Check Previous Day’s Beginning Stock: Was yesterday’s ending count entered incorrectly?\n3. Ensure units are not counted twice (e.g., counting both cases and individual loose bottles).', 'Action Steps:'),

    createHeading2('Issue 3: "Network Offline" Alert Banner Appears'),
    createBullet('Problem: Tablet loses internet connectivity during mid-shift rush.', 'Symptom:'),
    createBullet('1. DO NOT close or refresh your browser tab. KUVENTORY operates offline-first using local browser cache.\n2. Continue entering deductions and physical counts normally. The app will queue your changes safely.\n3. Once Wi-Fi reconnects, the status badge will automatically turn green and sync all pending entries to the cloud.', 'Action Steps:'),

    createHeading2('Issue 4: Mobile Camera / Image Upload Fails'),
    createBullet('Problem: Tapping "Upload Photo" does not trigger the camera or displays an upload error.', 'Symptom:'),
    createBullet('1. Check browser permissions: Tap the lock icon in the browser address bar and verify that Camera and Storage permissions are set to "Allow".\n2. Image compression: KUVENTORY automatically resizes photos. If the phone is low on memory, close background apps and retry.', 'Action Steps:'),

    createHeading2('Issue 5: Staff Member Forgot Login Password'),
    createBullet('Problem: Barista is locked out of the kiosk terminal before shift opening.', 'Symptom:'),
    createBullet('1. Shift Supervisor can log in using their supervisor PIN or manager credentials.\n2. Tap "Settings" -> "User Management" -> Locate user account -> Click "Trigger Password Reset Link".\n3. An instant reset link will be sent to the staff member’s registered email.', 'Action Steps:'),

    createCallout('WARNING', 'Security Directive', 'Never write passwords or manager PINs on sticky notes attached to the kiosk screen or cash drawer. Doing so violates store security audit standards.')
  );

  // ==========================================
  // SECTION 10: HYGIENE, HARDWARE & BEST PRACTICES
  // ==========================================
  coverChildren.push(
    createHeading1('8. Hardware Care, Hygiene & Commercial Best Practices'),
    createHeading2('8.1 Food Service Tablet Sanitation Guidelines'),
    createBullet('Sanitize the tablet screen twice daily (shift opening and shift closing) using an alcohol-free 70% isopropyl wipe. Never spray liquid cleaners directly onto the screen.', 'Screen Cleaning:'),
    createBullet('Ensure baristas dry their hands before tapping the touch screen. Liquid syrup or water droplets on capacitive screens cause phantom touches and erratic typing.', 'Moisture Control:'),
    createBullet('Ensure the kiosk stand is secured to the counter away from high-heat espresso groupheads and steam wands.', 'Thermal Protection:'),

    createHeading2('8.2 Continuous Documentation Feedback Protocol'),
    createParagraph('Per TechSmith’s 8th essential manual element ("The Feedback Loop"), this manual is a living document. Frontline crew members are encouraged to submit recommendations for confusing workflows or layout friction:'),
    createBullet('Submit feedback directly to your shift supervisor or send an email to operations@kapeunobistro.com with subject: "[KUVENTORY-FEEDBACK]". Include screenshot and description.', 'How to Submit:'),
    createBullet('All suggestions are reviewed monthly by the QA & Systems engineering team for potential software updates and manual revisions.', 'Review Cadence:'),

    createHeading2('8.3 Glossary of Commercial Terms'),
    createTable(
      ['Term', 'Plain-Language Commercial Definition'],
      [
        ['FEFO', 'First-Expired, First-Out: Inventory management principle where items with the nearest expiration date are displayed and used first.'],
        ['SKU', 'Stock Keeping Unit: Unique alphanumeric identifier assigned to each product variation for tracking.'],
        ['Discrepancy (Variance)', 'Difference between what the computer says should be on the shelf and what is physically counted.'],
        ['Safety Stock (Min Threshold)', 'The minimum buffer quantity of an ingredient required before a reorder warning is triggered.'],
        ['Inventory Snapshot', 'A locked, unalterable historical record of a shift’s inventory counts, costs, and variances at a specific timestamp.'],
        ['UOM', 'Unit of Measure: The standard measurement scale for an item (e.g., Bottle, Can, Carton, Gallon, Pack, Kilogram).'],
        ['Bodega', 'The central back-of-house storage warehouse or bulk stockroom where wholesale crates are received and stored.'],
        ['Shrinkage', 'Unexplained loss of inventory due to theft, unrecorded spills, over-portioning, or administrative counting errors.']
      ]
    ),
    createParagraph('— End of Official User Documentation Manual —', { alignment: AlignmentType.CENTER, italics: true, color: COLOR_MUTED })
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
            color: COLOR_DARK
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
              top: 1440,    // 1 inch
              bottom: 1440, // 1 inch
              left: 1440,   // 1 inch
              right: 1440   // 1 inch
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
                    text: 'KUVENTORY™ Operational User Manual | Kape Uno Bistro',
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
                  }),
                  new TextRun({
                    text: ' | Confidential - For Internal Operational Use Only',
                    size: 16,
                    color: COLOR_MUTED,
                    font: 'Segoe UI'
                  })
                ]
              })
            ]
          })
        },
        children: coverChildren
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  const outputPath = path.join(projectRoot, 'documentations', 'KUVENTORY_USER_DOCUMENTATION_MANUAL.docx');
  fs.writeFileSync(outputPath, buffer);
  console.log(`Word file successfully generated at: ${outputPath} (${buffer.length} bytes)`);

  return outputPath;
}

buildUserDocumentation().catch(err => {
  console.error('Error generating documentation:', err);
  process.exit(1);
});
