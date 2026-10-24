import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function main() {
  console.log('Running live DB privilege inspection on:', SUPABASE_URL);
  const { data, error } = await supabase.rpc('inspect_live_db_privileges');
  if (error) {
    console.error('Error invoking inspect_live_db_privileges:', error);
    process.exit(1);
  }

  console.log('\n--- LIVE DB PRIVILEGE INSPECTION REPORT ---');
  console.log(JSON.stringify(data, null, 2));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
