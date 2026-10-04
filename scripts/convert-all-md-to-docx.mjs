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
  PageNumber
} from 'docx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Visual Palette
const COLOR_PRIMARY = '1E293B';   // Slate Dark
const COLOR_ACCENT = '8A5A36';    // KUVENTORY Coffee Bronze
const COLOR_TEXT = '334155';      // Charcoal text
const COLOR_MUTED = '64748B';     // Gray
const COLOR_LIGHT_BG = 'F8FAFC';  // Light fill
const COLOR_CODE_BG = 'F1F5F9';   // Code fill
const COLOR_BORDER = 'E2E8F0';    // Border

// Inline formatting parser (bold, italic, code, text)
function parseInline(text) {
  const runs = [];
  // Regex to match **bold**, *italic*, `code`, or regular text
  const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`|[^*`]+)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const chunk = match[0];
    if (chunk.startsWith('**') && chunk.endsWith('**')) {
      runs.push(new TextRun({
        text: chunk.slice(2, -2),
        bold: true,
        size: 20,
        color: COLOR_PRIMARY,
        font: 'Segoe UI'
      }));
    } else if (chunk.startsWith('*') && chunk.endsWith('*')) {
      runs.push(new TextRun({
        text: chunk.slice(1, -1),
        italics: true,
        size: 20,
        color: COLOR_TEXT,
        font: 'Segoe UI'
      }));
    } else if (chunk.startsWith('`') && chunk.endsWith('`')) {
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

function parseMarkdownToDocxElements(mdContent, docTitle = 'KUVENTORY Documentation') {
  const lines = mdContent.split(/\r?\n/);
  const elements = [];
  let inCodeBlock = false;
  let codeBuffer = [];
  let inTable = false;
  let tableHeader = [];
  let tableRows = [];

  function flushCodeBlock() {
    if (codeBuffer.length === 0) return;
    const codeText = codeBuffer.join('\n');
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
                  left: { style: BorderStyle.SINGLE, size: 12, color: COLOR_ACCENT },
                  right: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER }
                },
                children: codeBuffer.map(line =>
                  new Paragraph({
                    spacing: { line: 200, before: 20, after: 20 },
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
    elements.push(new Paragraph({ spacing: { before: 80, after: 80 }, children: [] }));
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

      // Check if it's separator row (| :--- | :--- |)
      const isSep = cells.every(c => /^:?-+:?$/.test(c));
      if (isSep) {
        // Just marks separator
        continue;
      }

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
    if (trimmed === '') {
      continue;
    }

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
          spacing: { before: 360, after: 140 },
          children: [
            new TextRun({
              text: trimmed.slice(2),
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
          spacing: { before: 260, after: 100 },
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
          spacing: { before: 200, after: 80 },
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
          spacing: { before: 160, after: 60 },
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

    // Blockquote / Callout (> [!NOTE], > text)
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
          spacing: { before: 120, after: 120 },
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

    // Bullet List Item (- or *)
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

    // Numbered List Item (1. item)
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
        spacing: { before: 60, after: 80, line: 260 },
        children: parseInline(rawLine)
      })
    );
  }

  if (inCodeBlock) flushCodeBlock();
  if (inTable) flushTable();

  return elements;
}

export async function convertMarkdownToDocx(mdFilePath, targetDocxPath, headerTitle = 'KUVENTORY™ System Documentation') {
  const mdContent = fs.readFileSync(mdFilePath, 'utf8');
  const docElements = parseMarkdownToDocxElements(mdContent, headerTitle);

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
                    text: headerTitle,
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
        children: docElements
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.mkdirSync(path.dirname(targetDocxPath), { recursive: true });
  fs.writeFileSync(targetDocxPath, buffer);
  console.log(`[OK] Generated DOCX: ${path.relative(projectRoot, targetDocxPath)} (${buffer.length} bytes)`);
  return targetDocxPath;
}

// Convert all active Markdown files in repository
async function main() {
  console.log('=== KUVENTORY BATCH MARKDOWN-TO-DOCX CONVERTER ===');

  const filesToConvert = [
    // Root level files
    { src: 'CHANGELOG.md', title: 'KUVENTORY™ Changelog & Version History' },
    { src: 'KUVENTORY_SPEC.md', title: 'KUVENTORY™ Master Technical Specification' },
    { src: 'KUVENTORY_USER_GUIDE.md', title: 'KUVENTORY™ Official User Guide & Operating Manual' },
    { src: 'README.md', title: 'KUVENTORY™ Enterprise · System Overview' },
    { src: 'SOFTWARE_DESIGN_PROJECT_DOCUMENTATION.md', title: 'KUVENTORY™ Software Design Project Documentation' },

    // Docs directory
    { src: 'docs/01_USER_OPERATIONS_MANUAL.md', title: 'KUVENTORY™ User Operations Manual (DOC-01)' },
    { src: 'docs/02_MASTER_ADMIN_AND_SECURITY_GOVERNANCE.md', title: 'KUVENTORY™ Master Admin & Security Governance (DOC-02)' },
    { src: 'docs/03_SYSTEM_ARCHITECTURE_AND_TECHNICAL_SPEC.md', title: 'KUVENTORY™ System Architecture & Technical Spec (DOC-03)' },
    { src: 'docs/04_DEPLOYMENT_OPERATIONS_AND_DISASTER_RECOVERY.md', title: 'KUVENTORY™ Deployment & Disaster Recovery (DOC-04)' },
    { src: 'docs/05_QA_TESTING_AUDIT_AND_RELEASE_REPORT.md', title: 'KUVENTORY™ QA Testing Audit & Release Report (DOC-05)' },
    { src: 'docs/architecture.md', title: 'KUVENTORY™ System Architecture & High-Performance Design' },
    { src: 'docs/concurrency.md', title: 'KUVENTORY™ Concurrency Control & Transaction Isolation' },
    { src: 'docs/database-audit.md', title: 'KUVENTORY™ Database Schema & Security Audit' },
    { src: 'docs/disaster-recovery.md', title: 'KUVENTORY™ 5-Tier Disaster Recovery & Backup Architecture' },
    { src: 'docs/failure-scenarios.md', title: 'KUVENTORY™ Failure Scenarios, Containment & Recovery' },
    { src: 'docs/performance.md', title: 'KUVENTORY™ Performance & Latency Engineering Specification' },
    { src: 'docs/README.md', title: 'KUVENTORY™ Master Documentation Library Index' },
    { src: 'docs/recovery-architecture.md', title: 'KUVENTORY™ Recovery Point & Restore Operations' },
    { src: 'docs/responsive-qa.md', title: 'KUVENTORY™ Responsive Cross-Device Engineering & QA Matrix' },
    { src: 'docs/security-architecture.md', title: 'KUVENTORY™ Zero-Trust Security & Role Architecture' },
    { src: 'docs/SOFTWARE_DESIGN_PROJECT_DOCUMENTATION.md', title: 'KUVENTORY™ Capstone Software Design Specification' }
  ];

  const consolidatedDocxDir = path.join(projectRoot, 'documentations');
  fs.mkdirSync(consolidatedDocxDir, { recursive: true });

  for (const item of filesToConvert) {
    const fullSrcPath = path.join(projectRoot, item.src);
    if (!fs.existsSync(fullSrcPath)) {
      console.warn(`[SKIP] Missing file: ${item.src}`);
      continue;
    }

    // 1. Generate .docx alongside the source file
    const sideDocxPath = fullSrcPath.replace(/\.md$/, '.docx');
    await convertMarkdownToDocx(fullSrcPath, sideDocxPath, item.title);

    // 2. Also place a copy in documentations/ directory for easy client bundling
    const baseName = path.basename(item.src, '.md');
    const docxConsolidated = path.join(consolidatedDocxDir, `${baseName}.docx`);
    fs.copyFileSync(sideDocxPath, docxConsolidated);
  }

  console.log('=== ALL MARKDOWN FILES SUCCESSFULLY CONVERTED TO DOCS ===');
}

main().catch(err => {
  console.error('Batch conversion error:', err);
  process.exit(1);
});
