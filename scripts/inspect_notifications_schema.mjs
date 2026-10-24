import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || process.env.E2E_SUPER_ADMIN_PASSWORD;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function main() {
  await supabase.auth.signInWithPassword({
    email: process.env.SUPER_ADMIN_EMAIL || 'superadmin@kuventory.com',
    password: SUPER_ADMIN_PASSWORD
  });

  // Query a sample notification to see available keys
  const { data: sample, error: sampleErr } = await supabase
    .from('notifications')
    .select('*')
    .limit(1);

  console.log('Sample notification keys:', sample && sample[0] ? Object.keys(sample[0]) : 'None');
  console.log('Sample row:', sample ? sample[0] : null);
}

main().catch(console.error);
