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

    // Fetch the 20 most recent memories
    const { data: memories, error } = await supabase
      .from('raw_events')
      .select('id, platform, title, content, timestamp, author')
      .eq('user_id', user.id)
      .order('timestamp', { ascending: false })
      .limit(30);

    if (error) throw error;
    
    // DEMO MODE: If no memories are found, we still want to show the mock actions for the demo
    const memoryContext = (memories && memories.length > 0) 
      ? memories.map(m => `[ID: ${m.id}] [Platform: ${m.platform}] [Time: ${m.timestamp}] ${m.author}: ${m.title} - ${m.content}`).join('\n')
      : "No memories indexed yet.";

    const prompt = `
You are the Autonomous Agent brain of "The EYES".
Your job is to read recent user memories and extract concrete, actionable tasks or events that the user should take action on (e.g. Wedding invites, meeting requests, PR reviews, etc.).

Return a JSON object containing a single array called "actions".
Each action must have:
{
  "id": "A unique string ID",
  "memoryId": "The ID of the memory that triggered this",
  "platform": "The platform it came from",
  "title": "A short, actionable title (e.g. 'HR Wedding Invitation')",
  "description": "A brief explanation of the context",
  "suggestedAction": "What the AI will do (e.g. 'Add event to Google Calendar for May 10, 4:00 PM')",
  "actionType": "CALENDAR" | "LINEAR_TICKET" | "SLACK_REPLY" | "REMINDER",
  "confidence": number (1-100),
  "teamId": "Required for LINEAR_TICKET actions if known",
  "channelId": "Required for SLACK_REPLY actions if known",
  "threadTs": "Optional Slack thread timestamp for replies",
  "reminderDate": "Optional ISO date for REMINDER actions",
  "text": "Optional message body for Slack replies or reminder text"
}

Only return highly confident actionable items. If none exist, return {"actions": []}.

Memories:
${memoryContext}
    `;

    let response = null;
    try {
      response = await chatCompletion([
        { role: 'system', content: 'You are a precise JSON extraction agent.' },
        { role: 'user', content: prompt }
      ]);
    } catch (aiErr) {
      console.warn('AI Extraction failed, falling back to mock data:', aiErr);
    }

    // Clean response of potential markdown code blocks
    const cleanJson = response?.replace(/```json|```/g, '').trim();
    let parsed = { actions: [] };
    try {
      if (cleanJson) parsed = JSON.parse(cleanJson);
    } catch (e) {
      console.warn('Failed to parse AI response, using mock data.');
    }

    let finalActions: any[] = parsed.actions || [];
    
    return NextResponse.json({ actions: finalActions });

  } catch (error) {
    console.error('Final extraction handler failure:', error);
    return NextResponse.json({ error: 'System error' }, { status: 500 });
  }
}
