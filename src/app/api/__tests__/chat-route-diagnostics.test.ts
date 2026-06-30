import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const state = {
    userId: '11111111-1111-4111-8111-111111111111',
    matches: [
      {
        id: 'event-1',
        content: 'Worked on reliability remediation tasks',
        similarity: 0.84,
      },
    ],
    embeddingRows: [
      {
        id: 'event-1',
        event_id: 'event-1',
      },
    ],
    eventRows: [
      {
        id: 'event-1',
        platform: 'github',
        platform_id: 'repo-123',
        title: 'Reliability fix',
        event_type: 'commit',
        author: 'dev',
        timestamp: '2026-04-08T08:00:00.000Z',
      },
    ],
  };

  function createSupabase() {
    return {
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: {
              id: state.userId,
              user_metadata: { name: 'Diagnostics User' },
            },
          },
          error: null,
        })),
      },
      rpc: vi.fn(async () => ({
        data: state.matches.map(m => ({
          ...m,
          platform: 'github',
          source_id: 'repo-123',
          event_type: 'commit',
          title: 'Reliability fix',
          author: 'dev',
          source_url: null,
          timestamp: '2026-04-08T08:00:00.000Z',
          metadata: {},
          is_flagged: false,
          keyword_rank: 0,
          combined_score: m.similarity,
        })),
        error: null,
      })),
      from: vi.fn((table: string) => {
        let ids: string[] = [];

        const builder = {
          select: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          in: vi.fn(async (_column: string, values: string[]) => {
            ids = values;

            if (table === 'embeddings') {
              return {
                data: state.embeddingRows.filter((row) => ids.includes(row.id)),
                error: null,
              };
            }

            if (table === 'raw_events') {
              return {
                data: state.eventRows.filter((row) => ids.includes(row.id)),
                error: null,
              };
            }

            return {
              data: [],
              error: null,
            };
          }),
          single: vi.fn(async () => {
            if (table === 'user_profiles') {
              return { data: { memories_indexed: 5 }, error: null };
            }
            return { data: null, error: null };
          }),
          maybeSingle: vi.fn(async () => {
            if (table === 'user_profiles') {
              return { data: { display_name: 'Diagnostics User' }, error: null };
            }
            return { data: null, error: null };
          }),
          order: vi.fn(() => builder),
          limit: vi.fn(() => builder),
          is: vi.fn(() => builder),
        };

        return builder;
      }),
    };
  }

  const generateEmbeddingMock = vi.fn(async () => ({
    embedding: [0.12, 0.44],
    tokens: 5,
  }));

  const chatCompletionMock = vi.fn(async () => 'Evidence located in [source:1].');

  const chatCompletionStreamMock = vi.fn(async () => {
    const encoder = new TextEncoder();
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('stream answer [source:1]'));
        controller.close();
      },
    });
  });

  const invokeModelMock = vi.fn(async (options: { capability: string }) => {
    if (options.capability === 'embed') {
      return { embedding: [0.12, 0.44], tokens: 5 };
    }
    if (options.capability === 'chat') {
      return 'Evidence located in [source:1].';
    }
    return null;
  });

  const invokeModelStreamMock = vi.fn(async () => {
    const encoder = new TextEncoder();
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('stream answer [source:1]'));
        controller.close();
      },
    });
  });

  return {
    createSupabase,
    generateEmbeddingMock,
    chatCompletionMock,
    chatCompletionStreamMock,
    invokeModelMock,
    invokeModelStreamMock,
  };
});

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => hoisted.createSupabase()),
}));

vi.mock('@/services/ai/ai', () => ({
  invokeModel: hoisted.invokeModelMock,
  invokeModelStream: hoisted.invokeModelStreamMock,
  generateEmbedding: hoisted.generateEmbeddingMock,
  chatCompletion: hoisted.chatCompletionMock,
  chatCompletionStream: hoisted.chatCompletionStreamMock,
}));

import { POST } from '@/app/api/chat/route';

describe('POST /api/chat diagnostics', () => {
  beforeEach(() => {
    hoisted.generateEmbeddingMock.mockClear();
    hoisted.chatCompletionMock.mockClear();
    hoisted.chatCompletionStreamMock.mockClear();
  });

  it('returns citations and diagnostics in JSON mode', async () => {
    const response = await POST(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'What did I work on?' }),
      })
    );

    const payload = (await response.json()) as {
      answer: string;
      contextUsed: boolean;
      citations: Array<{ sourceId: number; platform: string }>;
      diagnostics: { contextCount: number; retrievalStatus: string; confidenceScore: number };
    };

    expect(response.status).toBe(200);
    expect(payload.contextUsed).toBe(true);
    expect(payload.citations).toHaveLength(1);
    expect(payload.citations[0]?.platform).toBe('github');
    expect(payload.diagnostics.contextCount).toBe(1);
    expect(payload.diagnostics.retrievalStatus).toBe('success');
    expect(payload.diagnostics.confidenceScore).toBeGreaterThan(0);
    expect(payload.answer).toContain('[source:1]');
  });

  it('returns retrieval diagnostics headers in stream mode', async () => {
    const response = await POST(
      new Request('http://localhost/api/chat?stream=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Stream this answer' }),
      })
    );

    const bodyText = await response.text();
    const citationsHeader = response.headers.get('X-Citations');
    const decodedCitations = citationsHeader
      ? (JSON.parse(Buffer.from(citationsHeader, 'base64url').toString('utf8')) as Array<{
          sourceId: number;
          platform: string;
        }>)
      : [];
    const groundedScore = Number(response.headers.get('X-Grounded-Score') || '0');

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Context-Used')).toBe('true');
    expect(response.headers.get('X-Context-Count')).toBe('1');
    expect(response.headers.get('X-Retrieval-Status')).toBe('success');
    expect(citationsHeader).toBeTruthy();
    expect(decodedCitations[0]?.sourceId).toBe(1);
    expect(decodedCitations[0]?.platform).toBe('github');
    expect(groundedScore).toBeGreaterThan(0);
    expect(bodyText).toContain('[source:1]');
  });
});
