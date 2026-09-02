export type InventoryItem = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  unit: string;
  unit_cost: number;
  min_quantity: number;
  is_active: boolean;
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
