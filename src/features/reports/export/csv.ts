import type { Report } from '../types';

function escapeCsvField(field: any): string {
  if (field === null || field === undefined) return '';
  const str = String(field);
  // If the field contains a comma, quote, or newline, it must be enclosed in quotes
  // and any existing quotes must be escaped by doubling them.
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
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
      item.unit_cost.toFixed(2),
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

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `KUVENTORY_Daily_Report_${report.report_date}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
