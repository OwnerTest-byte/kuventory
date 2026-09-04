-- 20260905004000_system_settings_and_suppliers.sql
-- System-Centered Tables for KUVENTORY Restaurant MIS:
-- 1. system_settings (Establishment profile, operational configuration, notification thresholds)
-- 2. suppliers (Comprehensive supplier directory with contact details, lead times, payment terms)
-- 3. Historical report generation for 2026-09-04

-- A. CREATE TABLE system_settings
CREATE TABLE IF NOT EXISTS public.system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view system settings"
  ON public.system_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can update system settings"
  ON public.system_settings FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Admins can insert system settings"
  ON public.system_settings FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

-- Seed initial settings
INSERT INTO public.system_settings (key, value)
VALUES 
  ('establishment', '{
    "name": "Kuventory Restaurant & Bar",
    "address": "123 Katipunan Avenue, Quezon City, Metro Manila, Philippines",
    "contact_number": "+63 917 123 4567",
    "email": "contact@kuventory.local",
    "operating_hours": "10:00 AM - 12:00 MN",
    "currency": "PHP (₱)",
    "tax_rate": 12,
    "receipt_footer": "Thank you for dining at Kuventory! Please come again."
  }'::jsonb),
  ('notifications', '{
    "email_alerts": true,
    "low_stock_threshold": 10,
    "expiry_warning_days": 30,
    "auto_daily_reminder": true,
    "sms_alerts": false
  }'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- B. CREATE TABLE suppliers
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  contact_person TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  lead_time_days INTEGER DEFAULT 1,
  payment_terms TEXT DEFAULT 'COD',
  notes TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view suppliers"
  ON public.suppliers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert suppliers"
  ON public.suppliers FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admins can update suppliers"
  ON public.suppliers FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Admins can delete suppliers"
  ON public.suppliers FOR DELETE
  TO authenticated
  USING (is_admin());

-- Seed verified suppliers
INSERT INTO public.suppliers (name, contact_person, phone, email, address, lead_time_days, payment_terms, notes)
VALUES
  ('San Miguel Brewery Inc.', 'Carlos Mendoza', '+63 2 8632 3000', 'orders@smb.sanmiguel.com.ph', '40 San Miguel Ave, Mandaluyong, Metro Manila', 2, 'Net 30', 'Primary brewery provider for bottled beers and crates'),
  ('Metro Beverage Distributors Co.', 'Elena Ramos', '+63 917 555 0192', 'sales@metrobev.ph', 'North Harbor Logistics Hub, Tondo, Manila', 1, 'Net 15', 'Secondary beverage wholesale distributor for quick restocking'),
  ('Coca-Cola Beverages Philippines, Inc.', 'Ramon Bautista', '+63 2 8866 2000', 'ccbpi.orders@coca-cola.com.ph', 'Bonifacio Global City, Taguig City', 2, 'Net 30', 'Official provider for Coke, Royal, Sprite and bottled mineral water'),
  ('Mega Manila Refreshments Logistics', 'Jessica Tan', '+63 918 444 8821', 'distro@megarefresh.ph', 'Valenzuela Industrial Park, Valenzuela City', 1, 'COD', 'Fast emergency supplier for canned and bottled sodas'),
  ('Bayanihan Poultry Dressing Corp', 'Danilo Cruz', '+63 920 333 1190', 'orders@bayanihanpoultry.ph', 'San Jose del Monte, Bulacan', 1, 'COD', 'Fresh poultry supplier for Chicken BBQ, Inasal, Isaw, and Neck'),
  ('Fresh Choice Poultry Farms', 'Marites Dizon', '+63 919 777 4410', 'freshchoice@poultryfarms.ph', 'Santa Maria, Bulacan', 1, 'COD', 'Backup supplier for dressed chicken and skewer portions'),
  ('Metro Manila Pork Meat Wholesalers', 'Vicente Mercado', '+63 922 888 3312', 'vince@metropork.ph', 'FTI Complex, Taguig City', 1, 'COD', 'Premium supplier for Liempo, Pork BBQ strips, and pork ears'),
  ('Bulacan Pork Traders Coop', 'Eduardo Reyes', '+63 928 666 5520', 'coop@bulacanpork.ph', 'Bocaue, Bulacan', 1, 'COD', 'Cooperative meat partner with certified NMIS grade pork'),
  ('Dagupan Marine & Seafood Supply', 'Rodrigo Perez', '+63 917 222 9931', 'dagupan.fish@seafoodph.com', 'Navotas Fish Port Complex, Navotas City', 1, 'COD', 'Daily delivery of fresh boneless Dagupan Bangus milkfish'),
  ('Pangasinan Fisheries Coop', 'Nenita Garcia', '+63 918 111 6645', 'pangasinan.coop@fisheries.ph', 'Lucap Wharf, Alaminos, Pangasinan', 2, 'COD', 'Aquaculture supplier for live and fresh grilled tilapia'),
  ('Purefoods Hormel Distribution', 'Albert Santos', '+63 2 8588 5000', 'orders@purefoodshormel.com.ph', 'Ortigas Center, Pasig City', 2, 'Net 30', 'Provider for classic skewered red hotdogs'),
  ('Universal Robina Corp', 'Grace Lim', '+63 2 8633 7631', 'cfd.orders@urc.com.ph', 'Tera Tower, Bridgetowne, Quezon City', 3, 'Net 30', 'Direct manufacturer for bar snacks, chips, and finger foods'),
  ('Direct Wholesale Convenience Mart', 'Arthur Go', '+63 917 999 1234', 'arthur@directwholesale.ph', 'Divisoria Commercial Center, Manila', 1, 'COD', 'Local retail partner for dry goods and condiments'),
  ('Direct Deli Wholesale Trading', 'Teresa Aquino', '+63 921 555 7890', 'orders@directdeli.ph', 'Balintawak Wholesale Market, Quezon City', 1, 'COD', 'Wholesale dry ingredients and barbecue skewers supplier')
ON CONFLICT (name) DO NOTHING;

-- C. Helper RPC Functions
CREATE OR REPLACE FUNCTION public.get_system_setting(p_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_val JSONB;
BEGIN
  SELECT value INTO v_val FROM public.system_settings WHERE key = p_key;
  RETURN v_val;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_system_setting(p_key TEXT, p_value JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'ADMIN'
  ) THEN
    RAISE EXCEPTION 'Not authorized. Admin access required.';
  END IF;

  INSERT INTO public.system_settings (key, value, updated_at, updated_by)
  VALUES (p_key, p_value, now(), auth.uid())
  ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = now(),
      updated_by = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_system_setting(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_system_setting(TEXT, JSONB) TO authenticated;
