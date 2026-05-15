import { beforeEach, describe, expect, it, vi } from 'vitest';

type RawEventRow = {
  id: string;
  user_id: string;
  platform: string;
  platform_id: string;
  event_type: string;
  title: string;
  content: string;
  author: string;
  timestamp: string;
  metadata: Record<string, unknown>;
  is_flagged: boolean;
  flag_severity: string | null;
  flag_reason: string | null;
};

type EmbeddingRow = {
  id: string;
  user_id: string;
  event_id: string;
  content: string;
  embedding: number[];
};

const hoisted = vi.hoisted(() => {
  const state = {
    userId: '11111111-1111-4111-8111-111111111111',
    rawEvents: [] as RawEventRow[],
    embeddings: [] as EmbeddingRow[],
  };

  type QueryContext = {
    table: string;
    filters: Record<string, unknown>;
    inFilters: Record<string, unknown[]>;
    notNullColumns: Set<string>;
    limitValue?: number;
    selectedColumns?: string;
    headCount: boolean;
    updatePayload: Record<string, unknown> | null;
  };

  function createQueryBuilder(table: string) {
    const context: QueryContext = {
      table,
      filters: {},
      inFilters: {},
      notNullColumns: new Set<string>(),
      limitValue: undefined,
      selectedColumns: undefined,
      headCount: false,
      updatePayload: null,
    };

    const execute = async () => {
      if (context.table === 'raw_events' && context.selectedColumns) {
        let rows = state.rawEvents.filter((row) => {
          return Object.entries(context.filters).every(([column, value]) => {
            const rowValue = (row as unknown as Record<string, unknown>)[column];
            if (value === null && rowValue === undefined) {
              return true;
            }
            return rowValue === value;
          });
        });

        rows = rows.filter((row) => {
          return Object.entries(context.inFilters).every(([column, values]) => {
            return values.includes((row as unknown as Record<string, unknown>)[column]);
          });
        });

        rows = rows.filter((row) => {
          return Array.from(context.notNullColumns).every((column) => {
            return (row as unknown as Record<string, unknown>)[column] !== null;
          });
        });

        if (context.headCount) {
          return { data: null, error: null, count: rows.length };
        }

        if (typeof context.limitValue === 'number') {
          rows = rows.slice(0, context.limitValue);
        }

        return { data: rows, error: null };
      }

      if (context.table === 'embeddings' && context.selectedColumns) {
        let rows = state.embeddings.filter((row) => {
          return Object.entries(context.filters).every(([column, value]) => {
            return (row as unknown as Record<string, unknown>)[column] === value;
          });
        });

        rows = rows.filter((row) => {
          return Object.entries(context.inFilters).every(([column, values]) => {
            return values.includes((row as unknown as Record<string, unknown>)[column]);
          });
        });

        if (typeof context.limitValue === 'number') {
          rows = rows.slice(0, context.limitValue);
        }

        return { data: rows, error: null };
      }

      if (context.table === 'user_profiles' && context.updatePayload) {
        return { data: [{ ...context.updatePayload }], error: null };
      }

      return { data: null, error: null };
    };

    const builder = {
      select(columns: string, options?: { count?: 'exact'; head?: boolean }) {
        context.selectedColumns = columns;
        context.headCount = Boolean(options?.count === 'exact' && options?.head);
        return builder;
      },
      eq(column: string, value: unknown) {
        context.filters[column] = value;
        return builder;
      },
      in(column: string, values: unknown[]) {
        context.inFilters[column] = values;
        return builder;
      },
      not(column: string, operator: string, value: unknown) {
        void value;
        if (operator === 'is') {
          context.notNullColumns.add(column);
        }
        return builder;
      },
      is(column: string, value: unknown) {
        context.filters[column] = value;
        return builder;
      },
      single: vi.fn(async () => {
        if (context.table === 'user_profiles') {
          return { data: { memories_indexed: 5 }, error: null };
        }
        return { data: null, error: null };
      }),
      maybeSingle: vi.fn(async () => {
        if (context.table === 'sync_status') {
          return { data: { cursor: '1', total_items: 10 }, error: null };
        }
        return { data: null, error: null };
      }),
      limit(value: number) {
        context.limitValue = value;
        return builder;
      },
      update(payload: Record<string, unknown>) {
        context.updatePayload = payload;
        return builder;
      },
      order(column: string, options?: { ascending?: boolean }) {
        void column;
        void options;
        return builder;
      },
      insert(payload: Record<string, unknown>) {
        if (context.table === 'embeddings') {
          state.embeddings.push({
            id: `embedding-${state.embeddings.length + 1}`,
            ...(payload as unknown as Omit<EmbeddingRow, 'id'>),
          });
        }
        return Promise.resolve({ error: null });
      },
      then<TResult1 = unknown, TResult2 = never>(
        onfulfilled?: ((value: { data: unknown; error: null; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
      ) {
        return execute().then(onfulfilled, onrejected);
      },
    };

    return builder;
  }

  const fakeSupabase = {
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: {
            id: state.userId,
            user_metadata: { name: 'Pipeline User' },
          },
        },
        error: null,
      })),
    },
    from: vi.fn((table: string) => createQueryBuilder(table)),
    rpc: vi.fn(async (fnName: string, args: unknown) => {
      void args;
      if (fnName !== 'hybrid_search' && fnName !== 'match_embeddings') {
        return { data: [], error: null };
      }

      return {
        data: state.embeddings.slice(0, 5).map((row) => ({
          id: row.event_id,
          content: row.content,
          similarity: 0.82,
          combined_score: 0.82,
        })),
        error: null,
      };
    }),
  };

  const generateEmbeddingMock = vi.fn(async (text: string) => ({
    embedding: [text.length, 0.123],
    tokens: text.length,
  }));

  const chatCompletionMock = vi.fn(
    async (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>) => {
      void messages;
      return 'Pipeline response generated from indexed memory context.';
    }
  );

  const invokeModelMock = vi.fn(async (options: any) => {
    if (options.capability === 'embed') {
      return { embedding: [0.12, 0.44], tokens: 5 };
    }
    if (options.capability === 'chat') {
      return 'Pipeline response generated from indexed memory context.';
    }
    return null;
  });

  const invokeModelStreamMock = vi.fn(async () => {
    const encoder = new TextEncoder();
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('streamed response'));
        controller.close();
      },
    });
  });

  return {
    state,
    fakeSupabase,
    generateEmbeddingMock,
    chatCompletionMock,
    invokeModelMock,
    invokeModelStreamMock,
  };
});

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => hoisted.fakeSupabase),
}));

vi.mock('@/utils/sync/actor', () => ({
  resolveSyncActor: vi.fn(async () => ({
    supabase: hoisted.fakeSupabase,
    userId: hoisted.state.userId,
    userEmail: 'pipeline@example.com',
    userName: 'Pipeline User',
    mode: 'session',
  })),
}));

vi.mock('@/services/auth/oauth', () => ({
  getValidGithubToken: vi.fn(async () => 'github-token'),
}));

vi.mock('@/utils/supabase/upsert', () => ({
  upsertRawEventsSafely: vi.fn(async (supabase: unknown, events: RawEventRow[]) => {
    void supabase;
    events.forEach((event, index) => {
      hoisted.state.rawEvents.push({
        ...event,
        id: `event-${hoisted.state.rawEvents.length + index + 1}`,
      });
    });
  }),
  upsertSyncStatusSafely: vi.fn(async () => ({ error: null })),
}));

vi.mock('@/services/ai/ai', () => ({
  invokeModel: hoisted.invokeModelMock,
  invokeModelStream: hoisted.invokeModelStreamMock,
  generateEmbedding: hoisted.generateEmbeddingMock,
  chatCompletion: hoisted.chatCompletionMock,
}));

import { POST as syncGithubPost } from '@/app/api/sync/github/route';
import { POST as syncEmbeddingsPost } from '@/app/api/sync/embeddings/route';
import { POST as chatPost } from '@/app/api/chat/route';

describe('pipeline flow: sync -> embeddings -> chat', () => {
  beforeEach(() => {
    hoisted.state.rawEvents = [];
    hoisted.state.embeddings = [];
    hoisted.generateEmbeddingMock.mockClear();
    hoisted.chatCompletionMock.mockClear();
  });

  it('indexes provider data, builds embeddings, and answers chat with retrieved context', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('api.github.com/user/repos')) {
        return new Response(
          JSON.stringify([
            {
              id: 42,
              full_name: 'pipeline/repo',
              name: 'repo',
              html_url: 'https://github.com/pipeline/repo',
              description: 'Repository for pipeline integration validation',
              language: 'TypeScript',
              stargazers_count: 12,
              forks_count: 3,
              pushed_at: '2026-04-08T12:00:00.000Z',
              updated_at: '2026-04-08T12:00:00.000Z',
            },
          ]),
          { status: 200 }
        );
      }

      return new Response(JSON.stringify({ error: 'unexpected URL' }), { status: 404 });
    });

    const syncResponse = await syncGithubPost(new Request('http://localhost/api/sync/github', { method: 'POST' }));
    const syncPayload = (await syncResponse.json()) as { ok?: boolean; syncedRepos?: number };

    expect(syncResponse.status).toBe(200);
    expect(syncPayload.ok).toBe(true);
    expect(syncPayload.syncedRepos).toBe(1);
    expect(hoisted.state.rawEvents.length).toBe(1);

    const embeddingResponse = await syncEmbeddingsPost(new Request('http://localhost/api/sync/embeddings', { method: 'POST' }));
    const embeddingPayload = (await embeddingResponse.json()) as { indexed?: number; indexedChunks?: number };

    expect(embeddingResponse.status).toBe(200);
    expect(embeddingPayload.indexed).toBe(1);
    expect((embeddingPayload.indexedChunks ?? 0) > 0).toBe(true);
    expect(hoisted.state.embeddings.length > 0).toBe(true);

    const chatResponse = await chatPost(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'What did I recently work on?' }),
      })
    );
    const chatPayload = (await chatResponse.json()) as { answer?: string; contextUsed?: boolean };

    expect(chatResponse.status).toBe(200);
    expect(chatPayload.contextUsed).toBe(true);
    expect(chatPayload.answer).toContain('Pipeline response');

    const lastInvokeCall = hoisted.invokeModelMock.mock.calls.find(call => call[0].capability === 'chat')?.[0];
    const systemPrompt = lastInvokeCall?.system || '';
    expect(systemPrompt).toContain('pipeline/repo');

    fetchMock.mockRestore();
  });
});
