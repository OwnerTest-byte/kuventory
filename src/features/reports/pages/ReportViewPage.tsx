import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useReport } from '../api/reports';
import { Download, FileSpreadsheet, FileText, ArrowLeft, Loader2, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

export function ReportViewPage() {
  const { id } = useParams<{ id: string }>();
  const { data: report, isLoading, error } = useReport(id);

  const [isExportingPdf] = useState(false);
  const [isExportingXlsx] = useState(false);
  const [isExportingCsv] = useState(false);

  if (isLoading) return <div className="p-8 flex items-center"><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Loading report...</div>;
  if (error || !report) return <div className="p-8 text-red-500">Failed to load report.</div>;

  const items = report.daily_inventory_entries || [];
  
  // UX Spec: PORTION STOCK vs PER CASES
  const perCaseItems = items.filter((item: any) => item.section === 'PER CASES');
  const portionItems = items.filter((item: any) => item.section === 'PORTION STOCK');

  const handlePrint = () => {
    window.print();
  };

  const renderPrintableTable = (tableItems: any[], title: string) => {
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
              const totalStock = (item.beginning_qty || 0) + (item.add_qty || 0);
              return (
                <tr key={idx} className="border-b border-slate-200">
                  <td className="py-2 px-3 border-r border-slate-200">{item.items?.item_name}</td>
                  <td className="py-2 px-3 text-center border-r border-slate-200">{item.beginning_qty}</td>
                  <td className="py-2 px-3 text-center border-r border-slate-200">{item.add_qty}</td>
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
    <div className="max-w-5xl mx-auto pb-12 p-8">
      {/* Top action bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4 print:hidden">
        <div className="flex items-center gap-2 text-slate-500">
          <Link to="/reports" className="hover:text-slate-900 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-xl font-bold text-slate-900 uppercase">Report Preview</h1>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="border-slate-300" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2" />
            Print
          </Button>
          <Button variant="outline" className="bg-red-600 hover:bg-red-700 text-white border-transparent" disabled={isExportingPdf}>
            {isExportingPdf ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
            PDF
          </Button>
          <Button variant="outline" className="bg-emerald-600 hover:bg-emerald-700 text-white border-transparent" disabled={isExportingXlsx}>
            {isExportingXlsx ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}
            EXCEL
          </Button>
          <Button variant="outline" className="bg-blue-600 hover:bg-blue-700 text-white border-transparent" disabled={isExportingCsv}>
            {isExportingCsv ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
            CSV
          </Button>
        </div>
      </div>

      {/* Printable Report Document */}
      <div className="bg-white border border-slate-300 p-8 sm:p-12 shadow-sm rounded-sm print:shadow-none print:border-none print:p-0 font-mono" id="printable-report">
        
        <div className="text-center mb-10 border-b border-slate-300 pb-6">
          <h1 className="text-2xl font-bold tracking-widest mb-1 uppercase">KUVENTORY</h1>
          <h2 className="text-lg font-bold text-slate-700 mb-4 uppercase">Daily Inventory Report</h2>
          <div className="flex flex-col sm:flex-row justify-center gap-4 text-sm">
            <p><span className="font-bold">DATE:</span> {format(new Date(report.inventory_date), 'MMMM dd, yyyy')}</p>
            <p className="hidden sm:block">|</p>
            <p><span className="font-bold">STATUS:</span> {report.status}</p>
            <p className="hidden sm:block">|</p>
            <p><span className="font-bold">ID:</span> {report.id.split('-')[0].toUpperCase()}</p>
          </div>
        </div>

        {renderPrintableTable(portionItems, 'PORTION STOCK')}
        {renderPrintableTable(perCaseItems, 'PER CASES')}

        <div className="mt-12 pt-8 border-t border-slate-300 grid grid-cols-2 gap-8 text-sm">
          <div>
            <p className="mb-8 font-bold">PREPARED BY:</p>
            <div className="border-b border-slate-800 w-3/4 mb-1"></div>
            <p className="text-slate-600">Name & Signature</p>
          </div>
          <div>
            <p className="mb-8 font-bold">FINALIZED BY:</p>
            <div className="border-b border-slate-800 w-3/4 mb-1"></div>
            <p className="text-slate-600">{(report as any).users?.full_name || 'Name & Signature'}</p>
            <p className="text-slate-500 text-xs mt-1">
              At: {report.finalized_at ? format(new Date(report.finalized_at), 'MMM dd, yyyy h:mm a') : '-'}
            </p>
          </div>
        </div>

        <div className="mt-12 text-center text-xs text-slate-400">
          <p>Generated by Kuventory System • {format(new Date(), 'MMM dd, yyyy h:mm a')}</p>
        </div>

      </div>
    </div>
  );
}
