-- 1. PROFILES (Extends auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'USER')) DEFAULT 'USER',
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. CATEGORIES
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. INVENTORY ITEMS (Master Data)
CREATE TABLE public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.categories(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT,
  unit TEXT NOT NULL,
  unit_cost NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  supplier_a TEXT,
  supplier_b TEXT,
  min_quantity NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (min_quantity >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. STOCK BATCHES (Live physical stock)
CREATE TABLE public.stock_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  quantity NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  expiry_date DATE,
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. STOCK MOVEMENTS (Audit log for physical changes)
CREATE TABLE public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES public.stock_batches(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('ADD', 'REMOVE', 'ADJUST')),
  quantity_before NUMERIC(10, 2) NOT NULL,
  quantity_change NUMERIC(10, 2) NOT NULL,
  quantity_after NUMERIC(10, 2) NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. DAILY INVENTORY
CREATE TABLE public.daily_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_date DATE NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('DRAFT', 'FINALIZED', 'ARCHIVED')) DEFAULT 'DRAFT',
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  finalized_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. DAILY INVENTORY ITEMS
CREATE TABLE public.daily_inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_inventory_id UUID NOT NULL REFERENCES public.daily_inventory(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  beg NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (beg >= 0),
  add NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (add >= 0),
  total NUMERIC(10, 2) GENERATED ALWAYS AS (beg + add) STORED,
  am NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (am >= 0),
  pm NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (pm >= 0),
  ending NUMERIC(10, 2) GENERATED ALWAYS AS (beg + add - am - pm) STORED,
  UNIQUE(daily_inventory_id, item_id)
);

-- 8. REPORTS (Immutable header)
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_inventory_id UUID REFERENCES public.daily_inventory(id) ON DELETE SET NULL,
  report_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'CORRECTED', 'ARCHIVED')) DEFAULT 'ACTIVE',
  version INTEGER NOT NULL DEFAULT 1,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- 9. REPORT ITEMS (Immutable snapshot items)
CREATE TABLE public.report_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  category_name TEXT NOT NULL,
  beg NUMERIC(10, 2) NOT NULL,
  add NUMERIC(10, 2) NOT NULL,
  total NUMERIC(10, 2) NOT NULL,
  am NUMERIC(10, 2) NOT NULL,
  pm NUMERIC(10, 2) NOT NULL,
  ending NUMERIC(10, 2) NOT NULL
);

-- 10. NOTIFICATIONS
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  target_id UUID,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE, -- NULL means global
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. AUDIT LOGS
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_table TEXT NOT NULL,
  target_id UUID,
  old_data JSONB,
  new_data JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- INDEXES
CREATE INDEX idx_inventory_items_category ON public.inventory_items(category_id);
CREATE INDEX idx_stock_batches_item ON public.stock_batches(item_id);
CREATE INDEX idx_stock_batches_expiry ON public.stock_batches(expiry_date);
CREATE INDEX idx_stock_movements_item ON public.stock_movements(item_id);
CREATE INDEX idx_daily_inventory_date ON public.daily_inventory(inventory_date);
CREATE INDEX idx_daily_inventory_items_inventory ON public.daily_inventory_items(daily_inventory_id);
CREATE INDEX idx_reports_date ON public.reports(report_date);
CREATE INDEX idx_report_items_report ON public.report_items(report_id);
