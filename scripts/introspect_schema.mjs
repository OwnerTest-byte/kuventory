import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function inspect() {
  const { data: authData } = await supabase.auth.signInWithPassword({
    email: process.env.ROOT_ADMIN_EMAIL || process.env.SUPER_ADMIN_EMAIL || 'superadmin@kuventory.com',
    password: process.env.SUPER_ADMIN_PASSWORD || process.env.E2E_SUPER_ADMIN_PASSWORD || ''
  });

  const tables = ['daily_inventory', 'daily_inventory_items', 'recovery_points', 'stock_history_view'];

  for (const t of tables) {
    console.log(`\n--- COLUMNS FOR ${t} ---`);
    const { data, error } = await supabase.from(t).select('*').limit(1);
    if (error) {
      console.log(`Error querying ${t}:`, error.message);
    } else if (data && data.length > 0) {
      console.log('Sample row keys:', Object.keys(data[0]));
    } else {
      console.log('Empty table or zero rows. Let us test columns by selecting dummy.');
    }
  }

  // Also query PostgreSQL information_schema if permitted via RPC or query
  const { data: infoData, error: infoErr } = await supabase
    .from('inventory_items')
    .select('*')
    .limit(1);
  console.log('\ninventory_items sample keys:', data => data ? Object.keys(data) : 'none');
}

inspect();
