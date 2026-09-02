export interface DailyInventoryItem {
  id: string;
  daily_inventory_id: string;
  item_id: string;
  beg: number;
  add: number;
  total: number;
  am: number;
  pm: number;
  ending: number;
  inventory_items?: {
    name: string;
    unit: string;
    categories?: {
      name: string;
    };
  };
}

export interface DailyInventory {
  id: string;
  inventory_date: string;
  state: 'DRAFT' | 'FINALIZED' | 'ARCHIVED';
  created_by: string;
  finalized_by: string | null;
  finalized_at: string | null;
  daily_inventory_items?: DailyInventoryItem[];
}
