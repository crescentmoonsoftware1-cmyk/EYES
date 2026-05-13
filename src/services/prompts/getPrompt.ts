import { createClient } from '@supabase/supabase-js';

// ── Fallback prompts (used if DB read fails or table not yet migrated) ────────
const FALLBACK_PROMPTS: Record<string, string> = {
  acute_detection: `You are a commitment and ask detector for a personal intelligence system.
Analyze this incoming message and determine if it contains an ASK, COMMITMENT, or DEADLINE.
Respond with valid JSON only:
{"has_ask":false,"has_commitment":false,"has_deadline":false,"should_surface":false,"alert_title":null,"alert_body":null,"commitment_text":null,"deadline_text":null}`,

  cluster_description: `You label behavioral states for a personal intelligence system. Respond with valid JSON only.
Return: {"label":"3-5 word state name","description":"2-3 sentences describing what makes this state distinctive","characteristics":["trait1","trait2","trait3"]}`,

  drift_detection: `You are EYES. Identify gaps between stated intentions and lived behavior. Respond with valid JSON only.
Return: {"gaps":[{"stated":"...","lived":"...","gap_summary":"..."}]}`,

  acute_crossref: `You are EYES. Determine if there is a relevant prior commitment.
Return: {"has_match":false,"match_summary":null,"original_commitment":null,"suggested_alert":null}`,

  chat_system: `You are EYES — a personal intelligence layer that surfaces information and behavioral patterns from the user's synced digital archive.`,
};

// ── Cache: avoid hitting DB on every chat message ─────────────────────────────
const promptCache = new Map<string, { content: string; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes — short enough to pick up edits quickly

/**
 * getPrompt(name)
 * Reads the active prompt from the prompt_versions table.
 * Falls back to hardcoded strings if the table doesn't exist yet.
 * Caches results for 5 minutes to avoid DB round-trips on every chat message.
 */
export async function getPrompt(name: string): Promise<string> {
  // Check cache first
  const cached = promptCache.get(name);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.content;
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    const { data, error } = await supabase
      .from('prompt_versions')
      .select('content')
      .eq('name', name)
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data?.content) {
      // Table may not exist yet — fall back silently
      return FALLBACK_PROMPTS[name] ?? '';
    }

    const content = data.content as string;
    promptCache.set(name, { content, fetchedAt: Date.now() });
    return content;
  } catch {
    // Any failure → fall back to hardcoded
    return FALLBACK_PROMPTS[name] ?? '';
  }
}

/**
 * invalidatePromptCache(name?)
 * Call after updating a prompt in the DB to force immediate reload.
 * Pass no args to clear entire cache.
 */
export function invalidatePromptCache(name?: string) {
  if (name) {
    promptCache.delete(name);
  } else {
    promptCache.clear();
  }
}
