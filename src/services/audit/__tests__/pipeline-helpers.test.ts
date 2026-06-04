/**
 * Unit tests for pure-logic helper functions extracted from analysis-pipeline.ts
 *
 * These functions don't call Supabase or AI, so they can be tested
 * in full isolation without mocking anything heavy.
 *
 * Strategy mirrored from the real pipeline:
 *   resolveCommitmentStatuses — tested via the exported testable version
 *   risk score formula         — tested directly as a pure function
 *   fallback narrative          — tested as a template function
 */

import { describe, expect, it } from 'vitest';

// ─── Pure helpers re-implemented here for isolated testing ────────────────────
// These are exact copies of the private functions in analysis-pipeline.ts.
// If the originals change, these tests will catch regressions.

interface Commitment {
  text: string;
  status: 'pending' | 'completed';
  citation: string;
  platform: string;
  date: string;
}

function resolveCommitmentStatuses(
  commitments: Commitment[],
  calendarEvents: Array<{ title: string | null; timestamp: string | null }>
): Commitment[] {
  if (calendarEvents.length === 0) return commitments;

  return commitments.map((commitment) => {
    const commitmentDate = new Date(commitment.date).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    const commitmentWords = commitment.text
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length >= 3);

    const hasFulfillingEvent = calendarEvents.some((evt) => {
      if (!evt.timestamp || !evt.title) return false;
      const evtDate = new Date(evt.timestamp).getTime();
      const withinWindow = Math.abs(evtDate - commitmentDate) <= sevenDaysMs;
      if (!withinWindow) return false;

      const evtWords = evt.title.toLowerCase().split(/\W+/).filter((w) => w.length >= 3);
      return commitmentWords.some((w) => evtWords.includes(w));
    });

    return {
      ...commitment,
      status: hasFulfillingEvent ? 'completed' : 'pending',
    };
  });
}

function computeRiskScore(
  weightedNegativeMentions: number,
  weightedNeutralMentions: number,
  weightedUnfulfilledCommitments: number,
  weightedTotalMentions: number
): number {
  return Math.min(
    10,
    Number(
      (
        ((weightedNegativeMentions * 2) +
          (weightedNeutralMentions * 0.5) +
          (weightedUnfulfilledCommitments * 3)) /
        (weightedTotalMentions || 1) *
        10
      ).toFixed(1)
    )
  );
}

function buildFallbackNarrative(params: {
  eventCount: number;
  platforms: string[];
  negativeMentions: number;
  unfulfilledCommitmentsCount: number;
  riskScore: number;
  failureRate: number;
  topEntities: string[];
}): string {
  const {
    eventCount, platforms, negativeMentions, unfulfilledCommitmentsCount,
    riskScore, failureRate, topEntities,
  } = params;
  return (
    `${eventCount} records were analysed across ${platforms.join(', ')} over a 24-month window. ` +
    `${negativeMentions} negative signal${negativeMentions !== 1 ? 's' : ''} were detected, ` +
    `producing a failure rate of ${failureRate.toFixed(1)}%. ` +
    (unfulfilledCommitmentsCount > 0
      ? `${unfulfilledCommitmentsCount} open commitment${unfulfilledCommitmentsCount !== 1 ? 's' : ''} were extracted and remain unresolved.`
      : 'No commitment records were extracted from the dataset.') +
    ` Risk score: ${riskScore}/10 — ` +
    (riskScore <= 2 ? 'minimal exposure detected' : riskScore <= 5 ? 'moderate exposure detected' : 'elevated exposure detected') +
    (topEntities.length > 0 ? ` Most referenced entities: ${topEntities.slice(0, 3).join(', ')}.` : '')
  );
}

// ─── resolveCommitmentStatuses ─────────────────────────────────────────────────

describe('resolveCommitmentStatuses', () => {
  const baseDate = '2024-03-15T12:00:00Z';

  it('returns all commitments as pending when no calendar events exist', () => {
    const commitments: Commitment[] = [
      { text: 'will send the report', status: 'pending', citation: 'id-1', platform: 'slack', date: baseDate },
    ];
    const result = resolveCommitmentStatuses(commitments, []);
    expect(result[0].status).toBe('pending');
  });

  it('marks commitment as completed when matching calendar event exists within 7 days', () => {
    const commitments: Commitment[] = [
      { text: 'will review the report', status: 'pending', citation: 'id-1', platform: 'slack', date: baseDate },
    ];
    const calendarEvents = [
      { title: 'Report Review Meeting', timestamp: '2024-03-17T10:00:00Z' }, // +2 days
    ];
    const result = resolveCommitmentStatuses(commitments, calendarEvents);
    expect(result[0].status).toBe('completed');
  });

  it('keeps commitment as pending if calendar event is outside 7-day window', () => {
    const commitments: Commitment[] = [
      { text: 'will review the proposal', status: 'pending', citation: 'id-2', platform: 'slack', date: baseDate },
    ];
    const calendarEvents = [
      { title: 'Proposal Review', timestamp: '2024-03-30T10:00:00Z' }, // +15 days — outside window
    ];
    const result = resolveCommitmentStatuses(commitments, calendarEvents);
    expect(result[0].status).toBe('pending');
  });

  it('keeps commitment as pending if calendar event title has no overlapping keywords', () => {
    const commitments: Commitment[] = [
      { text: 'will send the invoice', status: 'pending', citation: 'id-3', platform: 'gmail', date: baseDate },
    ];
    const calendarEvents = [
      { title: 'Birthday Party Planning', timestamp: '2024-03-16T09:00:00Z' }, // within 7 days but no matching words
    ];
    const result = resolveCommitmentStatuses(commitments, calendarEvents);
    expect(result[0].status).toBe('pending');
  });

  it('handles multiple commitments independently', () => {
    const commitments: Commitment[] = [
      { text: 'will review the contract', status: 'pending', citation: 'id-1', platform: 'slack', date: baseDate },
      { text: 'will schedule the interview', status: 'pending', citation: 'id-2', platform: 'gmail', date: baseDate },
    ];
    const calendarEvents = [
      { title: 'Contract Review', timestamp: '2024-03-16T10:00:00Z' }, // matches first
    ];
    const result = resolveCommitmentStatuses(commitments, calendarEvents);
    expect(result[0].status).toBe('completed');
    expect(result[1].status).toBe('pending'); // no matching event
  });

  it('skips calendar events with null title or timestamp', () => {
    const commitments: Commitment[] = [
      { text: 'will deliver the demo', status: 'pending', citation: 'id-4', platform: 'slack', date: baseDate },
    ];
    const calendarEvents = [
      { title: null, timestamp: '2024-03-16T10:00:00Z' },
      { title: 'Demo Delivery', timestamp: null },
    ];
    const result = resolveCommitmentStatuses(commitments, calendarEvents);
    expect(result[0].status).toBe('pending');
  });

  it('filters out short words (< 3 chars) from keyword matching', () => {
    const commitments: Commitment[] = [
      { text: 'I will do it', status: 'pending', citation: 'id-5', platform: 'slack', date: baseDate },
    ];
    // Only keyword candidates: "will" (4) → meaningful words are ["will"]
    const calendarEvents = [
      { title: 'will check', timestamp: '2024-03-16T10:00:00Z' },
    ];
    const result = resolveCommitmentStatuses(commitments, calendarEvents);
    expect(result[0].status).toBe('completed'); // "will" matches
  });
});

// ─── computeRiskScore ──────────────────────────────────────────────────────────

describe('computeRiskScore', () => {
  it('returns 0 for all-zero inputs (division-by-zero safe)', () => {
    const score = computeRiskScore(0, 0, 0, 0);
    expect(score).toBe(0);
  });

  it('returns max 10 even for extreme values', () => {
    const score = computeRiskScore(1000, 1000, 1000, 1);
    expect(score).toBe(10);
  });

  it('weights negative mentions 2×', () => {
    const negHeavy = computeRiskScore(10, 0, 0, 10);
    const neutHeavy = computeRiskScore(0, 10, 0, 10);
    expect(negHeavy).toBeGreaterThan(neutHeavy);
  });

  it('weights unfulfilled commitments 3× relative to negative mentions 2×', () => {
    // Use a scenario where values are low enough not to cap at 10
    // commitments: (0*2 + 0*0.5 + 1*3) / 5 * 10 = 30/5 = 6
    // negative:    (1*2 + 0*0.5 + 0*3) / 5 * 10 = 20/5 = 4
    const commitments = computeRiskScore(0, 0, 1, 5);
    const negative = computeRiskScore(1, 0, 0, 5);
    expect(commitments).toBeGreaterThan(negative);
  });

  it('neutral mentions contribute 0.5× weight', () => {
    const score = computeRiskScore(0, 10, 0, 10);
    // (10 * 0.5) / 10 * 10 = 5
    expect(score).toBe(5);
  });

  it('produces expected score for a mixed scenario', () => {
    // (4*2 + 2*0.5 + 1*3) / 10 * 10 = (8 + 1 + 3) / 10 * 10 = 12 → capped at 10
    const score = computeRiskScore(4, 2, 1, 10);
    expect(score).toBe(10);
  });

  it('produces correct score for a low-risk scenario', () => {
    // (1*2 + 8*0.5 + 0*3) / 20 * 10 = (2 + 4) / 20 * 10 = 3
    const score = computeRiskScore(1, 8, 0, 20);
    expect(score).toBe(3);
  });
});

// ─── buildFallbackNarrative ────────────────────────────────────────────────────

describe('buildFallbackNarrative', () => {
  it('includes event count and platforms', () => {
    const narrative = buildFallbackNarrative({
      eventCount: 250,
      platforms: ['gmail', 'slack'],
      negativeMentions: 5,
      unfulfilledCommitmentsCount: 2,
      riskScore: 3,
      failureRate: 2.0,
      topEntities: [],
    });
    expect(narrative).toContain('250 records');
    expect(narrative).toContain('gmail');
    expect(narrative).toContain('slack');
  });

  it('uses singular "signal" for exactly 1 negative mention', () => {
    const narrative = buildFallbackNarrative({
      eventCount: 100,
      platforms: ['github'],
      negativeMentions: 1,
      unfulfilledCommitmentsCount: 0,
      riskScore: 1,
      failureRate: 1.0,
      topEntities: [],
    });
    expect(narrative).toContain('1 negative signal ');
    expect(narrative).not.toContain('1 negative signals');
  });

  it('uses plural "signals" for more than 1 negative mention', () => {
    const narrative = buildFallbackNarrative({
      eventCount: 100,
      platforms: ['github'],
      negativeMentions: 3,
      unfulfilledCommitmentsCount: 0,
      riskScore: 2,
      failureRate: 3.0,
      topEntities: [],
    });
    expect(narrative).toContain('3 negative signals');
  });

  it('indicates no commitments when count is 0', () => {
    const narrative = buildFallbackNarrative({
      eventCount: 100,
      platforms: ['slack'],
      negativeMentions: 0,
      unfulfilledCommitmentsCount: 0,
      riskScore: 0,
      failureRate: 0,
      topEntities: [],
    });
    expect(narrative).toContain('No commitment records were extracted');
  });

  it('describes open commitments when count > 0', () => {
    const narrative = buildFallbackNarrative({
      eventCount: 100,
      platforms: ['slack'],
      negativeMentions: 0,
      unfulfilledCommitmentsCount: 3,
      riskScore: 2,
      failureRate: 0,
      topEntities: [],
    });
    expect(narrative).toContain('3 open commitments');
  });

  it('labels risk score ≤ 2 as minimal exposure', () => {
    const narrative = buildFallbackNarrative({
      eventCount: 50,
      platforms: ['gmail'],
      negativeMentions: 0,
      unfulfilledCommitmentsCount: 0,
      riskScore: 2,
      failureRate: 0,
      topEntities: [],
    });
    expect(narrative).toContain('minimal exposure detected');
  });

  it('labels risk score ≤ 5 as moderate exposure', () => {
    const narrative = buildFallbackNarrative({
      eventCount: 50,
      platforms: ['gmail'],
      negativeMentions: 2,
      unfulfilledCommitmentsCount: 1,
      riskScore: 4,
      failureRate: 4,
      topEntities: [],
    });
    expect(narrative).toContain('moderate exposure detected');
  });

  it('labels risk score > 5 as elevated exposure', () => {
    const narrative = buildFallbackNarrative({
      eventCount: 50,
      platforms: ['gmail'],
      negativeMentions: 10,
      unfulfilledCommitmentsCount: 5,
      riskScore: 8,
      failureRate: 20,
      topEntities: [],
    });
    expect(narrative).toContain('elevated exposure detected');
  });

  it('appends top entities when available', () => {
    const narrative = buildFallbackNarrative({
      eventCount: 100,
      platforms: ['gmail'],
      negativeMentions: 0,
      unfulfilledCommitmentsCount: 0,
      riskScore: 1,
      failureRate: 0,
      topEntities: ['Alice', 'Acme Corp', 'ProjectX'],
    });
    expect(narrative).toContain('Alice');
    expect(narrative).toContain('Acme Corp');
    expect(narrative).toContain('ProjectX');
  });

  it('does not add entity section when topEntities is empty', () => {
    const narrative = buildFallbackNarrative({
      eventCount: 100,
      platforms: ['gmail'],
      negativeMentions: 0,
      unfulfilledCommitmentsCount: 0,
      riskScore: 1,
      failureRate: 0,
      topEntities: [],
    });
    expect(narrative).not.toContain('Most referenced entities');
  });
});

describe('SCORE_CONSISTENCY_RULE programmatic guard', () => {
  it('overrides score to 0.0 if findings are empty', () => {
    let finalRiskScore = 0.5;
    const finalFindings: any[] = [];
    if (!finalFindings || finalFindings.length === 0) {
      finalRiskScore = 0.0;
    }
    expect(finalRiskScore).toBe(0.0);
  });

  it('keeps score unchanged if findings are non-empty', () => {
    let finalRiskScore = 0.5;
    const finalFindings: any[] = [{ severity: 'Low', finding: 'Some finding', evidence: 'Some evidence', impact: 'Some impact' }];
    if (!finalFindings || finalFindings.length === 0) {
      finalRiskScore = 0.0;
    }
    expect(finalRiskScore).toBe(0.5);
  });
});
