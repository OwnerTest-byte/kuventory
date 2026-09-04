export type Category = {
  id: string;
  name: string;
  created_at: string;
};

export type InventoryItem = {
  id: string;
  item_code: string;
  item_name: string;
  description: string | null;
  category_id: string;
  category_name?: string;
  inventory_type: 'PORTION STOCK' | 'PER CASES';
  unit: string;
  unit_cost: number;
  supplier_a: string | null;
  supplier_b: string | null;
  min_qty: number;
  current_qty: number;
  image_path: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type InventoryStock = InventoryItem; // In this version, current_qty is part of InventoryItem

export type StockBatch = {
  id: string;
  item_id: string;
  batch_code: string;
  quantity: number;
  initial_quantity: number;
  expiry_date: string;
  created_at: string;
};

export type StockTransaction = {
  id: string;
  item_id: string;
  item_name?: string;
  user_id: string | null;
  user_name?: string;
  action_type: 'ADD' | 'REMOVE' | 'ADJUST';
  quantity: number;
  previous_balance: number;
  new_balance: number;
  batch_id: string | null;
  batch_code?: string;
  reason: string;
  created_at: string;
};

export type DailyInventorySession = {
  id: string;
  inventory_date: string;
  status: 'DRAFT' | 'FINALIZED';
  prepared_by: string | null;
  finalized_by: string | null;
  created_at: string;
  finalized_at: string | null;
};

export type DailyInventoryEntry = {
  id: string;
  session_id: string;
  item_id: string;
  item_name?: string;
  unit?: string;
  section: 'PORTION STOCK' | 'PER CASES';
  beginning_qty: number;
  add_qty: number;
  total_stock: number;
  sales_am: number;
  sales_pm: number;
  ending_qty: number;
};export type AppNotification = {
  id: string;
  title: string;
  message: string;
  type: 'LOW_STOCK' | 'EXPIRING_SOON' | 'OUT_OF_STOCK' | 'EXPIRED';
  item_id?: string;
  is_read: boolean;
  created_at: string;
};
