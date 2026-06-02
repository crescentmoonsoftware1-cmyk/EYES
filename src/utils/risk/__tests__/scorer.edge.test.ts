import { describe, expect, it } from 'vitest';
import {
  scoreGmailEvent,
  scoreGithubEvent,
  scoreSlackEvent,
  scoreTwitterEvent,
  scoreLinearEvent,
} from '@/utils/risk/scorer';

describe('Risk Scorer — Score Clamping (max 100)', () => {
  it('never exceeds 100 even with many keyword hits', async () => {
    const result = await scoreGmailEvent({
      subject: 'password token secret credential 2fa otp api key private key ssn',
      snippet: 'password token secret credential 2fa otp api key private key ssn',
      from: 'attacker@malicious.corp',
    });
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('never goes below 0 for clean content', async () => {
    const result = await scoreGmailEvent({
      subject: 'Hello World',
      snippet: 'Great to connect!',
      from: 'friend@gmail.com',
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});

describe('Risk Scorer — Severity Thresholds', () => {
  it('returns LOW for score below 45', async () => {
    const result = await scoreSlackEvent({
      text: 'See you tomorrow!',
      channelName: 'random',
      user: 'user1',
    });
    expect(result.severity).toBe('LOW');
    expect(result.score).toBeLessThan(45);
  });

  it('returns HIGH for score ≥ 75', async () => {
    const result = await scoreGithubEvent({
      title: 'my-shell-infra',
      description: 'Contains passwords, tokens and credentials',
      stars: 700,
      forks: 100,
      language: 'Shell',
    });
    expect(result.severity).toBe('HIGH');
    expect(result.score).toBeGreaterThanOrEqual(75);
  });

  it('returns MEDIUM for score between 45 and 74', async () => {
    // External sender (10) + base (5) = 15, not enough.
    // With 2 keyword hits: 5 + 32 + 10 = 47 → MEDIUM
    const result = await scoreGmailEvent({
      subject: 'password reset',
      snippet: 'Your token has been refreshed',
      from: 'noreply@service.io',
    });
    expect(result.severity).toBe('MEDIUM');
    expect(result.score).toBeGreaterThanOrEqual(45);
    expect(result.score).toBeLessThan(75);
  });
});

describe('Risk Scorer — Reasons Array Population', () => {
  it('populates reasons when keywords are found', async () => {
    const result = await scoreGmailEvent({
      subject: 'Credential rotation required',
      snippet: 'Your 2fa is broken',
      from: 'security@corp.com',
    });
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons.some(r => r.includes('sensitive keyword'))).toBe(true);
  });

  it('includes exposure reason for external sender', async () => {
    const result = await scoreGmailEvent({
      subject: 'Hello',
      snippet: 'Just saying hi',
      from: 'partner@external.biz',
    });
    expect(result.reasons.some(r => r.toLowerCase().includes('external'))).toBe(true);
  });

  it('includes exposure reason for GitHub high-star repo', async () => {
    const result = await scoreGithubEvent({
      title: 'popular-repo',
      description: 'No sensitive content',
      stars: 600,
      forks: 5,
      language: 'JavaScript',
    });
    expect(result.reasons.some(r => r.includes('500+ stars'))).toBe(true);
  });
});

describe('Risk Scorer — Twitter reach amplification', () => {
  it('reach under 1000 does not add exposure score', async () => {
    const result = await scoreTwitterEvent({ text: 'Hello world', reach: 500 });
    // base 5 only (no sensitive keywords, reach < 1000)
    expect(result.score).toBe(5);
  });

  it('reach over 1000 adds 40 exposure points', async () => {
    const result = await scoreTwitterEvent({ text: 'Hello world', reach: 1001 });
    // 5 + 40 = 45 → MEDIUM, flagged
    expect(result.score).toBe(45);
    expect(result.flagged).toBe(true);
  });
});

describe('Risk Scorer — Linear security & urgency stacking', () => {
  it('security + urgent label stacks both exposure scores', async () => {
    const securityOnly = await scoreLinearEvent({
      title: 'vuln report',
      description: 'Auth bypass',
      label: 'security',
    });
    const both = await scoreLinearEvent({
      title: 'vuln report',
      description: 'Auth bypass',
      label: 'security and high priority',
    });
    // "security" and "high priority" both match — score should be higher
    expect(both.score).toBeGreaterThanOrEqual(securityOnly.score);
  });

  it('security label alone gives lower score than security+keywords', async () => {
    // The scorer checks label.includes('security') → +30 exposure.
    // "vulnerability" in the title does NOT add a keyword hit (not in sensitiveKeywords list).
    // 5 (base) + 30 (label) = 35 → LOW, not flagged.
    // With 'credential' in description: 5 + 30 + 16 = 51 → MEDIUM, flagged.
    const noKeyword = await scoreLinearEvent({
      title: 'SQL injection vulnerability found',
      description: 'Users can extract data',
      label: 'security',
    });
    const withKeyword = await scoreLinearEvent({
      title: 'SQL injection',
      description: 'Users can extract data using their credentials',
      label: 'security',
    });
    expect(withKeyword.score).toBeGreaterThan(noKeyword.score);
    expect(withKeyword.flagged).toBe(true);
    expect(noKeyword.flagged).toBe(false); // 35 < 45 threshold
  });
});
