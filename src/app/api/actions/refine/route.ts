import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { invokeModel } from '@/services/ai/ai';

/**
 * POST /api/actions/refine
 *
 * AI-powered quick-refine for action drafts.
 * Body: { text: string; type: 'shorter' | 'formal' | 'calendar' }
 * Returns: { refined: string }
 *
 * Replaces the brittle client-side regex transforms.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { text, type } = await req.json() as { text: string; type: 'shorter' | 'formal' | 'calendar' };

    if (!text || !type) {
      return NextResponse.json({ error: 'text and type are required' }, { status: 400 });
    }

    const prompts: Record<string, string> = {
      shorter: `Rewrite the following message draft to be significantly more concise — cut it to the essential point only. 
Preserve the core meaning and the closing sign-off. Output only the rewritten message body, no explanation.\n\nOriginal:\n${text}`,

      formal: `Rewrite the following message draft in a more professional and formal tone. 
Replace casual phrases with polished alternatives. Keep the same intent and facts. 
Output only the rewritten message body, no explanation.\n\nOriginal:\n${text}`,

      calendar: `Append a polite sentence to the following message offering the recipient a way to book a meeting. 
Use a natural, professional phrasing like "Feel free to grab time on my calendar here: [calendly link]".
Output only the full message (original + added sentence), no explanation.\n\nOriginal:\n${text}`,
    };

    const prompt = prompts[type];
    if (!prompt) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    const result = await invokeModel({
      capability: 'chat',
      capture: false,
      messages: [{ role: 'user', content: prompt }],
      system: 'You are a professional writing assistant. Output only the requested rewritten message, nothing else.',
      maxTokens: 512,
    });

    if (!result || typeof result !== 'string') {
      return NextResponse.json({ error: 'AI refine failed' }, { status: 500 });
    }

    return NextResponse.json({ refined: result.trim() });
  } catch (err) {
    console.error('[Refine] Error:', err);
    return NextResponse.json({ error: 'Refine failed' }, { status: 500 });
  }
}
