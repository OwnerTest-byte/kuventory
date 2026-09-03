export type InventoryItem = {
  id: string;
  category_id: string;
  category_name?: string;
  name: string;
  description: string | null;
  supplier_a: string | null;
  supplier_b: string | null;
  unit: string;
  unit_cost: number;
  min_quantity: number;
  is_active: boolean;
  is_archived: boolean;
};

export type InventoryStock = InventoryItem & {
  total_quantity: number;
};

export type StockMovement = {
  movement_id: string;
  type: 'ADD' | 'REMOVE' | 'ADJUST';
  quantity_before: number;
  quantity_change: number;
  quantity_after: number;
  reason: string | null;
  created_at: string;
  item_id: string;
  item_name: string;
  unit: string;
  batch_id: string | null;
  expiry_date: string | null;
  received_date: string | null;
  actor_id: string | null;
  actor_name: string | null;
};

export type StockBatch = {
  id: string;
  item_id: string;
  quantity: number;
  expiry_date: string | null;
  received_date: string;
};

export type AppNotification = {
  id: string;
  user_id: string | null;
  type: 'LOW_STOCK' | 'OUT_OF_STOCK' | 'EXPIRING_SOON' | 'EXPIRED' | 'SYSTEM';
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  dedup_key: string | null;
  item_id: string | null;
  batch_id: string | null;
};