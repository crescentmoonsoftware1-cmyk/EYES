import type { Page } from '@playwright/test';

export type ApiCallTracker = {
  syncGithubCalls: number;
  syncEmbeddingsCalls: number;
  chatCalls: number;
};

const MOCK_USER = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'playwright@example.com',
  user_metadata: {
    name: 'Playwright User',
  },
};

export async function installSupabaseClientMock(page: Page) {
  await page.addInitScript((seedUser) => {
    const user = seedUser;

    const profileRow = {
      name: seedUser.user_metadata?.name || 'Playwright User',
      avatar: 'P',
      plan: 'Private Beta',
      joined_date: 'Apr 2026',
      memories_indexed: 1234,
      onboarding_completed: true,
      behavior_logging_consent: true,
    };

    const createQuery = (table: string) => {
      const filters: Record<string, unknown> = {};

      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return query;
        },
        in: () => query,
        maybeSingle: async () => {
          if (table === 'user_profiles') {
            return { data: profileRow, error: null };
          }

          if (table === 'sync_status') {
            return {
              data: {
                status: 'connected',
                sync_progress: 100,
                total_items: 321,
              },
              error: null,
            };
          }

          if (table === 'oauth_tokens') {
            return {
              data: {
                platform: (filters.platform as string) || 'github',
              },
              error: null,
            };
          }

          return { data: null, error: null };
        },
        upsert: () => ({
          select: () => ({
            maybeSingle: async () => ({ data: profileRow, error: null }),
          }),
        }),
        insert: async () => ({ data: null, error: null }),
        update: () => ({
          eq: () => ({
            eq: () => ({
              select: async () => ({ data: [{ id: 'mock-row' }], error: null }),
            }),
          }),
        }),
        delete: () => ({
          eq: () => ({
            eq: () => ({
              in: async () => ({ data: null, error: null }),
              select: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      };

      return query;
    };

    const createChannel = () => {
      const channel = {
        on: () => channel,
        subscribe: (callback?: (status: string) => void) => {
          setTimeout(() => {
            callback?.('SUBSCRIBED');
          }, 0);
          return channel;
        },
      };

      return channel;
    };

    const mockClient = {
      auth: {
        getSession: async () => ({
          data: {
            session: {
              access_token: 'mock-access-token',
              user,
            },
          },
          error: null,
        }),
        onAuthStateChange: (callback: (event: string, session: { user: typeof user } | null) => void) => {
          setTimeout(() => {
            callback('INITIAL_SESSION', { user });
          }, 0);

          return {
            data: {
              subscription: {
                unsubscribe: () => undefined,
              },
            },
          };
        },
        signOut: async () => ({ error: null }),
        signInWithPassword: async () => ({
          data: { user },
          error: null,
        }),
        signUp: async () => ({
          data: { user },
          error: null,
        }),
      },
      from: (table: string) => createQuery(table),
      channel: () => createChannel(),
      removeChannel: async () => ({ error: null }),
    };

    (window as unknown as Record<string, unknown>).__THE_MONITOR_SUPABASE_CLIENT__ = mockClient;
    (window as unknown as Record<string, unknown>).__THE_EYES_SUPABASE_CLIENT__ = mockClient;
  }, MOCK_USER);
}

function jsonResponse(body: unknown) {
  return {
    status: 200,
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

export async function installApiRouteMocks(page: Page, tracker: ApiCallTracker) {
  const nowIso = new Date().toISOString();

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const path = url.pathname;

    if (path === '/api/platform-readiness') {
      await route.fulfill(
        jsonResponse({
          platforms: [
            {
              id: 'reddit',
              configured: true,
              optional: false,
              deferred: false,
              missingEnv: [],
              requiredScopes: ['identity', 'history'],
              connected: false,
              status: 'idle',
              syncProgress: 0,
              totalItems: 0,
              lastSyncAt: null,
              errorMessage: null,
            },
            {
              id: 'gmail',
              configured: true,
              optional: false,
              deferred: false,
              missingEnv: [],
              requiredScopes: ['gmail.readonly'],
              connected: false,
              status: 'idle',
              syncProgress: 0,
              totalItems: 0,
              lastSyncAt: null,
              errorMessage: null,
            },
            {
              id: 'github',
              configured: true,
              optional: false,
              deferred: false,
              missingEnv: [],
              requiredScopes: ['read:user', 'repo:status'],
              connected: true,
              status: 'connected',
              syncProgress: 100,
              totalItems: 321,
              lastSyncAt: nowIso,
              errorMessage: null,
            },
            {
              id: 'notion',
              configured: true,
              optional: false,
              deferred: false,
              missingEnv: [],
              requiredScopes: ['read_content'],
              connected: false,
              status: 'idle',
              syncProgress: 0,
              totalItems: 0,
              lastSyncAt: null,
              errorMessage: null,
            },
            {
              id: 'google-calendar',
              configured: false,
              optional: true,
              deferred: true,
              missingEnv: ['GOOGLE_CLIENT_ID'],
              requiredScopes: ['calendar.readonly'],
              connected: false,
              status: 'idle',
              syncProgress: 0,
              totalItems: 0,
              lastSyncAt: null,
              errorMessage: null,
            },
          ],
        })
      );
      return;
    }

    if (path === '/api/connector-settings/github') {
      if (method === 'GET') {
        await route.fulfill(
          jsonResponse({
            dataTypes: ['Commits', 'Pull requests', 'Issues'],
            syncEnabled: true,
          })
        );
        return;
      }

      if (method === 'PUT') {
        await route.fulfill(
          jsonResponse({
            success: true,
          })
        );
        return;
      }
    }

    if (path === '/api/sync/github' && method === 'POST') {
      tracker.syncGithubCalls += 1;
      await route.fulfill(jsonResponse({ success: true, synced: 24 }));
      return;
    }

    if (path === '/api/sync/embeddings' && method === 'POST') {
      tracker.syncEmbeddingsCalls += 1;
      await route.fulfill(jsonResponse({ success: true, embeddedEvents: 24 }));
      return;
    }

    if (path === '/api/audit-summary') {
      await route.fulfill(
        jsonResponse({
          totalMemories: 321,
          overallRisk: 'LOW',
          riskCounts: { high: 0, med: 1, low: 2 },
          flaggedItems: [],
          comparisonData: [
            {
              eyes: 'Memory recall is healthy',
              recruiter: 'Public profile appears stable',
            },
          ],
        })
      );
      return;
    }

    if (path === '/api/memory-feed') {
      await route.fulfill(
        jsonResponse({
          events: [
            {
              id: 'evt-1',
              platform: 'github',
              title: 'Retry queue hardening merged',
              content: 'Added retry backoff and escalation metadata.',
              timestamp: nowIso,
              eventType: 'pull_request',
              author: 'playwright',
              isFlagged: false,
              flagSeverity: null,
              tags: ['resilience', 'scheduler'],
              metadata: { repository: 'the-monitor' },
            },
          ],
          timeline: [
            { month: 'Jan 26', count: 4 },
            { month: 'Feb 26', count: 6 },
            { month: 'Mar 26', count: 8 },
          ],
          timelineStats: {
            windowMonths: 3,
            peakMonth: 'Mar 26',
            peakCount: 8,
            monthlyAverage: 6,
            last30DaysCount: 7,
            trendPercent: 35,
          },
          platformCounts: { github: 321 },
          latestEventAt: nowIso,
        })
      );
      return;
    }

    if (path === '/api/topic-clusters') {
      await route.fulfill(
        jsonResponse({
          clusters: [
            {
              id: 'cluster-1',
              title: 'Reliability Work',
              description: 'Retries, dead letters, and remediation.',
              eventIds: ['evt-1'],
              sentiment: 'positive',
              connectionCount: 3,
              totalEvents: 1,
              platforms: ['github'],
            },
          ],
        })
      );
      return;
    }

    if (path === '/api/sync/status') {
      await route.fulfill(
        jsonResponse({
          scheduler: {
            health: 'ok',
            runs24h: 18,
            failures24h: 1,
            failureRate24h: 1 / 18,
            lastRunAt: nowIso,
            retry: {
              pendingCount: 0,
              deadLetters24h: 0,
              nextAttemptAt: null,
            },
            alerts: [],
            escalations: [],
          },
        })
      );
      return;
    }

    if (path === '/api/sync/history') {
      await route.fulfill(
        jsonResponse({
          runs: [
            {
              runId: 'run-1',
              createdAt: nowIso,
              trigger: 'manual',
              status: 'success',
              platformCount: 1,
              failedPlatforms: [],
              durationMs: 2200,
              errorCount: 0,
            },
          ],
        })
      );
      return;
    }

    if (path === '/api/sync/analytics') {
      await route.fulfill(
        jsonResponse({
          generatedAt: nowIso,
          windowDays: 30,
          summary: {
            totalRuns: 42,
            totalFailures: 2,
            failureRate: 2 / 42,
            avgDurationMs: 1850,
            totalDeadLetters: 0,
            totalRefreshAttempts: 14,
            totalRefreshFailures: 1,
            refreshFailureRate: 1 / 14,
          },
          trend: [
            {
              date: '2026-04-01',
              runs: 4,
              failures: 0,
              deadLetters: 0,
              refreshAttempts: 1,
              refreshFailures: 0,
              avgDurationMs: 1720,
            },
            {
              date: '2026-04-02',
              runs: 5,
              failures: 1,
              deadLetters: 0,
              refreshAttempts: 2,
              refreshFailures: 1,
              avgDurationMs: 1990,
            },
          ],
        })
      );
      return;
    }

    if (path === '/api/chat-suggestions') {
      await route.fulfill(
        jsonResponse({
          suggestions: [
            'What changed in my GitHub activity this week?',
            'Summarize reliability updates from my memory feed.',
          ],
        })
      );
      return;
    }

    if (path === '/api/ai-readiness') {
      await route.fulfill(
        jsonResponse({
          status: 'online',
          provider: 'OpenAI',
          model: 'gpt-4o',
          reason: 'All probes healthy',
          checks: {
            openaiEmbeddings: { status: 'pass', latencyMs: 44 },
            openaiChat: { status: 'pass', latencyMs: 82 },
            supabase: { status: 'pass', latencyMs: 10 },
          },
        })
      );
      return;
    }

    if (path === '/api/chat' && method === 'POST') {
      tracker.chatCalls += 1;
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'x-context-count': '3',
          'x-retrieval-latency-ms': '47',
          'x-confidence-score': '0.84',
          'x-retrieval-status': 'success',
        },
        body: 'GitHub sync and embeddings look healthy. The latest memory highlights retry resiliency work in your PR discussions. [source:1]',
      });
      return;
    }

    if (path === '/api/dashboard/bootstrap') {
      await route.fulfill(
        jsonResponse({
          summary: {
            totalMemories: 321,
            overallRisk: 'LOW',
            riskCounts: { heavy: 0, direct: 0, light: 2 },
            flaggedItems: [],
            comparisonData: [
              {
                eyes: 'Memory recall is healthy',
                recruiter: 'Public profile appears stable',
              },
            ],
          },
          platforms: [
            {
              id: 'github',
              name: 'GitHub',
              connected: true,
              status: 'connected',
              items: 321,
              errorMessage: null,
            },
          ],
          feedEvents: [
            {
              id: 'evt-1',
              platform: 'github',
              title: 'Retry queue hardening merged',
              content: 'Added retry backoff and escalation metadata.',
              timestamp: nowIso,
              eventType: 'pull_request',
              author: 'playwright',
              is_flagged: false,
              flag_severity: null,
              tags: ['resilience', 'scheduler'],
              metadata: { repository: 'the-monitor' },
            },
          ],
          syncStatus: { isSyncing: false, activeSyncs: [], memoriesIndexed: 321 },
        })
      );
      return;
    }

    if (path === '/api/actions/queue') {
      if (method === 'GET') {
        await route.fulfill(
          jsonResponse({
            actions: [
              {
                id: 'action-1',
                memory_id: 'mem-1',
                platform: 'gmail',
                title: 'Send RSVP to Sarah\'s invitation',
                description: 'Sarah asked: Would you like to attend the dinner tomorrow at 7 PM?',
                suggested_action: 'Sure, I\'d love to attend! Let me know if I should bring anything.',
                action_type: 'EMAIL_REPLY',
                confidence: 0.95,
                status: 'pending',
                extracted_at: nowIso,
              },
            ],
            meta: {
              lastRunAt: nowIso,
              scanStats: {
                analyzed: 10,
                extracted: 1,
              },
              isStale: false,
            },
            recentlyHandled: [],
          })
        );
      } else if (method === 'PATCH') {
        await route.fulfill(jsonResponse({ success: true }));
      }
      return;
    }

    if (path === '/api/actions/extract' && method === 'POST') {
      await route.fulfill(jsonResponse({ success: true, extracted: 1 }));
      return;
    }

    if (path === '/api/actions/execute' && method === 'POST') {
      await route.fulfill(jsonResponse({ success: true, result: 'Executed successfully' }));
      return;
    }

    if (path === '/api/platform-readiness') {
      await route.fulfill(
        jsonResponse({
          platforms: [
            { id: 'github', connected: true, status: 'connected' }
          ]
        })
      );
      return;
    }

    if (path === '/api/chat/threads') {
      if (method === 'GET') {
        await route.fulfill(
          jsonResponse({
            threads: [
              {
                id: 'thread-1',
                title: 'Mocked PR discussion thread',
                created_at: nowIso,
                updated_at: nowIso,
                chat_messages: [
                  { role: 'user', content: 'What changed in my GitHub activity this week?' },
                  { role: 'assistant', content: 'GitHub sync looks healthy. The latest memory highlights retry resiliency work.' },
                ],
              },
            ],
          })
        );
      } else if (method === 'DELETE') {
        await route.fulfill(jsonResponse({ success: true }));
      }
      return;
    }

    if (path === '/api/audit/latest') {
      await route.fulfill(
        jsonResponse({
          id: 'audit-latest-id',
          status: 'completed',
          riskScore: 2,
          mentionsCount: 154,
          commitmentsCount: 5,
          summaryNarrative: 'Neural footprint safe and optimal.',
          createdAt: nowIso,
          reportUrl: '/mock-pdf-url',
          metadata: {
            sentimentBalance: 0.8,
            unfulfilledCommitments: 0,
            commitments: [],
            opportunities: [],
            topEntities: [],
            riskFindings: [],
          },
        })
      );
      return;
    }

    if (path === '/api/audit/history') {
      await route.fulfill(
        jsonResponse({
          audits: [
            {
              id: 'audit-latest-id',
              status: 'completed',
              riskScore: 2,
              mentionsCount: 154,
              commitmentsCount: 5,
              summaryNarrative: 'Neural footprint safe.',
              createdAt: nowIso,
            },
          ],
        })
      );
      return;
    }

    if (path === '/api/audit/create' && method === 'POST') {
      await route.fulfill(jsonResponse({ success: true, auditId: 'new-audit-id' }));
      return;
    }

    if (path.startsWith('/api/audit/') && path.endsWith('/pdf')) {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/pdf' },
        body: 'mock-pdf-content',
      });
      return;
    }

    if (
      path.startsWith('/api/audit/') &&
      !path.endsWith('/history') &&
      !path.endsWith('/latest') &&
      !path.endsWith('/create')
    ) {
      await route.fulfill(
        jsonResponse({
          id: 'new-audit-id',
          status: 'completed',
          riskScore: 1,
          mentionsCount: 321,
          commitmentsCount: 1,
          summaryNarrative: 'Brand new audit executed perfectly.',
          createdAt: nowIso,
          reportUrl: '/mock-pdf-url',
          metadata: {
            sentimentBalance: 0.9,
            unfulfilledCommitments: 0,
            commitments: [],
            opportunities: [],
            topEntities: [],
            riskFindings: [],
          },
        })
      );
      return;
    }

    if (path === '/api/sync/history') {
      await route.fulfill(
        jsonResponse({
          runs: [
            {
              runId: 'run-1',
              createdAt: nowIso,
              status: 'success',
              platformCount: 1,
              failedPlatforms: [],
              durationMs: 1200,
            },
          ],
        })
      );
      return;
    }

    await route.continue();
  });
}
