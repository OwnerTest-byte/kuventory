import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useReport } from '../api/reports';
import { Download, FileSpreadsheet, FileText, ArrowLeft, Loader2, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { exportToPdf } from '../export/pdf';
import { exportToXlsx } from '../export/xlsx';
import { exportToCsv } from '../export/csv';

export function ReportViewPage() {
  const { id } = useParams<{ id: string }>();
  const { data: report, isLoading, error } = useReport(id);

  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingXlsx, setIsExportingXlsx] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);

  if (isLoading) return <div className="p-8 flex items-center"><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Loading report...</div>;
  if (error || !report) return <div className="p-8 text-red-500">Failed to load report.</div>;

  const items = report.daily_inventory_entries || [];
  
  // Categorize items
  const grilledItems = items.filter((item: any) => (item.section || '').toUpperCase().includes('GRILL'));
  const perCaseItems = items.filter((item: any) => (item.section || '').toUpperCase().includes('CASE'));
  const portionItems = items.filter((item: any) => 
    !grilledItems.includes(item) && !perCaseItems.includes(item)
  );

  const handlePrint = () => {
    window.print();
  };

  const getReportPayload = () => ({
    id: report.id,
    daily_inventory_id: report.id,
    report_date: report.inventory_date,
    status: report.status as any,
    version: 1,
    generated_at: report.finalized_at || new Date().toISOString(),
    generated_by: 'Admin',
    report_items: items.map((it: any) => ({
      id: it.id,
      report_id: report.id,
      item_name: it.items?.item_name || 'Item',
      category_name: it.section || 'General',
      description: it.items?.description || '',
      unit: it.items?.unit || 'pcs',
      unit_cost: Number(it.items?.unit_cost || 0),
      supplier_a: it.items?.supplier_a || '',
      supplier_b: it.items?.supplier_b || '',
      beg: it.beginning_qty,
      add: it.add_qty,
      total: it.total_stock,
      am: it.sales_am,
      pm: it.sales_pm,
      ending: it.ending_qty
    }))
  });

  const handleExportPdf = () => {
    try {
      setIsExportingPdf(true);
      exportToPdf(getReportPayload());
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportXlsx = () => {
    try {
      setIsExportingXlsx(true);
      exportToXlsx(getReportPayload());
    } finally {
      setIsExportingXlsx(false);
    }
  };

  const handleExportCsv = () => {
    try {
      setIsExportingCsv(true);
      exportToCsv(getReportPayload());
    } finally {
      setIsExportingCsv(false);
    }
  };

  const renderPrintableTable = (tableItems: any[], title: string) => {
    if (tableItems.length === 0) return null;
    return (
      <div className="mb-8">
        <h3 className="text-sm font-bold uppercase tracking-widest text-foreground mb-2 print:text-black">{title}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm border-collapse border border-border print:border-slate-300">
            <thead>
              <tr className="bg-muted/40 print:bg-slate-100 border-b border-border print:border-slate-300">
                <th className="py-2 px-3 font-bold border-r border-border print:border-slate-300">ITEM</th>
                <th className="py-2 px-3 font-bold text-center border-r border-border print:border-slate-300">BEG</th>
                <th className="py-2 px-3 font-bold text-center border-r border-border print:border-slate-300">ADD</th>
                <th className="py-2 px-3 font-bold text-center border-r border-border print:border-slate-300">TOTAL STOCK</th>
                <th className="py-2 px-3 font-bold text-center border-r border-border print:border-slate-300">SALES AM</th>
                <th className="py-2 px-3 font-bold text-center border-r border-border print:border-slate-300">SALES PM</th>
                <th className="py-2 px-3 font-bold text-center">ENDING</th>
              </tr>
            </thead>
            <tbody>
              {tableItems.map((item, idx) => {
                const totalStock = (item.beginning_qty || 0) + (item.add_qty || 0);
                return (
                  <tr key={idx} className="border-b border-border/60 print:border-slate-200">
                    <td className="py-2 px-3 border-r border-border/60 print:border-slate-200">{item.items?.item_name}</td>
                    <td className="py-2 px-3 text-center border-r border-border/60 print:border-slate-200">{item.beginning_qty}</td>
                    <td className="py-2 px-3 text-center border-r border-border/60 print:border-slate-200">{item.add_qty}</td>
                    <td className="py-2 px-3 text-center border-r border-border/60 print:border-slate-200 font-medium">{totalStock}</td>
                    <td className="py-2 px-3 text-center border-r border-border/60 print:border-slate-200">{item.sales_am}</td>
                    <td className="py-2 px-3 text-center border-r border-border/60 print:border-slate-200">{item.sales_pm}</td>
                    <td className="py-2 px-3 text-center font-medium">{item.ending_qty}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-6 animate-in fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
        <Link to="/reports" className="inline-flex items-center text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Reports Library
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={handlePrint} className="border-border text-foreground font-semibold hover:bg-muted">
            <Printer className="w-4 h-4 mr-2" />
            Print
          </Button>
          <Button variant="outline" onClick={handleExportPdf} className="bg-rose-600 hover:bg-rose-700 text-white border-transparent font-semibold" disabled={isExportingPdf}>
            {isExportingPdf ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
            PDF
          </Button>
          <Button variant="outline" onClick={handleExportXlsx} className="bg-emerald-600 hover:bg-emerald-700 text-white border-transparent font-semibold" disabled={isExportingXlsx}>
            {isExportingXlsx ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}
            EXCEL
          </Button>
          <Button variant="outline" onClick={handleExportCsv} className="bg-primary hover:bg-primary/90 text-primary-foreground border-transparent font-semibold" disabled={isExportingCsv}>
            {isExportingCsv ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
            CSV
          </Button>
        </div>
      </div>

      {/* Printable Report Document */}
      <div className="bg-card text-card-foreground border border-border p-6 sm:p-10 shadow-xs rounded-xl print:bg-white print:text-black print:shadow-none print:border-none print:p-0 font-mono" id="printable-report">
        <div className="text-center mb-10 border-b border-border print:border-slate-300 pb-6">
          <h1 className="text-2xl font-bold tracking-widest mb-1 uppercase text-foreground print:text-black">KUVENTORY</h1>
          <h2 className="text-lg font-bold text-muted-foreground print:text-slate-700 mb-4 uppercase">Daily Inventory Report</h2>
          <div className="flex flex-col sm:flex-row justify-center gap-4 text-sm text-muted-foreground print:text-slate-600">
            <p><span className="font-bold text-foreground print:text-black">DATE:</span> {format(new Date(report.inventory_date), 'MMMM dd, yyyy')}</p>
            <p className="hidden sm:block">|</p>
            <p><span className="font-bold text-foreground print:text-black">STATUS:</span> {report.status}</p>
            <p className="hidden sm:block">|</p>
            <p><span className="font-bold text-foreground print:text-black">ID:</span> {report.id.split('-')[0].toUpperCase()}</p>
          </div>
        </div>

        {renderPrintableTable(grilledItems, 'GRILLED STOCK')}
        {renderPrintableTable(portionItems, 'PORTION STOCK')}
        {renderPrintableTable(perCaseItems, 'PER CASES')}

        <div className="mt-12 pt-8 border-t border-border print:border-slate-300 grid grid-cols-2 gap-8 text-sm">
          <div>
            <p className="mb-8 font-bold text-foreground print:text-black">PREPARED BY:</p>
            <div className="border-b border-border print:border-slate-800 w-3/4 mb-1"></div>
            <p className="text-muted-foreground print:text-slate-600 text-xs">Name &amp; Signature</p>
          </div>
          <div>
            <p className="mb-8 font-bold text-foreground print:text-black">FINALIZED BY:</p>
            <div className="border-b border-border print:border-slate-800 w-3/4 mb-1"></div>
            <p className="text-muted-foreground print:text-slate-600 text-xs">Supervisor Signature</p>
          </div>
        </div>
      </div>
    </div>
  );
}
