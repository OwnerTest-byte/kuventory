import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useReportsList } from '../api/reports';
import { FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';

export function ReportsLibraryPage() {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;
  const offset = (page - 1) * limit;

  const { data: reportsData, isLoading } = useReportsList({
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    limit,
    offset,
  });

  const reports = reportsData?.data || [];
  const totalCount = reportsData?.count || 0;
  const totalPages = Math.ceil(totalCount / limit);

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <header className="flex flex-col gap-2 border-b pb-4 border-slate-200">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Report Library</h1>
        <p className="text-slate-500 font-medium">
          View and export historical daily inventory reports.
        </p>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="space-y-1.5 flex-1 min-w-[200px]">
          <label className="text-sm font-bold text-slate-700">From Date</label>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
            className="bg-white border-slate-300"
          />
        </div>
        <div className="space-y-1.5 flex-1 min-w-[200px]">
          <label className="text-sm font-bold text-slate-700">To Date</label>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); setPage(1); }}
            className="bg-white border-slate-300"
          />
        </div>
        
        <div className="flex gap-2 w-full md:w-auto">
          <Button 
            variant="outline" 
            className="flex-1 border-slate-300 text-slate-700 font-bold"
            onClick={() => {
              setFromDate('');
              setToDate('');
              setPage(1);
            }}
          >
            Clear Filters
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="font-bold text-slate-700">Inventory Date</TableHead>
                <TableHead className="font-bold text-slate-700">Status</TableHead>
                <TableHead className="font-bold text-slate-700">Finalized By</TableHead>
                <TableHead className="font-bold text-slate-700">Finalized At</TableHead>
                <TableHead className="text-right font-bold text-slate-700">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-slate-500 font-medium">Loading reports...</TableCell>
                </TableRow>
              ) : reports.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-slate-500 font-medium">No reports found.</TableCell>
                </TableRow>
              ) : (
                reports.map(report => (
                  <TableRow key={report.id} className="hover:bg-slate-50">
                    <TableCell className="font-semibold text-slate-900">
                      {format(new Date(report.inventory_date), 'MMMM dd, yyyy')}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-green-100 text-green-700">
                        {report.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-slate-600 font-medium">{report.finalized_by_name || 'System'}</TableCell>
                    <TableCell className="text-slate-600">
                      {report.finalized_at ? format(new Date(report.finalized_at), 'MMM dd, yyyy h:mm a') : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" className="font-bold border-slate-300 hover:bg-slate-100">
                        <Link to={`/reports/${report.id}`} className="flex items-center">
                          <FileText className="w-4 h-4 mr-2" />
                          View
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t pt-4 border-slate-200">
          <div className="text-sm text-slate-500 font-medium">
            Showing {offset + 1} to {Math.min(offset + limit, totalCount)} of {totalCount} reports
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="border-slate-300 text-slate-700"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="border-slate-300 text-slate-700"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
