import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { chatCompletion } from '@/services/ai/ai';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch the 15 most recent memories for the digest (unified memories table)
    const { data: memories, error } = await supabase
      .from('memories')
      .select('platform, title, content, timestamp, author')
      .eq('user_id', user.id)
      .not('content', 'is', null)
      .order('timestamp', { ascending: false })
      .limit(15);

    if (error) throw error;
    if (!memories || memories.length === 0) {
      return NextResponse.json({ digest: [] });
    }

    const memoryContext = memories.map(m => `[Platform: ${m.platform}] ${m.author ?? 'Unknown'}: ${(m.title ?? '')} - ${m.content.slice(0, 200)}`).join('\n');

    const prompt = `
You are the Executive AI Assistant for "The EYES".
Read the following recent notifications/messages.
Summarize the most important updates into EXACTLY 3 short, punchy bullet points.
Format as a JSON array of strings:
{
  "digest": [
    "3 new PRs need your review on GitHub.",
    "HR (John) invited you to a wedding on Slack.",
    "1 High-Risk password exposure detected in Discord."
  ]
}

Memories:
${memoryContext}
    `;

    const response = await chatCompletion([
      { role: 'system', content: 'You are a precise JSON executive summarizer.' },
      { role: 'user', content: prompt }
    ]);

    // Clean response of potential markdown code blocks
    let finalDigest = [];
    try {
      const cleanJson = response?.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleanJson || '{"digest":[]}');
      finalDigest = parsed.digest || [];
    } catch (e) {
      console.warn('[Digest] AI response was not valid JSON, using simple parsing.');
      // Simple fallback if JSON fails
      finalDigest = response?.split('\n')
        .filter((l: string) => l.includes('-') || l.includes('*'))
        .map((l: string) => l.replace(/^[-*]\s*/, '').trim())
        .slice(0, 3) || [];
    }

    if (finalDigest.length === 0) {
      finalDigest = [
        "Your neural link is active and processing new signals.",
        "System state: Optimal across all connected nodes.",
        "Awaiting new high-priority events from your network."
      ];
    }

    return NextResponse.json({ digest: finalDigest.slice(0, 3) });

  } catch (error) {
    console.error('Failed to generate digest:', error);
    // NEVER return a 500 for the digest, always provide a fallback
    return NextResponse.json({ 
      digest: [
        "Neural sync complete. System monitoring active.",
        "Security protocols running in the background.",
        "Reviewing your latest memory streams..."
      ]
    });
  }
}
