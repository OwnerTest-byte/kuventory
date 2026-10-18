import type { Report } from '../types';

/**
 * Escapes a CSV field to prevent formula injection (OWASP recommendation)
 * and properly quote fields containing commas, quotes, or newlines.
 */
export function escapeCsvField(field: any): string {
  if (field === null || field === undefined) return '';
  let str = String(field);

  // 1. Formula Injection Mitigation:
  // If the string starts with =, +, -, @, tab, or carriage return,
  // prepend a single quote to force spreadsheet programs to treat it as plain text.
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // 2. Standard CSV escaping:
  // If the field contains a comma, quote, or newline, it must be enclosed in quotes
  // and any existing quotes must be escaped by doubling them ("").
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Triggers a client-side download of CSV content as a Blob.
 */
export function downloadCsv(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportToCsv(report: Report): void {
  const headers = [
    'Date',
    'Category',
    'Item',
    'Description',
    'Unit',
    'Unit Cost',
    'Supplier A',
    'Supplier B',
    'Beginning',
    'Add',
    'Total',
    'AM',
    'PM',
    'Ending',
  ];

  const rows = [headers];

  const items = report.report_items || [];
  
  items.forEach((item) => {
    rows.push([
      report.report_date,
      item.category_name,
      item.item_name,
      item.description || '',
      item.unit || '',
      typeof item.unit_cost === 'number' ? item.unit_cost.toFixed(2) : String(item.unit_cost || '0.00'),
      item.supplier_a || '',
      item.supplier_b || '',
      String(item.beg),
      String(item.add),
      String(item.total),
      String(item.am),
      String(item.pm),
      String(item.ending),
    ]);
  });

  const csvContent = rows
    .map((row) => row.map(escapeCsvField).join(','))
    .join('\n');

  downloadCsv(`KUVENTORY_Daily_Report_${report.report_date}.csv`, csvContent);
}
