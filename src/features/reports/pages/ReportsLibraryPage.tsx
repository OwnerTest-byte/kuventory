import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useReportsList } from '../api/reports';
import { FileText, ChevronLeft, ChevronRight } from 'lucide-react';

export function ReportsLibraryPage() {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;
  const offset = (page - 1) * limit;

  const { data: reportsData, isLoading } = useReportsList({
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    status: status || undefined,
    limit,
    offset,
  });

  const reports = reportsData?.data || [];
  const totalCount = reportsData?.count || 0;
  const totalPages = Math.ceil(totalCount / limit);

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <header className="flex flex-col gap-2 border-b pb-4">
        <h1 className="text-3xl font-bold tracking-tight">Report Library</h1>
        <p className="text-muted-foreground">
          View and export historical daily inventory reports.
        </p>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end bg-muted/30 p-4 rounded-md border">
        <div className="space-y-1">
          <label className="text-sm font-medium">From Date</label>
          <input
            type="date"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">To Date</label>
          <input
            type="date"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); setPage(1); }}
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Status</label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          >
            <option value="">All Statuses</option>
            <option value="FINALIZED">Finalized</option>
            <option value="CORRECTED">Corrected</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
      </div>

      {/* Report List */}
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr className="border-b">
              <th className="h-10 px-4 text-left font-medium">Date</th>
              <th className="h-10 px-4 text-left font-medium">Type</th>
              <th className="h-10 px-4 text-left font-medium">Status</th>
              <th className="h-10 px-4 text-left font-medium">Version</th>
              <th className="h-10 px-4 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-muted-foreground">Loading reports...</td>
              </tr>
            ) : reports.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-muted-foreground">No reports found matching your filters.</td>
              </tr>
            ) : (
              reports.map((report) => (
                <tr key={report.id} className="border-b last:border-0 hover:bg-muted/25 transition-colors">
                  <td className="p-4 font-medium">{report.report_date}</td>
                  <td className="p-4">Daily Inventory</td>
                  <td className="p-4">
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-primary/10 text-primary">
                      {report.status}
                    </span>
                  </td>
                  <td className="p-4 text-muted-foreground">v{report.version}</td>
                  <td className="p-4 text-right">
                    <Link
                      to={`/reports/${report.id}`}
                      className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-3"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      Open
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-end space-x-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 disabled:opacity-50"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Previous
          </button>
          <div className="text-sm text-muted-foreground font-medium">
            Page {page} of {totalPages}
          </div>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 disabled:opacity-50"
          >
            Next <ChevronRight className="w-4 h-4 ml-1" />
          </button>
        </div>
      )}
    </div>
  );
}
