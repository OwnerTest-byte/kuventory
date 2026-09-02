export interface ReportItem {
  id: string;
  report_id: string;
  item_name: string;
  category_name: string;
  description: string | null;
  unit: string;
  unit_cost: number;
  supplier_a: string | null;
  supplier_b: string | null;
  beg: number;
  add: number;
  total: number;
  am: number;
  pm: number;
  ending: number;
}

export interface Report {
  id: string;
  daily_inventory_id: string;
  report_date: string;
  status: 'ACTIVE' | 'CORRECTED' | 'ARCHIVED';
  version: number;
  generated_at: string;
  generated_by: string;
  report_items?: ReportItem[];
}

export interface ReportsFilter {
  fromDate?: string;
  toDate?: string;
  status?: string;
  limit?: number;
  offset?: number;
}
