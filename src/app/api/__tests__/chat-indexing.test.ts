import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const upsertSpy = vi.fn(async () => ({ error: null }));

const hoisted = vi.hoisted(() => {
  return {
    supabase: {
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: 'test-user-id' } },
          error: null,
        })),
      },
      from: vi.fn((table: string) => {
        const builder = {
          select: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          single: vi.fn(async () => {
            if (table === 'chat_threads') {
              return { data: { id: 'thread-123', summary: 'Thread summary' }, error: null };
            }
            return { data: null, error: null };
          }),
          delete: vi.fn(() => builder),
          insert: vi.fn(async () => ({ error: null })),
          upsert: vi.fn(() => builder),
        };
        if (table === 'memories') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({ data: [], error: null })),
              })),
            })),
            upsert: upsertSpy,
          } as any;
        }
        return builder;
      }),
    },
    invokeModel: vi.fn(async (options: { capability: string }) => {
      if (options.capability === 'embed') {
        return { embedding: Array(1024).fill(0.1) };
      }
      return null;
    }),
  };
});

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => hoisted.supabase),
}));

vi.mock('@/services/ai/ai', () => ({
  invokeModel: hoisted.invokeModel,
}));

import { POST } from '@/app/api/chat/threads/route';

describe('POST /api/chat/threads indexing', () => {
  beforeEach(() => {
    upsertSpy.mockClear();
  });

  it('indexes completed user-assistant chat turns into memories', async () => {
    const messages = [
      { role: 'user', content: 'What is my favorite song?' },
      { role: 'assistant', content: 'You love folk music.' },
    ];

    const response = await POST(
      new NextRequest('http://localhost/api/chat/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: 'thread-123',
          title: 'Favorite Song',
          messages,
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    // Use (as any) to avoid TS2493 on mock calls tuple inference
    expect((upsertSpy.mock.calls as any)[0][0]).toMatchObject({
      user_id: 'test-user-id',
      platform: 'eyes_chat',
      event_type: 'chat_turn',
      content: 'User: What is my favorite song?\nEYES: You love folk music.',
    });
  });
});
