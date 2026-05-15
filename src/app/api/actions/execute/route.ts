import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getValidGoogleToken, getValidLinearToken, getValidSlackToken } from '@/services/auth/oauth';

type ActionBody = {
  actionId?: string;
  actionType?: 'CALENDAR' | 'LINEAR_TICKET' | 'SLACK_REPLY' | 'REMINDER';
  method?: string;
  eventId?: string;
  title?: string;
  description?: string;
  date?: string;
  channelId?: string;
  threadTs?: string;
  teamId?: string;
  reminderDate?: string;
  text?: string;
  suggestedAction?: string;
};

function buildActionTitle(actionType: string, title?: string, description?: string) {
  if (title && title.trim()) return title.trim();
  if (description && description.trim()) return description.trim().slice(0, 80);
  return actionType.replace(/_/g, ' ');
}

async function executeCalendarAction(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, body: ActionBody) {
  const accessToken = await getValidGoogleToken(supabase, userId, 'google_calendar');

  if (!accessToken) {
    return NextResponse.json({ error: 'Google Calendar not connected or token expired' }, { status: 400 });
  }

  const eventStart = body.date ? new Date(body.date) : new Date();
  const eventEnd = new Date(eventStart.getTime() + 60 * 60 * 1000);

  const payload = {
    summary: buildActionTitle('CALENDAR', body.title, body.description),
    description: body.description,
    start: { dateTime: eventStart.toISOString() },
    end: { dateTime: eventEnd.toISOString() }
  };

  let url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
  let fetchMethod = body.method || 'POST';

  if (fetchMethod === 'UPDATE' || fetchMethod === 'PATCH') {
    if (!body.eventId) return NextResponse.json({ error: 'Missing eventId for update' }, { status: 400 });
    url += `/${body.eventId}`;
    fetchMethod = 'PATCH';
  } else if (fetchMethod === 'DELETE') {
    if (!body.eventId) return NextResponse.json({ error: 'Missing eventId for delete' }, { status: 400 });
    url += `/${body.eventId}`;
    fetchMethod = 'DELETE';
  }

  const gcalRes = await fetch(url, {
    method: fetchMethod,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: fetchMethod !== 'DELETE' ? JSON.stringify(payload) : undefined
  });

  if (!gcalRes.ok) {
    const errorText = await gcalRes.text();
    console.error(`Google Calendar ${fetchMethod} Failed:`, errorText);

    if (gcalRes.status === 403 || errorText.includes('insufficient')) {
      return NextResponse.json({
        error: 'Insufficient Scopes',
        details: 'Write permissions are not enabled in your Google Cloud Console.'
      }, { status: 403 });
    }

    return NextResponse.json({ error: `Failed to ${fetchMethod.toLowerCase()} calendar item` }, { status: 500 });
  }

  return NextResponse.json({ success: true, executed: 'CALENDAR' });
}

async function executeReminderAction(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, body: ActionBody) {
  const accessToken = await getValidGoogleToken(supabase, userId, 'google_calendar');

  if (!accessToken) {
    return NextResponse.json({ error: 'Google Calendar not connected or token expired' }, { status: 400 });
  }

  const reminderDate = body.reminderDate || body.date || new Date().toISOString();
  const start = new Date(reminderDate);
  const end = new Date(start.getTime() + 15 * 60 * 1000);

  const payload = {
    summary: `Reminder: ${buildActionTitle('REMINDER', body.title, body.description)}`,
    description: body.description || body.text || '',
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() }
  };

  const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json({ error: 'Failed to create reminder', details: errorText.slice(0, 200) }, { status: 500 });
  }

  return NextResponse.json({ success: true, executed: 'REMINDER' });
}

async function executeLinearTicketAction(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, body: ActionBody) {
  const accessToken = await getValidLinearToken(supabase, userId);

  if (!accessToken) {
    return NextResponse.json({ error: 'Linear is not connected' }, { status: 400 });
  }

  const teamId = body.teamId || process.env.LINEAR_DEFAULT_TEAM_ID;
  if (!teamId) {
    return NextResponse.json({ error: 'Missing Linear teamId. Pass teamId or set LINEAR_DEFAULT_TEAM_ID.' }, { status: 400 });
  }

  const mutation = `
    mutation IssueCreate($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          title
          url
        }
      }
    }
  `;

  const response = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'Authorization': accessToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: mutation,
      variables: {
        input: {
          teamId,
          title: buildActionTitle('LINEAR_TICKET', body.title, body.description),
          description: body.description || body.text || '',
        }
      }
    }),
  });

  const payload = await response.json();
  if (!response.ok || payload.errors?.length) {
    const errorText = payload.errors?.[0]?.message || 'Linear API Error';
    return NextResponse.json({ error: errorText }, { status: 500 });
  }

  return NextResponse.json({ success: true, executed: 'LINEAR_TICKET', issue: payload.data?.issueCreate?.issue || null });
}

async function executeSlackReplyAction(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, body: ActionBody) {
  const accessToken = await getValidSlackToken(supabase, userId);

  if (!accessToken) {
    return NextResponse.json({ error: 'Slack is not connected' }, { status: 400 });
  }

  const channel = body.channelId || process.env.SLACK_DEFAULT_CHANNEL_ID;
  if (!channel) {
    return NextResponse.json({ error: 'Missing Slack channelId. Pass channelId or set SLACK_DEFAULT_CHANNEL_ID.' }, { status: 400 });
  }

  const text = body.text || body.description || body.suggestedAction || body.title;
  if (!text) {
    return NextResponse.json({ error: 'Missing Slack reply text.' }, { status: 400 });
  }

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel,
      text,
      thread_ts: body.threadTs || undefined,
    }),
  });

  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    return NextResponse.json({ error: payload.error || 'Slack reply failed' }, { status: 500 });
  }

  return NextResponse.json({ success: true, executed: 'SLACK_REPLY', ts: payload.ts || null });
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as ActionBody;
    const { actionType } = body;

    if (actionType === 'CALENDAR') {
      return await executeCalendarAction(supabase, user.id, body);
    }

    if (actionType === 'REMINDER') {
      return await executeReminderAction(supabase, user.id, body);
    }

    if (actionType === 'LINEAR_TICKET') {
      return await executeLinearTicketAction(supabase, user.id, body);
    }

    if (actionType === 'SLACK_REPLY') {
      return await executeSlackReplyAction(supabase, user.id, body);
    }

    return NextResponse.json({ error: 'Unsupported action type' }, { status: 400 });

  } catch (error) {
    console.error('Action execution failed:', error);
    return NextResponse.json({ error: 'Execution failed' }, { status: 500 });
  }
}
