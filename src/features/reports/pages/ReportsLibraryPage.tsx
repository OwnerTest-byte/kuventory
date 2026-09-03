import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useReportsList } from '../api/reports';
import { FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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
      <div className="flex flex-wrap gap-4 items-end bg-muted/30 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="space-y-1.5 flex-1 min-w-[200px]">
          <label className="text-sm font-medium">From Date</label>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
          />
        </div>
        <div className="space-y-1.5 flex-1 min-w-[200px]">
          <label className="text-sm font-medium">To Date</label>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); setPage(1); }}
          />
        </div>
        <div className="space-y-1.5 flex-1 min-w-[200px]">
          <label className="text-sm font-medium">Status</label>
          <Select 
            value={status} 
            onValueChange={(val) => { setStatus(val === 'all' ? '' : (val || '')); setPage(1); }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="ACTIVE">Active (Finalized)</SelectItem>
              <SelectItem value="CORRECTED">Corrected</SelectItem>
              <SelectItem value="ARCHIVED">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Report List */}
      <div className="rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Version</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Loading reports...</TableCell>
              </TableRow>
            ) : reports.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No reports found matching your filters.</TableCell>
              </TableRow>
            ) : (
              reports.map((report) => (
                <TableRow key={report.id}>
                  <TableCell className="font-medium">{report.report_date}</TableCell>
                  <TableCell>Daily Inventory</TableCell>
                  <TableCell>
                    <Badge variant={report.status === 'ACTIVE' ? 'default' : report.status === 'CORRECTED' ? 'outline' : 'secondary'}>
                      {report.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">v{report.version}</TableCell>
                  <TableCell className="text-right">
                    <Link
                      to={`/reports/${report.id}`}
                      className={buttonVariants({ variant: "default", size: "sm" })}
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      Open
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-end space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Previous
          </Button>
          <div className="text-sm text-muted-foreground font-medium">
            Page {page} of {totalPages}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
