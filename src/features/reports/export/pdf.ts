import type { Report, ReportItem } from '../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export function exportToPdf(report: Report): void {
  // Initialize document
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Helper for center text
  const addCenteredText = (text: string, y: number, fontSize: number, isBold = false) => {
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    const textWidth = doc.getTextWidth(text);
    doc.text(text, (pageWidth - textWidth) / 2, y);
  };

  // Header
  addCenteredText('KUVENTORY', 20, 16, true);
  addCenteredText('INVENTORY KIOSK AND BODEGA', 28, 14, true);
  addCenteredText('DAILY INVENTORY REPORT', 35, 12, false);
  
  // Meta details
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${report.report_date}`, 14, 50);
  doc.text(`Status: ${report.status}`, 14, 56);
  if (report.version > 1) {
    doc.text(`Version: ${report.version}`, 14, 62);
  }

  // Separate portion stock vs per cases
  // Usually, portion stocks might be identified by Category = 'Portion' or Unit = 'BOTTLE'/'PC'
  // But since we just need to group them visually according to the UX spec:
  // The spec mentions:
  // PORTION STOCK
  // ...
  // PER CASES
  
  const items = report.report_items || [];
  
  // Group items dynamically by category
  const categoriesMap: Record<string, ReportItem[]> = {};
  items.forEach(item => {
    const cat = (item.category_name || 'GENERAL').toUpperCase();
    if (!categoriesMap[cat]) categoriesMap[cat] = [];
    categoriesMap[cat].push(item);
  });

  const sortedCategories = Object.keys(categoriesMap).sort();

  let finalY = 70;

  const tableColumn = [
    'ITEM',
    'BEG',
    'ADD',
    'TOTAL',
    'AM',
    'PM',
    'END'
  ];

  const createTableBody = (itemList: ReportItem[]) => itemList.map(item => [
    item.item_name,
    item.beg,
    item.add,
    item.total,
    item.am,
    item.pm,
    item.ending
  ]);

  sortedCategories.forEach(catName => {
    const catItems = categoriesMap[catName];
    if (!catItems || catItems.length === 0) return;

    // Check if new page is needed before section title
    if (finalY > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      finalY = 20;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(catName, 14, finalY);
    
    autoTable(doc, {
      startY: finalY + 5,
      head: [tableColumn],
      body: createTableBody(catItems),
      theme: 'grid',
      headStyles: { fillColor: [40, 40, 40], textColor: 255 },
      styles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { halign: 'right', cellWidth: 15 },
        2: { halign: 'right', cellWidth: 15 },
        3: { halign: 'right', cellWidth: 15, fontStyle: 'bold' },
        4: { halign: 'right', cellWidth: 15 },
        5: { halign: 'right', cellWidth: 15 },
        6: { halign: 'right', cellWidth: 15, fontStyle: 'bold' }
      }
    });
    
    finalY = (doc as any).lastAutoTable.finalY + 15;
  });

  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  doc.setFontSize(8);
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.text(
      `Page ${i} of ${pageCount} | Generated: ${new Date().toLocaleString()}`,
      14,
      doc.internal.pageSize.getHeight() - 10
    );
  }

  doc.save(`KUVENTORY_Daily_Report_${report.report_date}.pdf`);
}
