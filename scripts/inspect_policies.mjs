import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function main() {
  const { data: policies, error } = await supabase.rpc('inspect_all_live_policies');
  if (error) {
    console.error('Error fetching policies:', error);
    process.exit(1);
  }

  console.log(`\n=== TOTAL POLICIES FOUND: ${policies.length} ===`);
  
  // 1. Group policies by tablename
  const byTable = {};
  for (const p of policies) {
    if (!byTable[p.tablename]) byTable[p.tablename] = [];
    byTable[p.tablename].push(p);
  }

  // 2. Print specifically notifications policies
  console.log('\n--- POLICIES ON "notifications" TABLE ---');
  console.log(JSON.stringify(byTable['notifications'] || [], null, 2));

  // 3. Print table names and policy counts
  console.log('\n--- POLICY COUNTS BY TABLE ---');
  for (const [table, pols] of Object.entries(byTable)) {
    console.log(`${table}: ${pols.length} policies (${pols.map(p => p.policyname).join(', ')})`);
  }
}

main().catch(console.error);
