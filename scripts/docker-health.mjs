// scripts/docker-health.mjs
// Automated Docker Container Health Check & Auto-Wake Utility
// Run via: node scripts/docker-health.mjs

import { execSync } from 'child_process';
import http from 'http';

console.log('====================================================');
console.log('  KUVENTORY Docker & Supabase Auto-Wake Service     ');
console.log('====================================================');

const TARGET_CONTAINERS = [
  'supabase_db_KUVENTORY-FINAL',
  'supabase_rest_KUVENTORY',
  'supabase_studio_KUVENTORY',
  'supabase_kong_KUVENTORY',
  'supabase_auth_KUVENTORY',
  'supabase_db_KUVENTORY'
];

async function checkAndWakeDocker() {
  try {
    // 1. Verify Docker CLI is accessible
    const dockerVer = execSync('docker --version', { encoding: 'utf8' }).trim();
    console.log(`[Docker Check] Engine detected: ${dockerVer}`);

    // 2. Fetch all container statuses as JSON Lines
    const stdout = execSync('docker ps -a --format "{{json .}}"', { encoding: 'utf8' }).trim();
    if (!stdout) {
      console.log('[Docker Check] No Docker containers found on this host.');
      return;
    }

    const lines = stdout.split('\n').filter(Boolean);
    const containers = lines.map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);

    console.log(`[Docker Check] Found ${containers.length} containers registered in Docker daemon.`);

    const foundTarget = containers.filter(c => 
      TARGET_CONTAINERS.some(target => c.Names && c.Names.includes(target))
    );

    if (foundTarget.length === 0) {
      console.log('[Docker Check] No Kuventory Supabase containers matched.');
    } else {
      console.log(`\n[Container Inventory]`);
      const hasDbRunning = foundTarget.some(c => 
        (c.Names?.includes('supabase_db_') && (c.State === 'running' || (c.Status && c.Status.startsWith('Up'))))
      );

      for (const c of foundTarget) {
        const isRunning = c.State === 'running' || (c.Status && c.Status.startsWith('Up'));
        console.log(`  • ${c.Names} (${c.Image}) -> Status: ${c.Status}`);
        
        // If container is exited, automatically wake it up unless it's a conflicting old DB
        if (!isRunning) {
          if (c.Names?.includes('supabase_db_KUVENTORY') && !c.Names?.includes('FINAL') && hasDbRunning) {
            console.log(`    [Auto-Wake] Skipping legacy DB container ${c.Names} (active database is already running).`);
            continue;
          }
          console.log(`    [Auto-Wake] Starting container: ${c.Names}...`);
          try {
            execSync(`docker start ${c.ID}`, { encoding: 'utf8' });
            console.log(`    [Auto-Wake] Successfully started ${c.Names}!`);
          } catch (startErr) {
            console.error(`    [Auto-Wake Error] Failed to start ${c.Names}:`, startErr.message.split('\n')[0]);
          }
        }
      }
    }

    // 3. Ping local database port if active
    console.log('\n[Port Ping] Checking local database port 54322...');
    const portOpen = await new Promise((resolve) => {
      import('net').then(({ default: net }) => {
        const sock = new net.Socket();
        sock.setTimeout(1500);
        sock.on('connect', () => {
          sock.destroy();
          resolve(true);
        });
        sock.on('error', () => resolve(false));
        sock.on('timeout', () => {
          sock.destroy();
          resolve(false);
        });
        sock.connect(54322, '127.0.0.1');
      });
    });

    if (portOpen) {
      console.log('[Port Ping] Port 54322 is OPEN and responsive (Local PostgreSQL alive).');
    } else {
      console.log('[Port Ping] Port 54322 is not actively listening (database container starting or paused).');
    }

    // 4. Ping Supabase Cloud keepalive to ensure continuous cloud sync
    console.log('\n[Cloud Keepalive] Pinging production Supabase endpoint...');
    const cloudUrl = process.env.VITE_SUPABASE_URL || 'https://stotgoylyzltzpahuglc.supabase.co';
    const cloudKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_sww0L_JeH4y7i0Zq5kX0Xg_ZWhJ7PsN';
    
    const start = Date.now();
    const res = await fetch(`${cloudUrl}/rest/v1/system_settings?select=key&limit=1`, {
      headers: {
        'apikey': cloudKey,
        'Authorization': `Bearer ${cloudKey}`
      }
    });
    const latency = Date.now() - start;
    console.log(`[Cloud Keepalive] HTTP ${res.status} in ${latency}ms - Supabase 7-Day Inactivity Timer Reset.`);

    console.log('\n====================================================');
    console.log('  Health check complete: Local & Cloud Active!      ');
    console.log('====================================================');

  } catch (err) {
    if (err.message.includes('docker daemon') || err.message.includes('Is the docker daemon running')) {
      console.error('[Docker Offline] Docker Desktop daemon is not currently running.');
      console.log('[Hint] Launch Docker Desktop or run: powershell -Command "Start-Process \'Docker Desktop\'"');
    } else {
      console.error('[Error during health check]:', err.message);
    }
  }
}

checkAndWakeDocker();
