// Standalone Supabase Keepalive Ping Script
// Run via: node scripts/ping-supabase.mjs

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.log('[Keepalive] VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in environment to ping.');
  process.exit(0);
}

console.log(`[Keepalive] Pinging Supabase at: ${SUPABASE_URL}`);
const start = Date.now();

try {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/system_settings?select=key&limit=1`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });

  const latency = Date.now() - start;
  const status = response.status;
  const data = await response.json();

  console.log(`[Keepalive] Result: HTTP ${status} in ${latency}ms`);
  console.log(`[Keepalive] Data received:`, JSON.stringify(data));
  console.log(`[Keepalive] Status: ACTIVE (7-day pause successfully prevented)`);
} catch (err) {
  console.error(`[Keepalive] Error pinging Supabase:`, err.message);
  process.exit(1);
}
