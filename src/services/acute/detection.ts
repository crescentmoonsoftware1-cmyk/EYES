/**
 * Acute Layer — Real-time event detection service
 * 
 * Classifies incoming events (emails, messages, commits) as:
 *   ask | commitment | deadline | reference | noise
 * 
 * When an ask/commitment/reference is detected, cross-references the user's
 * memory archive for related prior commitments and surfaces alerts.
 * 
 * Spec ref: §2.3 — The acute layer (real-time event detection)
 */

import { invokeModel } from '@/services/ai/ai';
import type { SupabaseClient } from '@supabase/supabase-js';

// ── Types ───────────────────────────────────────────────────────────────────

export type EventClassification = 'ask' | 'commitment' | 'deadline' | 'reference' | 'noise';

export interface ClassificationResult {
  classification: EventClassification;
  confidence: number;
  extracted: {
    entities: Array<{ type: string; name: string }>;
    topic: string;
    deadline_date: string | null;
    requires_response: boolean;
  };
}

export interface IncomingEvent {
  id: string;
  user_id: string;
  platform: string;
  title: string;
  content: string;
  author: string;
  timestamp: string;
  is_outbound?: boolean;
}

// ── Content Type Classification ─────────────────────────────────────────────

/**
 * Classifies a memory as 'stated' (intentions/goals), 'lived' (actions), or 'mixed'.
 * Used by drift detection to compare what users say vs what they do.
 * Spec ref: §2.2, Addition 2
 */
export function classifyContentType(event: {
  platform: string;
  content: string;
  is_outbound?: boolean;
  event_type?: string;
}): 'stated' | 'lived' | 'mixed' {
  const platform = event.platform?.toLowerCase() ?? '';
  const contentLength = event.content?.length ?? 0;
  const isOutbound = event.is_outbound === true;

  // Stated: journal-like, intentional content
  if (platform === 'notion') return 'stated';
  if (platform === 'voice_memo') return 'stated';
  if (platform === 'slack' && contentLength > 200 && isOutbound) return 'stated';
  if (platform === 'gmail' && isOutbound && contentLength > 300) return 'stated';
  if (platform === 'discord' && isOutbound && contentLength > 200) return 'stated';

  // Lived: behavioral signals
  if (platform === 'google-calendar' || platform === 'google_calendar') return 'lived';
  if (platform === 'github' && event.event_type === 'commit') return 'lived';
  if (platform === 'github') return 'lived';
  if (platform === 'vercel') return 'lived';

  return 'mixed';
}

// ── Acute Detection Pass ────────────────────────────────────────────────────

/**
 * Runs the acute detection pass on a single incoming event.
 * Uses AI to classify the event as ask/commitment/deadline/reference/noise.
 * 
 * Fire-and-forget: designed to run asynchronously after ingestion.
 */
export async function classifyEvent(event: IncomingEvent): Promise<ClassificationResult | null> {
  try {
    const direction = event.is_outbound ? 'outbound' : 'inbound';
    
    const response = await invokeModel({
      capability: 'classify',
      system: `You are EYES, a personal intelligence layer. You classify incoming events.
Given an event, output ONE classification as JSON.

Definitions:
- 'ask': someone is requesting something from the user (info, decision, action)
- 'commitment': user is making a promise (their own message/email going outbound)
- 'deadline': time-bound obligation
- 'reference': someone is referencing a prior conversation or commitment
- 'noise': automated, newsletter, marketing, low-importance notification

Be conservative. When unsure, classify as 'noise'. Respond with JSON only.`,
      messages: [{
        role: 'user',
        content: `Source: ${event.platform}
Direction: ${direction}
Sender/Author: ${event.author}
Subject/Title: ${event.title}
Content: ${event.content.slice(0, 1500)}
Date: ${event.timestamp}

Output JSON only:
{"classification":"ask|commitment|deadline|reference|noise","confidence":0.0,"extracted":{"entities":[],"topic":"","deadline_date":null,"requires_response":false}}`,
      }],
      preference: 'auto',
      capture: false,
    });

    if (!response) return null;

    const jsonMatch = String(response).match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      classification: parsed.classification ?? 'noise',
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
      extracted: {
        entities: parsed.extracted?.entities ?? [],
        topic: parsed.extracted?.topic ?? '',
        deadline_date: parsed.extracted?.deadline_date ?? null,
        requires_response: parsed.extracted?.requires_response ?? false,
      },
    };
  } catch (err) {
    console.warn('[Acute] Classification failed:', err);
    return null;
  }
}

// ── Cross-Reference + Alert Creation ────────────────────────────────────────

/**
 * When a high-confidence detection fires, searches the user's memory archive
 * for related prior commitments and creates an alert if a match is found.
 */
export async function crossReferenceAndAlert(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient | any,
  event: IncomingEvent,
  classification: ClassificationResult
): Promise<boolean> {
  if (classification.confidence < 0.6) return false;
  if (classification.classification === 'noise') return false;

  try {
    // Search for related memories using keyword matching
    const searchTerms = [
      classification.extracted.topic,
      ...classification.extracted.entities.map(e => e.name),
    ].filter(Boolean).join(' ');

    if (!searchTerms) return false;

    // Find related prior memories
    const { data: relatedMemories } = await supabase
      .from('memories')
      .select('id, platform, title, content, timestamp, author')
      .eq('user_id', event.user_id)
      .neq('id', event.id)
      .textSearch('content', searchTerms.split(' ').slice(0, 3).join(' & '), { type: 'plain' })
      .order('timestamp', { ascending: false })
      .limit(5);

    // If no text search results, try a simpler approach
    let matchedMemories = relatedMemories ?? [];
    if (matchedMemories.length === 0 && classification.extracted.entities.length > 0) {
      const entityName = classification.extracted.entities[0]?.name;
      if (entityName) {
        const { data: entityMatches } = await supabase
          .from('memories')
          .select('id, platform, title, content, timestamp, author')
          .eq('user_id', event.user_id)
          .neq('id', event.id)
          .ilike('content', `%${entityName}%`)
          .order('timestamp', { ascending: false })
          .limit(5);
        matchedMemories = entityMatches ?? [];
      }
    }

    if (matchedMemories.length === 0) return false;

    // Generate alert message using AI
    const alertMessage = await generateAlertMessage(event, classification, matchedMemories);
    if (!alertMessage) return false;

    // Insert alert
    const { error } = await supabase.from('alerts').insert({
      user_id: event.user_id,
      alert_type: classification.classification,
      title: alertMessage.title,
      body: alertMessage.body,
      source_memory_id: event.id,
      citation_memory_ids: matchedMemories.slice(0, 3).map((m: { id: string }) => m.id),
      is_dismissed: false,
    });

    if (error) {
      console.warn('[Acute] Alert insert failed:', error.message);
      return false;
    }

    console.log(`[Acute] ✓ Alert created: ${classification.classification} for user ${event.user_id.slice(0, 8)}`);
    return true;
  } catch (err) {
    console.warn('[Acute] Cross-reference failed:', err);
    return false;
  }
}

async function generateAlertMessage(
  event: IncomingEvent,
  classification: ClassificationResult,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  relatedMemories: any[]
): Promise<{ title: string; body: string } | null> {
  try {
    const relatedContext = relatedMemories.slice(0, 3).map((m: { platform: string; timestamp: string; content: string }) => 
      `[${m.platform}] ${new Date(m.timestamp).toLocaleDateString()}: ${m.content.slice(0, 200)}`
    ).join('\n');

    const response = await invokeModel({
      capability: 'classify',
      system: `You are EYES. Generate a concise alert connecting a new event to prior related events. Be direct and factual. Respond with JSON only.`,
      messages: [{
        role: 'user',
        content: `New event (${classification.classification}):
From: ${event.author}
Subject: ${event.title}
Content: ${event.content.slice(0, 500)}

Related prior events:
${relatedContext}

Generate a short alert. Output JSON:
{"title":"One-line alert title (max 80 chars)","body":"2-3 sentence explanation connecting the new event to prior history"}`,
      }],
      preference: 'auto',
      capture: false,
    });

    if (!response) return null;
    const jsonMatch = String(response).match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      title: (parsed.title ?? `New ${classification.classification} detected`).slice(0, 120),
      body: (parsed.body ?? `${event.author} — ${classification.extracted.topic}`).slice(0, 500),
    };
  } catch {
    return {
      title: `${classification.classification === 'ask' ? '📩' : '📌'} ${classification.extracted.topic || event.title}`.slice(0, 120),
      body: `${event.author} — ${event.title.slice(0, 200)}`,
    };
  }
}

// ── Batch Processing ────────────────────────────────────────────────────────

/**
 * Process a batch of newly ingested events through the acute detection pipeline.
 * Fire-and-forget — does not block the sync response.
 */
export async function processAcuteDetection(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient | any,
  events: IncomingEvent[]
): Promise<void> {
  // Only process recent events (last 24h) to avoid flooding alerts on backfill
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recentEvents = events.filter(e => e.timestamp > cutoff);

  // Limit to 5 events per batch to control AI costs
  const toProcess = recentEvents.slice(0, 5);

  for (const event of toProcess) {
    try {
      const classification = await classifyEvent(event);
      if (!classification) continue;
      if (classification.classification === 'noise') continue;
      if (classification.confidence < 0.6) continue;

      await crossReferenceAndAlert(supabase, event, classification);
    } catch (err) {
      console.warn(`[Acute] Event processing failed for ${event.id}:`, err);
    }
  }
}
