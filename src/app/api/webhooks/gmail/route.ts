import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { invokeModel } from '@/services/ai/ai';
import { waitUntil } from '@vercel/functions';
import { extractForUser } from '../../actions/extract/route';

const SERVICE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type CommitmentCheck = {
  has_ask: boolean;
  has_commitment: boolean;
  has_deadline: boolean;
  topic: string;
  person: string | null;
  urgency: 'high' | 'medium' | 'low';
};

/**
 * POST /api/webhooks/gmail
 * Receives Gmail push notifications (Pub/Sub).
 * Parses incoming email for asks/commitments, cross-references memory, fires alert.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  // Gmail Pub/Sub wraps the message in a base64-encoded data field
  const messageData = body?.message?.data;
  const userId      = body?.message?.attributes?.userId ?? null;

  if (!messageData || !userId) {
    // Direct call format (for testing) or missing user
    return NextResponse.json({ received: true });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient(SERVICE_URL, SERVICE_KEY, { auth: { persistSession: false } }) as any;

  try {
    const decoded = Buffer.from(messageData, 'base64').toString('utf-8');
    const notification = JSON.parse(decoded);
    const historyId = notification?.historyId;
    if (!historyId) return NextResponse.json({ received: true });

    // Fetch recent unprocessed memories for this user from Gmail
    const since = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // last 5 min
    const { data: recentMails } = await supabase
      .from('memories')
      .select('id, content, author, title, timestamp')
      .eq('user_id', userId)
      .eq('platform', 'gmail')
      .gte('updated_at', since)
      .order('updated_at', { ascending: false })
      .limit(5);

    for (const mail of (recentMails ?? [])) {
      await processMessageForAcuteAlert(supabase, userId, mail, 'gmail');
    }
  } catch (err) {
    console.error('[Gmail Webhook]', err);
  }

  // Trigger Action Queue extraction immediately in the background
  if (userId) {
    waitUntil(extractForUser(userId, supabase).catch(err => 
      console.error('[Gmail Webhook] Background extraction failed:', err)
    ));
  }

  return NextResponse.json({ received: true });
}

/**
 * Core acute layer detection function — shared by Gmail and Slack webhooks.
 * Detects asks/commitments/deadlines, cross-references memory, fires alert.
 */
export async function processMessageForAcuteAlert(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  message: { id: string; content: string; author?: string; title?: string; timestamp?: string },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  platform: string
): Promise<void> {
  if (!message.content || message.content.length < 30) return;

  // Step 1 — Detect if message contains ask/commitment/deadline
  const detectionResponse = await invokeModel({
    capability: 'classify',
    system: 'You are a commitment detection system. Respond with valid JSON only.',
    messages: [{
      role: 'user',
      content: `Does this message contain an ask, commitment, or deadline?

Message: "${message.content.slice(0, 500)}"
From: ${message.author ?? 'unknown'}

Return:
{"has_ask":true/false,"has_commitment":true/false,"has_deadline":true/false,"topic":"brief topic","person":"person name or null","urgency":"high/medium/low"}`,
    }],
    preference: 'auto',
    capture: false,
  });

  if (!detectionResponse) return;

  let check: CommitmentCheck | null = null;
  try {
    const match = String(detectionResponse).match(/\{[\s\S]*?\}/);
    if (match) check = JSON.parse(match[0]);
  } catch { return; }

  if (!check || (!check.has_ask && !check.has_commitment && !check.has_deadline)) return;

  // Step 2 — Cross-reference memories for related prior commitments
  const searchQuery = [check.topic, check.person].filter(Boolean).join(' ');
  const { data: relatedMemories } = await supabase
    .from('memories')
    .select('id, content, timestamp, platform')
    .eq('user_id', userId)
    .textSearch('content', searchQuery, { type: 'websearch' })
    .lt('timestamp', message.timestamp ?? new Date().toISOString())
    .order('timestamp', { ascending: false })
    .limit(3);

  // Step 3 — Build alert message
  const alertType = check.has_deadline ? 'deadline' : check.has_ask ? 'ask' : 'commitment';
  const citationIds = (relatedMemories ?? []).map((m: { id: string }) => m.id);

  let body = `${check.person ? `${check.person} ` : ''}${alertType === 'ask' ? 'is asking about' : 'has a deadline for'}: ${check.topic}.`;
  if (citationIds.length > 0) {
    body += ` You have ${citationIds.length} related ${citationIds.length === 1 ? 'memory' : 'memories'} from before this.`;
  }

  // Step 4 — Insert alert
  await supabase.from('alerts').insert({
    user_id:             userId,
    alert_type:          alertType,
    title:               `${check.urgency === 'high' ? '🔴' : check.urgency === 'medium' ? '🟡' : '🟢'} ${check.person ? `${check.person}: ` : ''}${check.topic}`,
    body,
    source_memory_id:    message.id,
    citation_memory_ids: citationIds,
    is_dismissed:        false,
  });

  console.log(`[AcuteLayer] Alert fired for user=${userId.slice(0, 8)} type=${alertType} topic="${check.topic}"`);
}
