import { describe, expect, it, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => {
  return {
    userId: '4d2f3e3c-b834-43fc-852a-c3cdbb535b68',
    audit: {
      id: 'dd1fe08c-e7b4-46ba-a1b2-da6517cfc89b',
      user_id: '4d2f3e3c-b834-43fc-852a-c3cdbb535b68',
      status: 'completed',
      risk_score: 5.5,
      mentions_count: 120,
      commitments_count: 5,
      summary_narrative: 'Test summary narrative.',
      connectors_covered: ['gmail', 'slack'],
      report_url: null,
      created_at: '2026-06-12T00:00:00.000Z',
      metadata: { subjectName: 'Tommy' }
    }
  };
});

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => {
    const queryBuilder = {
      select: vi.fn(() => queryBuilder),
      eq: vi.fn(() => queryBuilder),
      like: vi.fn(() => queryBuilder),
      maybeSingle: vi.fn(async () => {
        return { data: hoisted.audit, error: null };
      })
    };
    return {
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: {
              id: hoisted.userId,
              email: 'thomasshelby251890@gmail.com'
            }
          },
          error: null
        }))
      },
      from: vi.fn(() => queryBuilder)
    };
  }),
  createAdminClient: vi.fn(async () => {
    const adminQueryBuilder = {
      select: vi.fn(() => adminQueryBuilder),
      eq: vi.fn(() => adminQueryBuilder),
      in: vi.fn(async () => {
        return {
          data: [
            { platform: 'gmail' },
            { platform: 'slack' }
          ],
          error: null
        };
      })
    };
    return {
      from: vi.fn(() => adminQueryBuilder)
    };
  })
}));

import { GET } from '@/app/api/audit/[id]/pdf/route';

describe('GET /api/audit/[id]/pdf', () => {
  it('generates PDF and returns a 200 response', async () => {
    const req = new Request(`http://localhost:3000/api/audit/${hoisted.audit.id}/pdf`);
    const params = Promise.resolve({ id: hoisted.audit.id });

    const response = await GET(req, { params });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    
    const arrayBuffer = await response.arrayBuffer();
    console.log('Test Generated PDF Size:', arrayBuffer.byteLength, 'bytes');
    expect(arrayBuffer.byteLength).toBeGreaterThan(0);
  });
});
