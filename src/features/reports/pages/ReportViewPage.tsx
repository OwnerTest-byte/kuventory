import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useReport } from '../api/reports';
import { Download, FileSpreadsheet, FileText, ArrowLeft, Loader2, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import type { ReportItem } from '../types';

export function ReportViewPage() {
  const { id } = useParams<{ id: string }>();
  const { data: report, isLoading, error } = useReport(id);

  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingXlsx, setIsExportingXlsx] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);

  if (isLoading) return <div className="p-8 flex items-center"><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Loading report snapshot...</div>;
  if (error || !report) return <div className="p-8 text-red-500">Failed to load report snapshot.</div>;

  const items = report.report_items || [];
  
  // UX Spec: PORTION STOCK vs PER CASES
  const perCaseItems = items.filter(item => item.unit?.toUpperCase().includes('CASE') || item.category_name?.toUpperCase().includes('CASE'));
  const portionItems = items.filter(item => !perCaseItems.includes(item));

  const handlePrint = () => {
    window.print();
  };

  const renderPrintableTable = (tableItems: ReportItem[], title: string) => {
    if (tableItems.length === 0) return null;
    return (
      <div className="mb-8">
        <h3 className="text-sm font-bold uppercase tracking-widest text-slate-900 mb-2">{title}</h3>
        <table className="w-full text-left text-xs sm:text-sm border-collapse border border-slate-300">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-300">
              <th className="py-2 px-3 font-bold border-r border-slate-300">ITEM</th>
              <th className="py-2 px-3 font-bold text-center border-r border-slate-300">BEG</th>
              <th className="py-2 px-3 font-bold text-center border-r border-slate-300">ADD</th>
              <th className="py-2 px-3 font-bold text-center border-r border-slate-300">TOTAL STOCK</th>
              <th className="py-2 px-3 font-bold text-center border-r border-slate-300">SALES AM</th>
              <th className="py-2 px-3 font-bold text-center border-r border-slate-300">SALES PM</th>
              <th className="py-2 px-3 font-bold text-center">ENDING</th>
            </tr>
          </thead>
          <tbody>
            {tableItems.map((item, idx) => {
              const totalStock = (item.beginning_qty || 0) + (item.added_qty || 0);
              return (
                <tr key={idx} className="border-b border-slate-200">
                  <td className="py-2 px-3 border-r border-slate-200">{item.item_name}</td>
                  <td className="py-2 px-3 text-center border-r border-slate-200">{item.beginning_qty}</td>
                  <td className="py-2 px-3 text-center border-r border-slate-200">{item.added_qty}</td>
                  <td className="py-2 px-3 text-center border-r border-slate-200 font-medium">{totalStock}</td>
                  <td className="py-2 px-3 text-center border-r border-slate-200">{item.sales_am}</td>
                  <td className="py-2 px-3 text-center border-r border-slate-200">{item.sales_pm}</td>
                  <td className="py-2 px-3 text-center font-medium">{item.ending_qty}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto pb-12">
      {/* Top action bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
        <div className="flex items-center gap-2 text-slate-500">
          <Link to="/reports" className="hover:text-slate-900 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-xl font-bold text-slate-900 uppercase">Report Preview</h1>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="bg-red-600 hover:bg-red-700 text-white border-transparent" disabled={isExportingPdf}>
            {isExportingPdf ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
            Export PDF
          </Button>
          <Button variant="outline" className="bg-green-600 hover:bg-green-700 text-white border-transparent" disabled={isExportingXlsx}>
            {isExportingXlsx ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}
            Export XLSX
          </Button>
          <Button variant="outline" className="text-slate-700 bg-white" disabled={isExportingCsv}>
            {isExportingCsv ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Export CSV
          </Button>
          <Button variant="outline" className="text-slate-700 bg-white" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2" />
            Print
          </Button>
        </div>
      </div>

      {/* Printable Report Page */}
      <div className="bg-white p-8 sm:p-12 shadow-md border border-slate-200 mx-auto max-w-4xl min-h-[1056px] print:shadow-none print:border-none print:m-0 print:p-0 print:w-full">
        <div className="flex flex-col items-center justify-center text-center mb-8 border-b-2 border-slate-800 pb-6">
          <div className="flex items-center gap-2 mb-2">
            <img src="/logo-icon.png" alt="KUVENTORY Logo" className="h-8 w-auto grayscale" />
            <span className="font-bold text-2xl tracking-tight text-slate-900">KUVENTORY</span>
          </div>
          <h1 className="text-lg font-bold uppercase tracking-widest text-slate-900">INVENTORY KIOSK AND BODEGA</h1>
          <h2 className="text-lg font-bold uppercase tracking-widest text-slate-900">DAILY INVENTORY REPORT</h2>
        </div>

        <div className="flex justify-between items-start mb-8 text-sm text-slate-700 font-medium">
          <div>
            <p>Date: {format(new Date(report.date), 'MMMM dd, yyyy')}</p>
          </div>
          <div className="text-right space-y-4">
            <div className="flex justify-end gap-2 items-end">
              <span className="w-24 text-right">Prepared by:</span>
              <div className="border-b border-slate-400 w-48 text-center pb-1 text-slate-900">{report.generated_by_user?.full_name}</div>
            </div>
            <div className="flex justify-end gap-2 items-end">
              <span className="w-24 text-right">Finalized by:</span>
              <div className="border-b border-slate-400 w-48 text-center pb-1 text-slate-900">{report.state === 'FINALIZED' ? report.generated_by_user?.full_name : ''}</div>
            </div>
          </div>
        </div>

        {renderPrintableTable(portionItems, 'PORTION STOCK')}
        {renderPrintableTable(perCaseItems, 'PER CASES')}
        
        <div className="text-center mt-12 pt-4 border-t border-slate-300 text-xs text-slate-500 font-medium uppercase tracking-widest">
          KUVENTORY Inventory Management System
        </div>
      </div>
    </div>
  );
}
