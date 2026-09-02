import type { Report } from '../types';
import * as XLSX from 'xlsx';

export function exportToXlsx(report: Report): void {
  const items = report.report_items || [];

  const data = items.map(item => ({
    'Date': report.report_date,
    'Category': item.category_name,
    'Item': item.item_name,
    'Description': item.description || '',
    'Unit': item.unit || '',
    'Unit Cost': item.unit_cost,
    'Supplier A': item.supplier_a || '',
    'Supplier B': item.supplier_b || '',
    'Beginning': item.beg,
    'Add': item.add,
    'Total': item.total,
    'AM': item.am,
    'PM': item.pm,
    'Ending': item.ending
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Daily Inventory');

  // Adjust column widths roughly based on content
  const columnWidths = [
    { wch: 12 }, // Date
    { wch: 15 }, // Category
    { wch: 25 }, // Item
    { wch: 20 }, // Description
    { wch: 10 }, // Unit
    { wch: 12 }, // Unit Cost
    { wch: 15 }, // Supplier A
    { wch: 15 }, // Supplier B
    { wch: 10 }, // Beginning
    { wch: 10 }, // Add
    { wch: 10 }, // Total
    { wch: 10 }, // AM
    { wch: 10 }, // PM
    { wch: 10 }, // Ending
  ];
  worksheet['!cols'] = columnWidths;

  XLSX.writeFile(workbook, `KUVENTORY_Daily_Report_${report.report_date}.xlsx`);
}
