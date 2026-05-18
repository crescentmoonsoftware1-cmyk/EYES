import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const userId = '11111111-1111-4111-8111-111111111111';

  function createSupabase() {
    return {
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: {
              id: userId,
              email: 'export@example.com',
            },
          },
          error: null,
        })),
      },
      from: vi.fn((table: string) => {
        const context = {
          headCount: false,
        };

        const resolve = async () => {
          if (table === 'topics') {
            return {
              data: [
                {
                  id: 'topic-1',
                  title: 'Reliability',
                  description: 'Reliability improvements',
                  event_ids: ['event-1'],
                  sentiment: 'positive',
                  connection_count: 1,
                  created_at: '2026-04-08T00:00:00.000Z',
                  updated_at: '2026-04-08T00:00:00.000Z',
                },
              ],
              error: null,
            };
          }

          if (table === 'sync_status') {
            return {
              data: [
                {
                  platform: 'github',
                  last_sync_at: '2026-04-08T00:00:00.000Z',
                  next_sync_at: null,
                  sync_progress: 100,
                  total_items: 12,
                  status: 'connected',
                  error_message: null,
                  created_at: '2026-04-08T00:00:00.000Z',
                  updated_at: '2026-04-08T00:00:00.000Z',
                },
              ],
              error: null,
            };
          }

          if (table === 'oauth_tokens') {
            return {
              data: [
                {
                  platform: 'github',
                  scope: 'read:user repo',
                  created_at: '2026-04-08T00:00:00.000Z',
                  updated_at: '2026-04-08T00:00:00.000Z',
                  expires_at: null,
                },
              ],
              error: null,
            };
          }

          if (table === 'embeddings') {
            return {
              data: null,
              count: 3,
              error: null,
            };
          }

          if (table === 'user_profiles') {
            return {
              data: {
                name: 'Export User',
                avatar: 'E',
                plan: 'Private Beta',
                joined_date: 'Apr 2026',
                memories_indexed: 12,
                created_at: '2026-04-08T00:00:00.000Z',
                updated_at: '2026-04-08T00:00:00.000Z',
              },
              error: null,
            };
          }

          return {
            data: [],
            error: null,
          };
        };

        const builder = {
          select: vi.fn((_columns: string, options?: { count?: 'exact'; head?: boolean }) => {
            context.headCount = Boolean(options?.count === 'exact' && options?.head);
            return builder;
          }),
          eq: vi.fn(() => builder),
          not: vi.fn(() => builder),
          maybeSingle: vi.fn(async () => resolve()),
          order: vi.fn(async () => {
            if (table === 'memories') {
              return {
                data: [
                  {
                    id: 'event-1',
                    platform: 'github',
                    source_id: 'repo-1',
                    event_type: 'commit',
                    title: 'Improved retry strategy',
                    content: 'Adjusted retry backoff and telemetry',
                    author: 'dev',
                    timestamp: '2026-04-08T01:00:00.000Z',
                    metadata: { pr: 42 },
                    is_flagged: false,
                    flag_severity: null,
                    flag_reason: null,
                    created_at: '2026-04-08T01:00:00.000Z',
                    updated_at: '2026-04-08T01:00:00.000Z',
                  },
                ],
                error: null,
              };
            }

            return resolve();
          }),
          then<TResult1 = unknown, TResult2 = never>(
            onfulfilled?: ((value: { data: unknown; error: null; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
          ) {
            return resolve().then(onfulfilled, onrejected);
          },
        };

        return builder;
      }),
    };
  }

  return {
    createSupabase,
  };
});

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => hoisted.createSupabase()),
}));

import { GET } from '@/app/api/data/export/route';

describe('GET /api/data/export', () => {
  it('returns CSV content for raw events dataset', async () => {
    const response = await GET(new Request('http://localhost/api/data/export?format=csv&dataset=raw_events'));
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/csv');
    expect(response.headers.get('Content-Disposition')).toContain('.csv');
    expect(text).toContain('platform,source_id,event_type');
    expect(text).toContain('github');
    expect(text).toContain('Improved retry strategy');
  });

  it('returns signed URL and redeems ZIP export bundle', async () => {
    const previousSigningKey = process.env.EXPORT_SIGNING_KEY;
    process.env.EXPORT_SIGNING_KEY = 'unit-test-export-signing-key';

    const signedResponse = await GET(
      new Request('http://localhost/api/data/export?format=zip&delivery=signed-url')
    );
    const signedPayload = (await signedResponse.json()) as {
      signed: boolean;
      format: string;
      downloadUrl: string;
      expiresAt: string;
    };

    expect(signedResponse.status).toBe(200);
    expect(signedPayload.signed).toBe(true);
    expect(signedPayload.format).toBe('zip');
    expect(signedPayload.downloadUrl).toContain('signed=');
    expect(new Date(signedPayload.expiresAt).toString()).not.toBe('Invalid Date');

    const zipResponse = await GET(new Request(signedPayload.downloadUrl));
    const zipBuffer = Buffer.from(await zipResponse.arrayBuffer());

    process.env.EXPORT_SIGNING_KEY = previousSigningKey;

    expect(zipResponse.status).toBe(200);
    expect(zipResponse.headers.get('Content-Type')).toContain('application/zip');
    expect(zipResponse.headers.get('Content-Disposition')).toContain('.zip');
    expect(zipBuffer.length).toBeGreaterThan(100);
  });
});
