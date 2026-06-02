import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const createClientMock = vi.fn();
  const getValidGoogleTokenMock = vi.fn(async () => 'google-token');
  const getValidLinearTokenMock = vi.fn(async () => 'linear-token');
  const getValidSlackTokenMock = vi.fn(async () => 'slack-token');

  return {
    createClientMock,
    getValidGoogleTokenMock,
    getValidLinearTokenMock,
    getValidSlackTokenMock,
  };
});

vi.mock('@/utils/supabase/server', () => ({
  createClient: hoisted.createClientMock,
}));

vi.mock('@/services/auth/oauth', () => ({
  getValidGoogleToken: hoisted.getValidGoogleTokenMock,
  getValidLinearToken: hoisted.getValidLinearTokenMock,
  getValidSlackToken: hoisted.getValidSlackTokenMock,
}));

import { POST } from '@/app/api/actions/execute/route';

function createSupabase() {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: {
            id: '11111111-1111-4111-8111-111111111111',
          },
        },
        error: null,
      })),
    },
  };
}

describe('POST /api/actions/execute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a calendar reminder event', async () => {
    hoisted.createClientMock.mockResolvedValue(createSupabase() as never);

    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'calendar-event-1' }), { status: 200 })
    );

    const response = await POST(new Request('http://localhost/api/actions/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actionType: 'REMINDER',
        title: 'Pay invoice',
        description: 'Invoice due tomorrow',
        reminderDate: '2026-05-09T09:00:00.000Z',
      }),
    }));

    fetchMock.mockRestore();

    const payload = await response.json() as { success?: boolean; executed?: string };

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.executed).toBe('REMINDER');
  });

  it('creates a Linear ticket when teamId is provided', async () => {
    hoisted.createClientMock.mockResolvedValue(createSupabase() as never);

    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { issueCreate: { success: true, issue: { id: 'issue-1', identifier: 'ENG-1', title: 'Fix bug', url: 'https://linear.app/issue-1' } } } }), { status: 200 })
    );

    const response = await POST(new Request('http://localhost/api/actions/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actionType: 'LINEAR_TICKET',
        title: 'Fix bug',
        description: 'Something is broken',
        teamId: 'team-1',
      }),
    }));

    fetchMock.mockRestore();

    const payload = await response.json() as { success?: boolean; executed?: string; issue?: { identifier?: string } };

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.executed).toBe('LINEAR_TICKET');
    expect(payload.issue?.identifier).toBe('ENG-1');
  });

  it('posts a Slack reply when channelId is provided', async () => {
    hoisted.createClientMock.mockResolvedValue(createSupabase() as never);

    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, ts: '1710000000.111' }), { status: 200 })
    );

    const response = await POST(new Request('http://localhost/api/actions/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actionType: 'SLACK_REPLY',
        title: 'Reply to thread',
        description: 'Thanks, I will take a look.',
        channelId: 'C123',
        threadTs: '1710000000.111',
      }),
    }));

    fetchMock.mockRestore();

    const payload = await response.json() as { success?: boolean; executed?: string; ts?: string };

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.executed).toBe('SLACK_REPLY');
    expect(payload.ts).toBe('1710000000.111');
  });

  it('creates a calendar event for CALENDAR actions', async () => {
    hoisted.createClientMock.mockResolvedValue(createSupabase() as never);

    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'calendar-event-2' }), { status: 200 })
    );

    const response = await POST(new Request('http://localhost/api/actions/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actionType: 'CALENDAR',
        title: 'Sync meeting',
        description: 'Meet the team',
        date: '2026-05-10T10:00:00.000Z',
      }),
    }));

    fetchMock.mockRestore();

    const payload = await response.json() as { success?: boolean; executed?: string };

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.executed).toBe('CALENDAR');
  });

  it('sends a Gmail reply and logs to action_sent_log for EMAIL_REPLY actions', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const fromMock = vi.fn().mockReturnValue({ insert: insertMock });
    const supabaseMock = {
      ...createSupabase(),
      from: fromMock,
    };
    hoisted.createClientMock.mockResolvedValue(supabaseMock as never);

    const fetchMock = vi.spyOn(global, 'fetch');
    
    // Parent metadata mock response
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({
        threadId: 'thread-xyz',
        payload: {
          headers: [
            { name: 'Message-ID', value: '<parent-msg-id@gmail.com>' },
            { name: 'Subject', value: 'Hello there' },
            { name: 'From', value: 'Sender <sender@example.com>' }
          ]
        }
      }), { status: 200 })
    );

    // Send email mock response
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'sent-msg-id' }), { status: 200 })
    );

    const response = await POST(new Request('http://localhost/api/actions/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actionType: 'EMAIL_REPLY',
        memoryId: 'msg-12345',
        suggestedAction: 'This is the draft reply text',
      }),
    }));

    const payload = await response.json() as { success?: boolean; executed?: string };

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.executed).toBe('EMAIL_REPLY');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/msg-12345?format=metadata',
      expect.any(Object)
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      expect.any(Object)
    );

    expect(fromMock).toHaveBeenCalledWith('action_sent_log');
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'gmail',
        recipient: 'sender@example.com',
        subject: 'Re: Hello there',
        body: 'This is the draft reply text',
      })
    );

    fetchMock.mockRestore();
  });
});
