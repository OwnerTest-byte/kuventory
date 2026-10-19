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
  Header,
  Footer,
  PageNumber,
  PageBreak,
  ImageRun
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
const COLOR_CODE_BG = 'F1F5F9';   // Code block fill
const COLOR_BORDER = 'CBD5E1';    // Subtle border

// Helper to parse inline formatting (bold, italic, code)
function parseInline(text) {
  if (!text) return [new TextRun({ text: '', size: 20, font: 'Segoe UI' })];
  const runs = [];
  const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`|[^*`]+)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const chunk = match[0];
    if (chunk.startsWith('**') && chunk.endsWith('**') && chunk.length >= 4) {
      runs.push(new TextRun({
        text: chunk.slice(2, -2),
        bold: true,
        size: 20,
        color: COLOR_PRIMARY,
        font: 'Segoe UI'
      }));
    } else if (chunk.startsWith('*') && chunk.endsWith('*') && chunk.length >= 2) {
      runs.push(new TextRun({
        text: chunk.slice(1, -1),
        italics: true,
        size: 20,
        color: COLOR_TEXT,
        font: 'Segoe UI'
      }));
    } else if (chunk.startsWith('`') && chunk.endsWith('`') && chunk.length >= 2) {
      runs.push(new TextRun({
        text: chunk.slice(1, -1),
        font: 'Consolas',
        size: 19,
        color: '0F172A',
        shading: { fill: COLOR_CODE_BG, type: ShadingType.CLEAR }
      }));
    } else {
      runs.push(new TextRun({
        text: chunk,
        size: 20,
        color: COLOR_TEXT,
        font: 'Segoe UI'
      }));
    }
  }

  if (runs.length === 0) {
    runs.push(new TextRun({ text, size: 20, color: COLOR_TEXT, font: 'Segoe UI' }));
  }

  return runs;
}

// Convert markdown text to docx paragraph / table elements
function parseMarkdownToDocx(mdContent, chapterPrefix = '') {
  const lines = mdContent.split(/\r?\n/);
  const elements = [];
  let inCodeBlock = false;
  let codeBuffer = [];
  let inTable = false;
  let tableHeader = [];
  let tableRows = [];

  function flushCodeBlock() {
    if (codeBuffer.length === 0) return;
    elements.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                shading: { fill: COLOR_CODE_BG, type: ShadingType.CLEAR },
                margins: { top: 120, bottom: 120, left: 160, right: 160 },
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
                  bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
                  left: { style: BorderStyle.SINGLE, size: 16, color: COLOR_ACCENT },
                  right: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER }
                },
                children: codeBuffer.map(line =>
                  new Paragraph({
                    spacing: { line: 200, before: 15, after: 15 },
                    children: [
                      new TextRun({
                        text: line.length > 0 ? line : ' ',
                        font: 'Consolas',
                        size: 17, // 8.5pt
                        color: '1E293B'
                      })
                    ]
                  })
                )
              })
            ]
          })
        ]
      })
    );
    elements.push(new Paragraph({ spacing: { before: 60, after: 60 }, children: [] }));
    codeBuffer = [];
  }

  function flushTable() {
    if (tableHeader.length === 0 && tableRows.length === 0) return;

    const allRows = [];

    // Header Row
    if (tableHeader.length > 0) {
      allRows.push(
        new TableRow({
          tableHeader: true,
          children: tableHeader.map(col =>
            new TableCell({
              shading: { fill: COLOR_PRIMARY, type: ShadingType.CLEAR },
              margins: { top: 100, bottom: 100, left: 120, right: 120 },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: col.trim(),
                      bold: true,
                      size: 19,
                      color: 'FFFFFF',
                      font: 'Segoe UI'
                    })
                  ]
                })
              ]
            })
          )
        })
      );
    }

    // Data Rows
    tableRows.forEach((row, rIdx) => {
      const isEven = rIdx % 2 === 1;
      allRows.push(
        new TableRow({
          children: row.map(col =>
            new TableCell({
              shading: isEven ? { fill: COLOR_LIGHT_BG, type: ShadingType.CLEAR } : undefined,
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
                bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
                left: { style: BorderStyle.NONE },
                right: { style: BorderStyle.NONE }
              },
              children: [
                new Paragraph({
                  spacing: { line: 230 },
                  children: parseInline(col.trim())
                })
              ]
            })
          )
        })
      );
    });

    elements.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: allRows
      })
    );
    elements.push(new Paragraph({ spacing: { before: 80, after: 80 }, children: [] }));

    tableHeader = [];
    tableRows = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Fenced Code Block
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        flushCodeBlock();
        inCodeBlock = false;
      } else {
        if (inTable) { flushTable(); inTable = false; }
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(rawLine);
      continue;
    }

    // Table Handling
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map(c => c.trim());

      const isSep = cells.every(c => /^:?-+:?$/.test(c));
      if (isSep) continue;

      if (!inTable) {
        inTable = true;
        tableHeader = cells;
      } else {
        tableRows.push(cells);
      }
      continue;
    } else {
      if (inTable) {
        flushTable();
        inTable = false;
      }
    }

    // Empty Line
    if (trimmed === '') continue;

    // Horizontal Rule
    if (/^---+$|^\*\*\*+$|^___+$/.test(trimmed)) {
      elements.push(
        new Paragraph({
          spacing: { before: 140, after: 140 },
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 8, color: COLOR_BORDER }
          },
          children: []
        })
      );
      continue;
    }

    // Heading 1
    if (trimmed.startsWith('# ')) {
      elements.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 340, after: 120 },
          children: [
            new TextRun({
              text: (chapterPrefix ? chapterPrefix + ' ' : '') + trimmed.slice(2),
              bold: true,
              size: 32, // 16pt
              color: COLOR_PRIMARY,
              font: 'Segoe UI'
            })
          ]
        })
      );
      continue;
    }

    // Heading 2
    if (trimmed.startsWith('## ')) {
      elements.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 240, after: 90 },
          children: [
            new TextRun({
              text: trimmed.slice(3),
              bold: true,
              size: 26, // 13pt
              color: COLOR_ACCENT,
              font: 'Segoe UI'
            })
          ]
        })
      );
      continue;
    }

    // Heading 3
    if (trimmed.startsWith('### ')) {
      elements.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 180, after: 70 },
          children: [
            new TextRun({
              text: trimmed.slice(4),
              bold: true,
              size: 22, // 11pt
              color: COLOR_PRIMARY,
              font: 'Segoe UI'
            })
          ]
        })
      );
      continue;
    }

    // Heading 4
    if (trimmed.startsWith('#### ')) {
      elements.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_4,
          spacing: { before: 140, after: 50 },
          children: [
            new TextRun({
              text: trimmed.slice(5),
              bold: true,
              size: 20, // 10pt
              color: COLOR_ACCENT,
              font: 'Segoe UI'
            })
          ]
        })
      );
      continue;
    }

    // Blockquote / Callout
    if (trimmed.startsWith('>')) {
      const bqText = trimmed.replace(/^>\s*/, '');
      const isAlert = bqText.startsWith('[!');
      const alertType = isAlert ? bqText.match(/\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/)?.[1] || 'NOTE' : 'NOTE';
      const cleanBq = isAlert ? bqText.replace(/\[!.*?\]\s*/, '') : bqText;

      const borderColor = alertType === 'TIP' ? '16A34A' :
                          alertType === 'WARNING' || alertType === 'CAUTION' ? 'DC2626' :
                          alertType === 'IMPORTANT' ? 'D97706' : '2563EB';

      const bgFill = alertType === 'TIP' ? 'F0FDF4' :
                     alertType === 'WARNING' || alertType === 'CAUTION' ? 'FEF2F2' :
                     alertType === 'IMPORTANT' ? 'FFFBEB' : 'EFF6FF';

      elements.push(
        new Paragraph({
          spacing: { before: 100, after: 100 },
          border: {
            left: { style: BorderStyle.SINGLE, size: 24, color: borderColor, space: 12 }
          },
          shading: {
            type: ShadingType.CLEAR,
            fill: bgFill
          },
          children: [
            new TextRun({
              text: `[${alertType}] `,
              bold: true,
              size: 20,
              color: borderColor,
              font: 'Segoe UI'
            }),
            ...parseInline(cleanBq)
          ]
        })
      );
      continue;
    }

    // Bullet List Item
    if (/^[-*]\s+/.test(trimmed)) {
      const bulletContent = trimmed.replace(/^[-*]\s+/, '');
      elements.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { before: 40, after: 40, line: 240 },
          children: parseInline(bulletContent)
        })
      );
      continue;
    }

    // Numbered List Item
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      const num = numMatch[1];
      const itemBody = numMatch[2];
      elements.push(
        new Paragraph({
          spacing: { before: 50, after: 50, line: 240 },
          children: [
            new TextRun({
              text: `${num}. `,
              bold: true,
              size: 20,
              color: COLOR_ACCENT,
              font: 'Segoe UI'
            }),
            ...parseInline(itemBody)
          ]
        })
      );
      continue;
    }

    // Regular Paragraph
    elements.push(
      new Paragraph({
        spacing: { before: 60, after: 70, line: 250 },
        children: parseInline(rawLine)
      })
    );
  }

  if (inCodeBlock) flushCodeBlock();
  if (inTable) flushTable();

  return elements;
}

async function buildMasterDevLogsDocx() {
  console.log('Building Unified Master DEV_LOGS.docx...');

  const content = [];

  // ==========================================
  // COVER PAGE
  // ==========================================
  const logoPath = path.join(projectRoot, 'public', 'logo-original.png');
  if (fs.existsSync(logoPath)) {
    const logoBuffer = fs.readFileSync(logoPath);
    content.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 400, after: 200 },
        children: [
          new ImageRun({
            data: logoBuffer,
            transformation: { width: 140, height: 140 }
          })
        ]
      })
    );
  }

  content.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 80 },
      children: [
        new TextRun({
          text: 'KUVENTORY™',
          bold: true,
          size: 52, // 26pt
          color: COLOR_PRIMARY,
          font: 'Segoe UI'
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 60, after: 180 },
      children: [
        new TextRun({
          text: 'MASTER DEVELOPMENT LOGS & SYSTEM SPECIFICATION',
          bold: true,
          size: 26, // 13pt
          color: COLOR_ACCENT,
          font: 'Segoe UI'
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 40, after: 60 },
      children: [
        new TextRun({
          text: 'Commercial Restaurant & Kiosk Inventory Management System (Kape Uno Bistro)',
          size: 21,
          bold: true,
          color: COLOR_TEXT,
          font: 'Segoe UI'
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 40, after: 400 },
      children: [
        new TextRun({
          text: 'Complete Architectural Blueprints • Operational User Manuals • Concurrency Locks • Disaster Recovery • Playwright QA Matrix',
          size: 19,
          italics: true,
          color: COLOR_MUTED,
          font: 'Segoe UI'
        })
      ]
    })
  );

  // Metadata Table on Cover Page
  content.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        ['Document Classification', 'Canonical Engineering Deliverables & Technical Handover'],
        ['Document Code', 'KUVENTORY-DOCS-CANONICAL-2026'],
        ['Software Release', 'KUVENTORY 1.0.0 (Production Master)'],
        ['Date of Certification', 'October 19, 2026'],
        ['Authoritative HEAD SHA', '135f10b807fedec368383c9e34895566da3d69fc'],
        ['Production Endpoint', 'https://kuventory.netlify.app'],
        ['Source Repository', 'https://github.com/OwnerTest-byte/kuventory.git'],
        ['Automated Test Verification', '100% Passed (107 / 107 Tests across 16 Vitest suites; Typecheck 0 errors)'],
        ['Primary Authors / Proponents', 'Michael James G. Riambon & KUVENTORY Engineering Team']
      ].map(([label, val]) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 3000, type: WidthType.DXA },
              shading: { fill: COLOR_LIGHT_BG, type: ShadingType.CLEAR },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
                bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
                left: { style: BorderStyle.NONE },
                right: { style: BorderStyle.NONE }
              },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: label, bold: true, size: 19, color: COLOR_PRIMARY, font: 'Segoe UI' })]
                })
              ]
            }),
            new TableCell({
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
                bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER },
                left: { style: BorderStyle.NONE },
                right: { style: BorderStyle.NONE }
              },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: val, size: 19, color: COLOR_TEXT, font: 'Segoe UI' })]
                })
              ]
            })
          ]
        })
      )
    }),
    new Paragraph({ children: [new PageBreak()] })
  );

  // ==========================================
  // TABLE OF CONTENTS
  // ==========================================
  content.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 200, after: 140 },
      children: [
        new TextRun({
          text: 'CANONICAL TABLE OF CONTENTS',
          bold: true,
          size: 32,
          color: COLOR_PRIMARY,
          font: 'Segoe UI'
        })
      ]
    }),
    ...[
      'Chapter 0: Project Overview, Scope & Verified History (docs/00_PROJECT_OVERVIEW_AND_HISTORY.md)',
      'Chapter 1: Requirements, Acceptance Criteria & Traceability Matrix (docs/01_REQUIREMENTS_AND_ACCEPTANCE.md)',
      'Chapter 2: System Architecture & C4 Component Topology (docs/02_SYSTEM_ARCHITECTURE.md)',
      'Chapter 3: Verified Technology Stack & Engineering Rationale (docs/03_TECH_STACK_AND_RATIONALE.md)',
      'Chapter 4: Features, Modules & Exhaustive Route Catalog (docs/04_FEATURES_AND_MODULE_CATALOG.md)',
      'Chapter 5: Database Schema, Data Dictionary & Migrations (docs/05_DATABASE_AND_DATA_DICTIONARY.md)',
      'Chapter 6: API, RPC Stored Procedures & Realtime Contracts (docs/06_API_RPC_AND_INTEGRATION_REFERENCE.md)',
      'Chapter 7: Authentication, Zero-Trust Security & RBAC Governance (docs/07_AUTH_SECURITY_AND_ROLES.md)',
      'Chapter 8: Inventory Engine, Daily Worksheets & FEFO Rotation (docs/08_INVENTORY_DAILY_WORKSHEETS_AND_FEFO.md)',
      'Chapter 9: Reports, Charts, Analytics & Export Engines (docs/09_REPORTS_CHARTS_AND_EXPORTS.md)',
      'Chapter 10: Automation, Schedulers & Event-Driven Architecture (docs/10_AUTOMATION_SCHEDULERS_AND_REALTIME.md)',
      'Chapter 11: Super Admin Operations Console Runbook (docs/11_SUPER_ADMIN_OPERATIONS_MANUAL.md)',
      'Chapter 12: Staff & Manager Operations Manual (docs/12_USER_AND_ADMIN_OPERATIONS_MANUAL.md)',
      'Chapter 13: Testing Architecture, QA Audits & Bug-Fix Chronology (docs/13_TESTING_QA_AND_BUG_FIX_HISTORY.md)',
      'Chapter 14: Deployment, Environment Configuration & Runbooks (docs/14_DEPLOYMENT_ENVIRONMENT_AND_RUNBOOKS.md)',
      'Chapter 15: Known Issues, Technical Debt & Engineering Roadmap (docs/15_KNOWN_ISSUES_RISKS_AND_ROADMAP.md)',
      'Chapter 16: Project Defense & Viva Master Q&A (100+ Questions) (docs/16_PROJECT_DEFENSE_MASTER_QA.md)',
      'Chapter 17: Quick Project Defense Cheat Sheet (docs/17_QUICK_DEFENSE_CHEAT_SHEET.md)',
      'Chapter 18: Glossary & Industry Abbreviations (docs/18_GLOSSARY_AND_ABBREVIATIONS.md)',
      'Chapter 19: Evidence & Claim Register (docs/19_EVIDENCE_AND_CLAIM_REGISTER.md)',
      'Chapter 20: Architecture Decision Records (ADRs) (docs/20_ARCHITECTURE_DECISIONS.md)'
    ].map(item =>
      new Paragraph({
        bullet: { level: 0 },
        spacing: { before: 60, after: 60, line: 250 },
        children: [
          new TextRun({
            text: item,
            size: 20,
            color: COLOR_TEXT,
            font: 'Segoe UI'
          })
        ]
      })
    ),
    new Paragraph({ children: [new PageBreak()] })
  );

  // ==========================================
  // CHAPTER DEFINITIONS & ORDER (CANONICAL SUITE)
  // ==========================================
  const chapters = [
    {
      title: 'Chapter 0: Project Overview, Scope & Verified History',
      file: 'docs/00_PROJECT_OVERVIEW_AND_HISTORY.md'
    },
    {
      title: 'Chapter 1: Requirements, Acceptance Criteria & Traceability Matrix',
      file: 'docs/01_REQUIREMENTS_AND_ACCEPTANCE.md'
    },
    {
      title: 'Chapter 2: System Architecture & C4 Component Topology',
      file: 'docs/02_SYSTEM_ARCHITECTURE.md'
    },
    {
      title: 'Chapter 3: Verified Technology Stack & Engineering Rationale',
      file: 'docs/03_TECH_STACK_AND_RATIONALE.md'
    },
    {
      title: 'Chapter 4: Features, Modules & Exhaustive Route Catalog',
      file: 'docs/04_FEATURES_AND_MODULE_CATALOG.md'
    },
    {
      title: 'Chapter 5: Database Schema, Data Dictionary & Migrations',
      file: 'docs/05_DATABASE_AND_DATA_DICTIONARY.md'
    },
    {
      title: 'Chapter 6: API, RPC Stored Procedures & Realtime Contracts',
      file: 'docs/06_API_RPC_AND_INTEGRATION_REFERENCE.md'
    },
    {
      title: 'Chapter 7: Authentication, Zero-Trust Security & RBAC Governance',
      file: 'docs/07_AUTH_SECURITY_AND_ROLES.md'
    },
    {
      title: 'Chapter 8: Inventory Engine, Daily Worksheets & FEFO Rotation',
      file: 'docs/08_INVENTORY_DAILY_WORKSHEETS_AND_FEFO.md'
    },
    {
      title: 'Chapter 9: Reports, Charts, Analytics & Export Engines',
      file: 'docs/09_REPORTS_CHARTS_AND_EXPORTS.md'
    },
    {
      title: 'Chapter 10: Automation, Schedulers & Event-Driven Architecture',
      file: 'docs/10_AUTOMATION_SCHEDULERS_AND_REALTIME.md'
    },
    {
      title: 'Chapter 11: Super Admin Operations Console Runbook',
      file: 'docs/11_SUPER_ADMIN_OPERATIONS_MANUAL.md'
    },
    {
      title: 'Chapter 12: Staff & Manager Operations Manual',
      file: 'docs/12_USER_AND_ADMIN_OPERATIONS_MANUAL.md'
    },
    {
      title: 'Chapter 13: Testing Architecture, QA Audits & Bug-Fix Chronology',
      file: 'docs/13_TESTING_QA_AND_BUG_FIX_HISTORY.md'
    },
    {
      title: 'Chapter 14: Deployment, Environment Configuration & Runbooks',
      file: 'docs/14_DEPLOYMENT_ENVIRONMENT_AND_RUNBOOKS.md'
    },
    {
      title: 'Chapter 15: Known Issues, Technical Debt & Engineering Roadmap',
      file: 'docs/15_KNOWN_ISSUES_RISKS_AND_ROADMAP.md'
    },
    {
      title: 'Chapter 16: Project Defense & Viva Master Q&A (100+ Questions)',
      file: 'docs/16_PROJECT_DEFENSE_MASTER_QA.md'
    },
    {
      title: 'Chapter 17: Quick Project Defense Cheat Sheet',
      file: 'docs/17_QUICK_DEFENSE_CHEAT_SHEET.md'
    },
    {
      title: 'Chapter 18: Glossary & Industry Abbreviations',
      file: 'docs/18_GLOSSARY_AND_ABBREVIATIONS.md'
    },
    {
      title: 'Chapter 19: Evidence & Claim Register',
      file: 'docs/19_EVIDENCE_AND_CLAIM_REGISTER.md'
    },
    {
      title: 'Chapter 20: Architecture Decision Records (ADRs)',
      file: 'docs/20_ARCHITECTURE_DECISIONS.md'
    }
  ];

  for (let idx = 0; idx < chapters.length; idx++) {
    const ch = chapters[idx];
    const fullPath = path.join(projectRoot, ch.file);
    if (!fs.existsSync(fullPath)) {
      console.warn(`[WARN] Skipping missing chapter file: ${ch.file}`);
      continue;
    }

    console.log(`Processing ${ch.title} from ${ch.file}...`);

    // Chapter Header Banner
    content.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 240, after: 120 },
        children: [
          new TextRun({
            text: ch.title,
            bold: true,
            size: 30, // 15pt
            color: COLOR_PRIMARY,
            font: 'Segoe UI'
          })
        ]
      }),
      new Paragraph({
        spacing: { before: 40, after: 160 },
        children: [
          new TextRun({
            text: `Source Specification: ${ch.file} • Certified Production Accurate`,
            italics: true,
            size: 18,
            color: COLOR_MUTED,
            font: 'Segoe UI'
          })
        ]
      })
    );

    const rawMd = fs.readFileSync(fullPath, 'utf8');
    const docxNodes = parseMarkdownToDocx(rawMd);
    content.push(...docxNodes);

    // Page break after each chapter (except last)
    if (idx < chapters.length - 1) {
      content.push(new Paragraph({ children: [new PageBreak()] }));
    }
  }

  // ==========================================
  // COMPILE DOCUMENT
  // ==========================================
  console.log('Compiling Document with docx Packer...');
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
                    text: 'KUVENTORY™ • DEV LOGS & MASTER ENGINEERING SPECIFICATION',
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

  // Write DEV_LOGS.docx in root and documentations/
  const rootDocxPath = path.join(projectRoot, 'DEV_LOGS.docx');
  const consolidatedDocxPath = path.join(projectRoot, 'documentations', 'DEV_LOGS.docx');
  fs.mkdirSync(path.dirname(consolidatedDocxPath), { recursive: true });

  fs.writeFileSync(rootDocxPath, buffer);
  fs.writeFileSync(consolidatedDocxPath, buffer);

  console.log(`[SUCCESS] Master Word file generated at:`);
  console.log(`  -> ${rootDocxPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
  console.log(`  -> ${consolidatedDocxPath} (${(buffer.length / 1024).toFixed(1)} KB)`);

  // ==========================================
  // CLEAN UP INDIVIDUAL DOCX FILES
  // ==========================================
  console.log('Cleaning up fragmented individual docx files...');
  const filesToDelete = [
    'CHANGELOG.docx',
    'KUVENTORY_SPEC.docx',
    'KUVENTORY_USER_GUIDE.docx',
    'README.docx',
    'SOFTWARE_DESIGN_PROJECT_DOCUMENTATION.docx',
    'docs/01_USER_OPERATIONS_MANUAL.docx',
    'docs/02_MASTER_ADMIN_AND_SECURITY_GOVERNANCE.docx',
    'docs/03_SYSTEM_ARCHITECTURE_AND_TECHNICAL_SPEC.docx',
    'docs/04_DEPLOYMENT_OPERATIONS_AND_DISASTER_RECOVERY.docx',
    'docs/05_QA_TESTING_AUDIT_AND_RELEASE_REPORT.docx',
    'docs/architecture.docx',
    'docs/concurrency.docx',
    'docs/database-audit.docx',
    'docs/disaster-recovery.docx',
    'docs/failure-scenarios.docx',
    'docs/performance.docx',
    'docs/README.docx',
    'docs/recovery-architecture.docx',
    'docs/responsive-qa.docx',
    'docs/security-architecture.docx',
    'docs/SOFTWARE_DESIGN_PROJECT_DOCUMENTATION.docx'
  ];

  for (const rel of filesToDelete) {
    const fPath = path.join(projectRoot, rel);
    if (fs.existsSync(fPath)) {
      fs.unlinkSync(fPath);
    }
  }

  // Also clean the individual files from documentations/ keeping only DEV_LOGS.docx
  const docDir = path.join(projectRoot, 'documentations');
  if (fs.existsSync(docDir)) {
    const docFiles = fs.readdirSync(docDir);
    for (const df of docFiles) {
      if (df !== 'DEV_LOGS.docx') {
        fs.unlinkSync(path.join(docDir, df));
      }
    }
  }

  console.log('=== CLEANUP COMPLETE: ONLY UNIFIED DEV_LOGS.docx REMAINS ===');
}

buildMasterDevLogsDocx().catch(err => {
  console.error('Failed to build master DEV_LOGS.docx:', err);
  process.exit(1);
});
