/**
 * Run this script to trigger a full historical backfill for all connected platforms.
 * Usage: node scripts/trigger-backfill.mjs
 *
 * Requirements:
 *  - Dev server must be running at http://localhost:3000
 *  - CRON_SECRET must be set in .env.local
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local manually
const envPath = resolve(__dirname, '../.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const env = Object.fromEntries(
  envContent.split('\n')
    .filter(line => line.trim() && !line.startsWith('#'))
    .map(line => {
      const idx = line.indexOf('=');
      if (idx === -1) return null;
      const key = line.slice(0, idx).trim();
      // Remove surrounding quotes from value if present
      let val = line.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      return [key, val];
    })
    .filter(Boolean)
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = env.SUPABASE_SERVICE_ROLE_KEY;
const BASE_URL     = 'http://localhost:3000';
const CRON_SECRET  = env.CRON_SECRET;

if (!SUPABASE_URL || !SERVICE_KEY || !CRON_SECRET) {
  console.error('❌ Missing env vars. Check .env.local for NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// Get all users with connected platforms
const { data: tokens } = await supabase
  .from('oauth_tokens')
  .select('user_id, platform')
  .order('platform');

if (!tokens || tokens.length === 0) {
  console.log('No connected platforms found.');
  process.exit(0);
}

// Group by user
const userMap = new Map();
for (const { user_id, platform } of tokens) {
  if (!userMap.has(user_id)) userMap.set(user_id, []);
  userMap.get(user_id).push(platform);
}

console.log(`\n🧠 EYES Backfill Trigger`);
console.log(`Found ${userMap.size} user(s) with ${tokens.length} connected platform(s)\n`);

const SUPPORTED = new Set(['github', 'gmail', 'google_calendar', 'notion', 'reddit', 'slack', 'discord']);

for (const [userId, platforms] of userMap) {
  console.log(`\n👤 User: ${userId}`);

  for (const platform of platforms) {
    if (!SUPPORTED.has(platform)) {
      console.log(`  ⏭️  ${platform} — not yet supported`);
      continue;
    }

    const routePlatform = platform === 'google_calendar' ? 'google-calendar' : platform.replace(/_/g, '-');
    const url = `${BASE_URL}/api/sync/${routePlatform}?mode=backfill`;

    console.log(`  🔄 Starting backfill: ${platform}...`);
    const start = Date.now();

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'x-cron-secret': CRON_SECRET,
          'x-cron-user-id': userId,
          'Content-Type': 'application/json',
        },
      });

      const body = await res.json().catch(() => ({}));
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);

      if (res.ok) {
        console.log(`  ✅ ${platform} — ${body.syncedMessages ?? body.syncedRepos ?? 'done'} items (${elapsed}s)`);
      } else {
        console.log(`  ❌ ${platform} — ${res.status}: ${body.error ?? 'unknown error'}`);
      }
    } catch (err) {
      console.log(`  ❌ ${platform} — ${err.message}`);
    }

    // Small delay between platforms
    await new Promise(r => setTimeout(r, 500));
  }
}

console.log('\n✅ Backfill complete. Check the memories table in Supabase.\n');
