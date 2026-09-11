import type { Report } from '../types';
import ExcelJS from 'exceljs';

export async function exportToXlsx(report: Report): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KUVENTORY';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Daily Inventory');

  worksheet.columns = [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Category', key: 'category', width: 16 },
    { header: 'Item', key: 'item', width: 26 },
    { header: 'Description', key: 'description', width: 22 },
    { header: 'Unit', key: 'unit', width: 10 },
    { header: 'Unit Cost', key: 'unit_cost', width: 12 },
    { header: 'Supplier A', key: 'supplier_a', width: 16 },
    { header: 'Supplier B', key: 'supplier_b', width: 16 },
    { header: 'Beginning', key: 'beg', width: 12 },
    { header: 'Add', key: 'add', width: 10 },
    { header: 'Total', key: 'total', width: 10 },
    { header: 'AM', key: 'am', width: 10 },
    { header: 'PM', key: 'pm', width: 10 },
    { header: 'Ending', key: 'ending', width: 12 },
  ];

  const items = report.report_items || [];
  items.forEach(item => {
    worksheet.addRow({
      date: report.report_date,
      category: item.category_name,
      item: item.item_name,
      description: item.description || '',
      unit: item.unit || '',
      unit_cost: item.unit_cost,
      supplier_a: item.supplier_a || '',
      supplier_b: item.supplier_b || '',
      beg: item.beg,
      add: item.add,
      total: item.total,
      am: item.am,
      pm: item.pm,
      ending: item.ending,
    });
  });

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `KUVENTORY_Daily_Report_${report.report_date}.xlsx`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}
