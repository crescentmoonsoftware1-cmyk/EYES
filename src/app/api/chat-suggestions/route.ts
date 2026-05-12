import { NextResponse } from 'next/server';

import { createClient } from '@/utils/supabase/server';

const fallbackSuggestions = [
  'What themes appear most in my recent memory feed?',
  'Which platform has the highest risk items this month?',
  'Summarize my last 10 indexed memories.',
  'What changed in my activity compared to last month?',
  'What could a recruiter infer from my public traces?',
];

type EventRow = {
  platform: string;
  event_type: string | null;
  title: string | null;
};

function buildSuggestions(rows: EventRow[]) {
  if (rows.length === 0) return fallbackSuggestions;

  const byPlatform = new Map<string, number>();
  const byType = new Map<string, number>();

  rows.forEach((row) => {
    byPlatform.set(row.platform, (byPlatform.get(row.platform) ?? 0) + 1);
    if (row.event_type) {
      byType.set(row.event_type, (byType.get(row.event_type) ?? 0) + 1);
    }
  });

  const topPlatform = Array.from(byPlatform.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'your connected platforms';
  const topType = Array.from(byType.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'activities';

  return [
    `What does my recent ${topPlatform} activity suggest about my priorities?`,
    `Summarize my latest ${topType} memories in plain language.`,
    `What are the most notable patterns across my last ${Math.min(rows.length, 30)} events?`,
    `Which recent memories could carry reputation risk?`,
    'What story does my digital history tell over the last month?',
  ];
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      return NextResponse.json({ suggestions: fallbackSuggestions }, { status: 200 });
    }

    const { data, error } = await supabase
      .from('memories')
      .select('platform,event_type,title')
      .eq('user_id', authData.user.id)
      .order('timestamp', { ascending: false })
      .limit(50);

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as EventRow[];
    return NextResponse.json({ suggestions: buildSuggestions(rows) }, { status: 200 });
  } catch (error) {
    console.error('chat-suggestions error:', error);
    return NextResponse.json({ suggestions: fallbackSuggestions }, { status: 200 });
  }
}
