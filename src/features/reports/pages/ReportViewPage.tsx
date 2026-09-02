import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useReport } from '../api/reports';
import { Download, FileSpreadsheet, FileText, ArrowLeft, Loader2 } from 'lucide-react';
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

  const handleExportPdf = async () => {
    try {
      setIsExportingPdf(true);
      const { exportToPdf } = await import('../export/pdf');
      exportToPdf(report);
    } catch (err) {
      console.error('Failed to export PDF:', err);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportXlsx = async () => {
    try {
      setIsExportingXlsx(true);
      const { exportToXlsx } = await import('../export/xlsx');
      exportToXlsx(report);
    } catch (err) {
      console.error('Failed to export XLSX:', err);
      alert('Failed to generate Spreadsheet. Please try again.');
    } finally {
      setIsExportingXlsx(false);
    }
  };

  const handleExportCsv = async () => {
    try {
      setIsExportingCsv(true);
      const { exportToCsv } = await import('../export/csv');
      exportToCsv(report);
    } catch (err) {
      console.error('Failed to export CSV:', err);
      alert('Failed to generate CSV. Please try again.');
    } finally {
      setIsExportingCsv(false);
    }
  };

  const renderTable = (tableItems: ReportItem[], title: string) => {
    if (tableItems.length === 0) return null;
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr className="border-b">
                <th className="h-10 px-4 text-left font-medium">Item</th>
                <th className="h-10 px-4 text-right font-medium w-24">BEG</th>
                <th className="h-10 px-4 text-right font-medium w-24">ADD</th>
                <th className="h-10 px-4 text-right font-bold text-foreground w-24">TOTAL</th>
                <th className="h-10 px-4 text-right font-medium w-24">AM</th>
                <th className="h-10 px-4 text-right font-medium w-24">PM</th>
                <th className="h-10 px-4 text-right font-bold text-foreground w-24">END</th>
              </tr>
            </thead>
            <tbody>
              {tableItems.map((item) => (
                <tr key={item.id} className="border-b last:border-0 hover:bg-muted/25 transition-colors">
                  <td className="p-4 font-medium" data-testid={`report-item-name-${item.item_name}`}>
                    {item.item_name}
                    <div className="text-xs text-muted-foreground font-normal">
                      {item.category_name} &bull; {item.unit}
                    </div>
                  </td>
                  <td className="p-4 text-right">{item.beg}</td>
                  <td className="p-4 text-right">{item.add}</td>
                  <td className="p-4 text-right font-bold">{item.total}</td>
                  <td className="p-4 text-right">{item.am}</td>
                  <td className="p-4 text-right">{item.pm}</td>
                  <td className="p-4 text-right font-bold text-primary">{item.ending}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
      
      <div className="flex items-center gap-4">
        <Link to="/reports" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Reports
        </Link>
      </div>

      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b pb-6">
        <div className="space-y-2">
          <div className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-primary/10 text-primary mb-2">
            {report.status}
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Daily Inventory Report</h1>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <p><span className="font-medium text-foreground">Date:</span> {report.report_date}</p>
            <p><span className="font-medium text-foreground">Version:</span> {report.version}</p>
            <p><span className="font-medium text-foreground">Finalized:</span> {new Date(report.generated_at).toLocaleString()}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button 
            onClick={handleExportPdf}
            disabled={isExportingPdf}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 disabled:opacity-50"
          >
            {isExportingPdf ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2 text-red-500" />}
            PDF
          </button>
          <button 
            onClick={handleExportXlsx}
            disabled={isExportingXlsx}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 disabled:opacity-50"
          >
            {isExportingXlsx ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-2 text-green-600" />}
            XLSX
          </button>
          <button 
            onClick={handleExportCsv}
            disabled={isExportingCsv}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 disabled:opacity-50"
          >
            {isExportingCsv ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2 text-blue-500" />}
            CSV
          </button>
        </div>
      </header>

      <div className="space-y-8">
        {renderTable(portionItems, 'PORTION STOCK')}
        {renderTable(perCaseItems, 'PER CASES')}
      </div>

    </div>
  );
}
