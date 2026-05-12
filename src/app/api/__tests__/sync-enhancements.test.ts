import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const getValidGoogleTokenMock = vi.fn(async () => 'google-token');
  const getValidSlackTokenMock = vi.fn(async () => 'slack-token');
  const getValidDiscordTokenMock = vi.fn(async () => 'discord-token');

  const decryptTokenMock = vi.fn((value: string) => value.replace(/^enc:/, ''));

  const upsertRawEventsSafelyMock = vi.fn(async () => ({ error: null }));
  const upsertSyncStatusSafelyMock = vi.fn(async () => ({ error: null }));

  const scoreGmailEventMock = vi.fn(async () => ({
    score: 12,
    severity: 'LOW',
    flagged: false,
    reasons: ['ok'],
  }));
  const scoreNotionEventMock = vi.fn(async () => ({
    score: 12,
    severity: 'LOW',
    flagged: false,
    reasons: ['ok'],
  }));
  const scoreSlackEventMock = vi.fn(async () => ({
    score: 12,
    severity: 'LOW',
    flagged: false,
    reasons: ['ok'],
  }));
  const scoreDiscordEventMock = vi.fn(async () => ({
    score: 12,
    severity: 'LOW',
    flagged: false,
    reasons: ['ok'],
  }));

  const resolveSyncActorMock = vi.fn();

  return {
    getValidGoogleTokenMock,
    getValidSlackTokenMock,
    getValidDiscordTokenMock,
    decryptTokenMock,
    upsertRawEventsSafelyMock,
    upsertSyncStatusSafelyMock,
    scoreGmailEventMock,
    scoreNotionEventMock,
    scoreSlackEventMock,
    scoreDiscordEventMock,
    resolveSyncActorMock,
  };
});

vi.mock('@/utils/oauth', () => ({
  getValidGoogleToken: hoisted.getValidGoogleTokenMock,
  getValidSlackToken: hoisted.getValidSlackTokenMock,
  getValidDiscordToken: hoisted.getValidDiscordTokenMock,
}));

vi.mock('@/utils/tokens', () => ({
  decryptToken: hoisted.decryptTokenMock,
}));

vi.mock('@/utils/supabase/upsert', () => ({
  upsertRawEventsSafely: hoisted.upsertRawEventsSafelyMock,
  upsertSyncStatusSafely: hoisted.upsertSyncStatusSafelyMock,
}));

vi.mock('@/utils/risk/scorer', () => ({
  scoreGmailEvent: hoisted.scoreGmailEventMock,
  scoreNotionEvent: hoisted.scoreNotionEventMock,
  scoreSlackEvent: hoisted.scoreSlackEventMock,
  scoreDiscordEvent: hoisted.scoreDiscordEventMock,
}));

vi.mock('@/utils/sync/actor', () => ({
  resolveSyncActor: hoisted.resolveSyncActorMock,
}));

import { POST as postGmail } from '@/app/api/sync/gmail/route';
import { POST as postNotion } from '@/app/api/sync/notion/route';
import { POST as postSlack } from '@/app/api/sync/slack/route';
import { POST as postDiscord } from '@/app/api/sync/discord/route';

type SupabaseOptions = {
  syncStatusRow?: Record<string, unknown>;
  notionToken?: string;
  totalMemories?: number;
};

function createSupabaseMock(options: SupabaseOptions = {}) {
  const syncStatusRow = options.syncStatusRow ?? { cursor: null, total_items: 0, metadata: { channel_cursors: {} } };
  const notionToken = options.notionToken ?? 'enc:notion-token';
  const totalMemories = options.totalMemories ?? 5;

  return {
    from: vi.fn((table: string) => {
      if (table === 'reputation_audits') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
          })),
        };
      }

      if (table === 'sync_status') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: syncStatusRow, error: null })),
              })),
            })),
          })),
        };
      }

      if (table === 'oauth_tokens') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: notionToken ? { access_token: notionToken } : null,
                  error: null,
                })),
              })),
            })),
          })),
        };
      }

      if (table === 'raw_events') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ count: totalMemories, error: null })),
          })),
        };
      }

      if (table === 'user_profiles') {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        };
      }

      return {
        select: vi.fn(),
        update: vi.fn(),
      };
    }),
  };
}

function base64Url(text: string) {
  return Buffer.from(text, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

describe('sync route enhancements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('gmail indexes full message body text into event content', async () => {
    const supabase = createSupabaseMock({ syncStatusRow: { cursor: null, total_items: 0 } });
    hoisted.resolveSyncActorMock.mockResolvedValue({ supabase, userId: 'u1' });

    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/gmail/v1/users/me/messages?')) {
        return new Response(JSON.stringify({ messages: [{ id: 'm1' }] }), { status: 200 });
      }
      if (url.includes('/gmail/v1/users/me/messages/m1?format=full')) {
        return new Response(
          JSON.stringify({
            id: 'm1',
            snippet: 'snippet text',
            internalDate: String(Date.now()),
            payload: {
              headers: [
                { name: 'Subject', value: 'Hello' },
                { name: 'From', value: 'sender@example.com' },
              ],
              parts: [
                {
                  mimeType: 'text/plain',
                  body: { data: base64Url('full gmail body text') },
                },
              ],
            },
          }),
          { status: 200 }
        );
      }

      return new Response(JSON.stringify({}), { status: 404 });
    });

    const response = await postGmail(new Request('http://localhost/api/sync/gmail', { method: 'POST' }));
    const payload = (await response.json()) as { ok?: boolean };

    fetchMock.mockRestore();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(hoisted.upsertRawEventsSafelyMock).toHaveBeenCalledTimes(1);

    const events = (hoisted.upsertRawEventsSafelyMock.mock.calls as unknown[][][])[0][1] as Array<Record<string, unknown>>;
    expect(String(events[0].content)).toContain('full gmail body text');

    const metadata = events[0].metadata as Record<string, unknown>;
    expect(metadata.body_indexed).toBe(true);
  });

  it('notion indexes page block text content', async () => {
    const supabase = createSupabaseMock();
    hoisted.resolveSyncActorMock.mockResolvedValue({ supabase, userId: 'u1' });

    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.endsWith('/v1/search')) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: 'page-1',
                object: 'page',
                url: 'https://notion.so/page-1',
                last_edited_time: new Date().toISOString(),
                properties: {
                  Name: {
                    type: 'title',
                    title: [{ plain_text: 'Roadmap' }],
                  },
                },
              },
            ],
          }),
          { status: 200 }
        );
      }

      if (url.includes('/v1/blocks/page-1/children')) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: 'b1',
                type: 'paragraph',
                paragraph: {
                  rich_text: [{ plain_text: 'This page has implementation details.' }],
                },
              },
            ],
          }),
          { status: 200 }
        );
      }

      return new Response(JSON.stringify({}), { status: 404 });
    });

    const response = await postNotion(new Request('http://localhost/api/sync/notion', { method: 'POST' }));
    const payload = (await response.json()) as { ok?: boolean };

    fetchMock.mockRestore();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);

    const events = (hoisted.upsertRawEventsSafelyMock.mock.calls as unknown[][][])[0][1] as Array<Record<string, unknown>>;
    expect(String(events[0].content)).toContain('implementation details');

    const metadata = events[0].metadata as Record<string, unknown>;
    expect(metadata.page_content_indexed).toBe(true);
  });

  it('slack includes both channel and dm message sync via paginated conversations', async () => {
    const supabase = createSupabaseMock({
      syncStatusRow: { metadata: { channel_cursors: {} }, total_items: 0 },
    });
    hoisted.resolveSyncActorMock.mockResolvedValue({ supabase, userId: 'u1' });

    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('conversations.list') && url.includes('limit=200') && !url.includes('cursor=')) {
        return new Response(
          JSON.stringify({
            ok: true,
            channels: [{ id: 'c1', name: 'general', is_member: true }],
            response_metadata: { next_cursor: 'cursor-1' },
          }),
          { status: 200 }
        );
      }

      if (url.includes('conversations.list') && url.includes('cursor=cursor-1')) {
        return new Response(
          JSON.stringify({
            ok: true,
            channels: [{ id: 'd1', is_im: true, user: 'u2' }],
            response_metadata: { next_cursor: '' },
          }),
          { status: 200 }
        );
      }

      if (url.includes('conversations.history') && url.includes('channel=c1')) {
        return new Response(
          JSON.stringify({ ok: true, messages: [{ text: 'channel msg', ts: '1710000000.111', user: 'u1' }] }),
          { status: 200 }
        );
      }

      if (url.includes('conversations.history') && url.includes('channel=d1')) {
        return new Response(
          JSON.stringify({ ok: true, messages: [{ text: 'dm msg', ts: '1710000001.111', user: 'u2' }] }),
          { status: 200 }
        );
      }

      return new Response(JSON.stringify({}), { status: 404 });
    });

    const response = await postSlack(new Request('http://localhost/api/sync/slack', { method: 'POST' }));
    const payload = (await response.json()) as { success?: boolean; count?: number };

    fetchMock.mockRestore();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect((payload.count || 0) >= 2).toBe(true);

    const events = (hoisted.upsertRawEventsSafelyMock.mock.calls as unknown[][][])[0][1] as Array<Record<string, unknown>>;
    const hasDm = events.some((event) => {
      const metadata = event.metadata as Record<string, unknown>;
      return metadata.is_im === true;
    });

    expect(hasDm).toBe(true);
  });

  it('discord captures guild message events and persists guild channel cursors', async () => {
    const supabase = createSupabaseMock({
      syncStatusRow: { metadata: { channel_cursors: {} }, total_items: 0 },
    });
    hoisted.resolveSyncActorMock.mockResolvedValue({ supabase, userId: 'u1' });

    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = input.toString();

      if (url.endsWith('/users/@me')) {
        return new Response(JSON.stringify({ id: 'du1', username: 'alice', discriminator: '0001' }), { status: 200 });
      }
      if (url.endsWith('/users/@me/guilds')) {
        return new Response(JSON.stringify([{ id: 'g1', name: 'Guild One', owner: false }]), { status: 200 });
      }
      if (url.endsWith('/users/@me/channels')) {
        return new Response(JSON.stringify([{ id: 'dm1', recipients: [{ username: 'bob' }] }]), { status: 200 });
      }
      if (url.includes('/channels/dm1/messages')) {
        return new Response(
          JSON.stringify([{ id: 'm-dm-1', content: 'hello dm', timestamp: new Date().toISOString(), author: { username: 'bob' } }]),
          { status: 200 }
        );
      }
      if (url.includes('/guilds/g1/channels')) {
        return new Response(JSON.stringify([{ id: 'c1', guild_id: 'g1', name: 'general', type: 0 }]), { status: 200 });
      }
      if (url.includes('/channels/c1/messages')) {
        return new Response(
          JSON.stringify([
            { id: 'm-guild-1', content: 'hello guild', timestamp: new Date().toISOString(), author: { username: 'charlie' } },
          ]),
          { status: 200 }
        );
      }

      return new Response(JSON.stringify({}), { status: 404 });
    });

    const response = await postDiscord(new Request('http://localhost/api/sync/discord', { method: 'POST' }));
    const payload = (await response.json()) as { success?: boolean; count?: number };

    fetchMock.mockRestore();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect((payload.count || 0) > 0).toBe(true);

    const events = (hoisted.upsertRawEventsSafelyMock.mock.calls as unknown[][][])[0][1] as Array<Record<string, unknown>>;
    const hasGuildMembership = events.some((event) => event.event_type === 'guild_membership');
    expect(hasGuildMembership).toBe(true);

    const syncCalls = (hoisted.upsertSyncStatusSafelyMock.mock.calls as unknown[][][]).map((call) => call[1] as unknown as Record<string, unknown>);
    const finalDiscordCall = [...syncCalls].reverse().find((call) => call.platform === 'discord' && call.metadata);
    expect(finalDiscordCall).toBeTruthy();

    const metadata = finalDiscordCall?.metadata as { channel_cursors?: Record<string, unknown> };
    expect(metadata).toBeTruthy();
    expect(metadata.channel_cursors).toBeTruthy();
  });
});
