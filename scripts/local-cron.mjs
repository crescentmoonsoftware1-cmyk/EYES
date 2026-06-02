/**
 * local-cron.mjs
 * Run this script to trigger all EYES cron jobs locally.
 * Usage: node scripts/local-cron.mjs
 *
 * For daily auto-run: use Windows Task Scheduler or just run manually.
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load .env.local
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const BASE_URL = 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET || '';

const CRONS = [
  { name: 'Embeddings',    path: '/api/cron/embeddings',    method: 'GET'  },
  { name: 'State Vectors', path: '/api/cron/state-vectors', method: 'GET'  },
  { name: 'Cluster Users', path: '/api/cron/cluster-users', method: 'GET'  },
  { name: 'Sync',          path: '/api/cron/sync',          method: 'GET'  },
  { name: 'Actions',       path: '/api/actions/extract',    method: 'POST' },
];

async function runCron(name, path, method = 'GET') {
  console.log(`\n▶ Running: ${name}...`);
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${CRON_SECRET}`,
        'content-type': 'application/json',
      },
    });
    const body = await res.text();
    const ms = Date.now() - start;
    if (res.ok) {
      console.log(`  ✅ ${name} done (${ms}ms)`);
    } else {
      console.log(`  ❌ ${name} failed (${res.status}) — ${body.slice(0, 200)}`);
    }
  } catch (err) {
    console.log(`  ❌ ${name} error — ${err.message}`);
  }
}

async function main() {
  console.log('=== EYES Local Cron Runner ===');
  console.log(`Time: ${new Date().toLocaleString()}`);
  console.log(`Target: ${BASE_URL}`);

  if (!CRON_SECRET) {
    console.warn('\n⚠️  CRON_SECRET not found in .env.local — some crons may fail auth.\n');
  }

  for (const cron of CRONS) {
    await runCron(cron.name, cron.path, cron.method);
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('\n✅ All crons complete.\n');
}

main();
