/**
 * local-cron-daemon.mjs
 * Auto-runs all EYES cron jobs every 30 minutes.
 * Start once in a terminal and leave it running alongside npm run dev.
 *
 * Usage: node scripts/local-cron-daemon.mjs
 * Stop:  Ctrl+C
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const BASE_URL    = 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET || '';
const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

const CRONS = [
  { name: 'Embeddings',    path: '/api/cron/embeddings',    method: 'GET'  },
  { name: 'State Vectors', path: '/api/cron/state-vectors', method: 'GET'  },
  { name: 'Cluster Users', path: '/api/cron/cluster-users', method: 'GET'  },
  { name: 'Sync',          path: '/api/cron/sync',          method: 'GET'  },
  { name: 'Actions',       path: '/api/actions/extract',    method: 'POST' },
];

async function runCron(name, path, method = 'GET') {
  console.log(`  ▶ ${name}...`);
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${CRON_SECRET}`,
        'content-type': 'application/json',
      },
    });
    const ms = Date.now() - start;
    if (res.ok) {
      console.log(`    ✅ ${name} done (${ms}ms)`);
    } else {
      const body = await res.text();
      console.log(`    ❌ ${name} failed (${res.status}) — ${body.slice(0, 120)}`);
    }
  } catch (err) {
    console.log(`    ❌ ${name} error — ${err.message}`);
  }
}

async function runAllCrons() {
  const now = new Date().toLocaleString();
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`⚡ EYES Cron Run — ${now}`);
  console.log('─'.repeat(50));

  for (const cron of CRONS) {
    await runCron(cron.name, cron.path, cron.method);
    await new Promise(r => setTimeout(r, 1500));
  }

  const next = new Date(Date.now() + INTERVAL_MS).toLocaleTimeString();
  console.log(`\n✅ Done. Next run at ${next}\n`);
}

async function waitForServer(retries = 10) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${BASE_URL}/api/platform-readiness`);
      if (res.ok || res.status === 401) return true;
    } catch { /* server not ready yet */ }
    console.log(`⏳ Waiting for dev server... (${i + 1}/${retries})`);
    await new Promise(r => setTimeout(r, 3000));
  }
  return false;
}

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║   EYES Cron Daemon — Auto-scheduler  ║');
  console.log(`║   Interval: every 30 minutes          ║`);
  console.log('║   Stop: Ctrl+C                        ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('');

  if (!CRON_SECRET) {
    console.warn('⚠️  CRON_SECRET not set — some crons may fail auth.\n');
  }

  // Wait for the dev server to be ready
  const ready = await waitForServer();
  if (!ready) {
    console.error('❌ Dev server not reachable at', BASE_URL);
    console.error('   Start it first: npm run dev');
    process.exit(1);
  }

  // Run immediately on start, then every 30 minutes
  await runAllCrons();
  setInterval(runAllCrons, INTERVAL_MS);
}

main();
