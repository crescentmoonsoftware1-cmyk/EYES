import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getValidGoogleToken, getValidLinearToken, getValidSlackToken } from '@/services/auth/oauth';

type ActionBody = {
  actionId?: string;
  actionType?: 'CALENDAR' | 'LINEAR_TICKET' | 'SLACK_REPLY' | 'REMINDER' | 'EMAIL_REPLY';
  method?: string;
  eventId?: string;
  memoryId?: string;
  title?: string;
  description?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
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

async function executeEmailReplyAction(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, body: ActionBody) {
  const accessToken = await getValidGoogleToken(supabase, userId, 'gmail');

  if (!accessToken) {
    return NextResponse.json({ error: 'Gmail is not connected or token expired' }, { status: 400 });
  }

  let messageId = body.eventId || body.memoryId || (body as any).memory_id;
  if (!messageId) {
    return NextResponse.json({ error: 'Missing messageId/memoryId' }, { status: 400 });
  }

  // If the messageId is a database UUID, look up the memories source_id (Google Message ID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(messageId)) {
    const { data: memory } = await supabase
      .from('memories')
      .select('source_id')
      .eq('id', messageId)
      .maybeSingle();

    if (memory?.source_id) {
      messageId = memory.source_id;
    }
  }

  // 1. Fetch parent message to get headers for threading
  const parentRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!parentRes.ok) {
    console.error('Failed to fetch parent message headers:', await parentRes.text());
    return NextResponse.json({ error: 'Failed to fetch original message headers' }, { status: 500 });
  }

  const parentData = await parentRes.json();
  const headers = parentData.payload?.headers || [];
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getHeaderVal = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value;

  const originalMsgId = getHeaderVal('message-id');
  const originalSubject = getHeaderVal('subject') || 'No subject';
  const originalFrom = getHeaderVal('from') || '';

  // Determine recipient from 'From' or 'Reply-To'
  let recipient = getHeaderVal('reply-to') || originalFrom;
  const emailMatch = recipient.match(/<([^>]+)>/);
  if (emailMatch) {
    recipient = emailMatch[1];
  }

  // Construct Subject: prepend "Re: " if not present
  let subject = originalSubject;
  if (!subject.toLowerCase().startsWith('re:')) {
    subject = `Re: ${subject}`;
  }

  // Construct email body
  const replyText = body.text || body.suggestedAction || (body as any).suggested_action || body.description || '';

  // RFC 2822 Headers
  const mailHeaders = [
    `To: ${recipient}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=UTF-8`,
  ];

  if (originalMsgId) {
    mailHeaders.push(`In-Reply-To: ${originalMsgId}`);
    mailHeaders.push(`References: ${originalMsgId}`);
  }

  const emailRaw = `${mailHeaders.join('\r\n')}\r\n\r\n${replyText}`;
  const base64UrlSafe = Buffer.from(emailRaw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  // 2. Send the message
  const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      raw: base64UrlSafe,
      threadId: parentData.threadId,
    }),
  });

  if (!sendRes.ok) {
    const errText = await sendRes.text();
    console.error('Gmail send API failed:', errText);
    return NextResponse.json({ error: 'Failed to send Gmail reply', details: errText }, { status: 500 });
  }

  // 3. Log sent reply to immutable table public.action_sent_log
  const { error: logError } = await supabase
    .from('action_sent_log')
    .insert({
      user_id: userId,
      action_id: body.actionId || (body as any).id || null,
      platform: 'gmail',
      recipient,
      subject,
      body: replyText,
    });

  if (logError) {
    console.error('Failed to log sent reply to action_sent_log:', logError);
  }

  return NextResponse.json({ success: true, executed: 'EMAIL_REPLY' });
}

async function executeCalendarAction(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, body: ActionBody) {
  const accessToken = await getValidGoogleToken(supabase, userId, 'google_calendar');

  if (!accessToken) {
    return NextResponse.json({ error: 'Google Calendar not connected or token expired' }, { status: 400 });
  }

  const eventStart = body.startTime ? new Date(body.startTime) : (body.date ? new Date(body.date) : new Date());
  const eventEnd = body.endTime ? new Date(body.endTime) : new Date(eventStart.getTime() + 60 * 60 * 1000);

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
  const start = body.startTime ? new Date(body.startTime) : new Date(reminderDate);
  const end = body.endTime ? new Date(body.endTime) : new Date(start.getTime() + 15 * 60 * 1000);

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

  let teamId = body.teamId || process.env.LINEAR_DEFAULT_TEAM_ID;
  if (!teamId) {
    try {
      const teamsRes = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          'Authorization': accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: `query { teams { nodes { id } } }`
        })
      });
      if (teamsRes.ok) {
        const teamsData = await teamsRes.json();
        const firstTeam = teamsData?.data?.teams?.nodes?.[0];
        if (firstTeam?.id) {
          teamId = firstTeam.id;
        }
      }
    } catch (e) {
      console.warn('Failed to auto-fetch Linear team:', e);
    }
  }

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

  let channel = body.channelId;
  let threadTs = body.threadTs;

  const messageId = body.eventId || body.memoryId || (body as any).memory_id;
  if (messageId && !channel) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(messageId)) {
      const { data: memory } = await supabase
        .from('memories')
        .select('metadata')
        .eq('id', messageId)
        .maybeSingle();

      if (memory?.metadata) {
        const meta = memory.metadata as any;
        if (meta.channel_id) {
          channel = meta.channel_id;
        }
        if (meta.ts && !threadTs) {
          threadTs = meta.ts;
        }
      }
    }
  }

  if (!channel) {
    channel = process.env.SLACK_DEFAULT_CHANNEL_ID;
  }

  if (!channel) {
    return NextResponse.json({ error: 'Missing Slack channelId. Pass channelId or set SLACK_DEFAULT_CHANNEL_ID.' }, { status: 400 });
  }

  const text = body.text || body.suggestedAction || (body as any).suggested_action || body.description || body.title;
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
      thread_ts: threadTs || undefined,
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
      console.log('[Execute API] 401 Unauthorized');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as ActionBody & { action_type?: string };
    const actionType = body.actionType || body.action_type;
    console.log(`[Execute API] Received actionType: ${actionType}, body:`, JSON.stringify(body).slice(0, 500));

    if (actionType === 'CALENDAR') {
      const res = await executeCalendarAction(supabase, user.id, body);
      if (res.status === 400) {
        const data = await res.clone().json();
        console.error('[Execute API] CALENDAR 400 Error:', data);
      }
      return res;
    }

    if (actionType === 'REMINDER') {
      const res = await executeReminderAction(supabase, user.id, body);
      if (res.status === 400) {
        const data = await res.clone().json();
        console.error('[Execute API] REMINDER 400 Error:', data);
      }
      return res;
    }

    if (actionType === 'LINEAR_TICKET') {
      const res = await executeLinearTicketAction(supabase, user.id, body);
      if (res.status === 400) {
        const data = await res.clone().json();
        console.error('[Execute API] LINEAR 400 Error:', data);
      }
      return res;
    }

    if (actionType === 'SLACK_REPLY') {
      const res = await executeSlackReplyAction(supabase, user.id, body);
      if (res.status === 400) {
        const data = await res.clone().json();
        console.error('[Execute API] SLACK 400 Error:', data);
      }
      return res;
    }

    if (actionType === 'EMAIL_REPLY') {
      const res = await executeEmailReplyAction(supabase, user.id, body);
      if (res.status === 400) {
        const data = await res.clone().json();
        console.error('[Execute API] EMAIL 400 Error:', data);
      }
      return res;
    }

    console.error(`[Execute API] Unsupported action type: ${actionType}`);
    return NextResponse.json({ error: 'Unsupported action type' }, { status: 400 });

  } catch (error) {
    console.error('Action execution failed:', error);
    return NextResponse.json({ error: 'Execution failed' }, { status: 500 });
  }
}
