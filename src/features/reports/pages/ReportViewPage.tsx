import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useReport } from '../api/reports';
import { Download, FileSpreadsheet, FileText, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
        <div className="rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right w-24">BEG</TableHead>
                <TableHead className="text-right w-24">ADD</TableHead>
                <TableHead className="text-right w-24 font-bold text-foreground">TOTAL</TableHead>
                <TableHead className="text-right w-24">AM</TableHead>
                <TableHead className="text-right w-24">PM</TableHead>
                <TableHead className="text-right w-24 font-bold text-foreground">END</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium" data-testid={`report-item-name-${item.item_name}`}>
                    {item.item_name}
                    <div className="text-xs text-muted-foreground font-normal">
                      {item.category_name} &bull; {item.unit}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{item.beg}</TableCell>
                  <TableCell className="text-right">{item.add}</TableCell>
                  <TableCell className="text-right font-bold">{item.total}</TableCell>
                  <TableCell className="text-right">{item.am}</TableCell>
                  <TableCell className="text-right">{item.pm}</TableCell>
                  <TableCell className="text-right font-bold text-primary">{item.ending}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
          <Badge variant={report.status === 'ACTIVE' ? 'default' : report.status === 'CORRECTED' ? 'outline' : 'secondary'} className="mb-2">
            {report.status}
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight">Daily Inventory Report</h1>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <p><span className="font-medium text-foreground">Date:</span> {report.report_date}</p>
            <p><span className="font-medium text-foreground">Version:</span> {report.version}</p>
            <p><span className="font-medium text-foreground">Finalized:</span> {new Date(report.generated_at).toLocaleString()}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button 
            variant="outline"
            onClick={handleExportPdf}
            disabled={isExportingPdf}
          >
            {isExportingPdf ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2 text-red-500" />}
            PDF
          </Button>
          <Button 
            variant="outline"
            onClick={handleExportXlsx}
            disabled={isExportingXlsx}
          >
            {isExportingXlsx ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-2 text-green-600" />}
            XLSX
          </Button>
          <Button 
            variant="outline"
            onClick={handleExportCsv}
            disabled={isExportingCsv}
          >
            {isExportingCsv ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2 text-blue-500" />}
            CSV
          </Button>
        </div>
      </header>

      <div className="space-y-8">
        {renderTable(portionItems, 'PORTION STOCK')}
        {renderTable(perCaseItems, 'PER CASES')}
      </div>

    </div>
  );
}
