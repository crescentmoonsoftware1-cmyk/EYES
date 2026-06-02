/**
 * Unit tests for pure helper functions in ActionQueueView.tsx
 *
 * These are pure functions that extract logic from the component —
 * they don't render anything, so no jsdom / React environment needed.
 */

import { describe, expect, it } from 'vitest';

// ─── Pure helpers (mirrors of functions in ActionQueueView.tsx) ───────────────

interface ActionItem {
  id: string;
  memory_id: string | null;
  source_id?: string | null;
  platform: string;
  title: string;
  description: string;
  suggested_action: string;
  action_type: string;
  method?: 'POST' | 'PATCH' | 'DELETE';
  confidence: number;
  status: string;
  extracted_at: string;
  startTime?: string;
  endTime?: string;
}

function getConversationalSummary(action: ActionItem) {
  const platformName =
    action.platform.toLowerCase() === 'gmail' ? 'an email' : `a ${action.platform} message`;
  let sender = 'Someone';

  const match = action.description?.match(/^([a-zA-Z0-9\s\-_]+)\s+asked:/i);
  if (match) {
    sender = match[1];
  } else if (action.description?.includes('asked:')) {
    sender = action.description.split('asked:')[0].trim();
  } else {
    sender = action.title.split(' ')[0] || 'A user';
  }

  let cleanDesc = action.description || '';
  if (cleanDesc.includes('Citations:')) {
    cleanDesc = cleanDesc.split('Citations:')[0].trim();
  }
  cleanDesc = cleanDesc.replace(/^.*asked:\s*/i, '').replace(/^"|"$/g, '').trim();
  if (!cleanDesc) {
    cleanDesc = action.title;
  }

  return { sender, platformName, cleanDesc };
}

function parseCitations(desc: string) {
  const citations: string[] = [];
  const lines = desc.split('\n');
  let inCitations = false;
  for (const line of lines) {
    if (line.toLowerCase().includes('citations:')) {
      inCitations = true;
      continue;
    }
    if (inCitations && line.trim().startsWith('-')) {
      citations.push(line.trim().slice(1).trim());
    }
  }
  return citations;
}

function getNativePlatformLink(action: ActionItem) {
  const platform = action.platform.toLowerCase();
  const sourceId = action.source_id;

  if (platform === 'gmail') {
    if (sourceId) return `https://mail.google.com/mail/u/0/#all/${sourceId}`;
    return `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(action.title)}`;
  }
  if (platform === 'slack') {
    return `https://slack.com/app_redirect?channel=${sourceId || 'general'}`;
  }
  if (platform === 'github') {
    if (sourceId) return `https://github.com/${sourceId}`;
    return 'https://github.com';
  }
  if (platform === 'linear') {
    if (sourceId) return `https://linear.app/issue/${sourceId}`;
    return 'https://linear.app';
  }
  return null;
}

// ─── Test Fixtures ─────────────────────────────────────────────────────────────

function makeAction(overrides: Partial<ActionItem> = {}): ActionItem {
  return {
    id: 'test-id',
    memory_id: null,
    source_id: null,
    platform: 'gmail',
    title: 'Quarterly Report Draft',
    description: 'Alice asked: Can you review the Q3 report?',
    suggested_action: 'Sure, I will review it by tomorrow.',
    action_type: 'EMAIL_REPLY',
    confidence: 85,
    status: 'pending',
    extracted_at: new Date().toISOString(),
    ...overrides,
  };
}

// ─── getConversationalSummary ──────────────────────────────────────────────────

describe('getConversationalSummary', () => {
  it('extracts sender from "Name asked:" pattern', () => {
    const action = makeAction({ description: 'Alice asked: Can you review the Q3 report?' });
    const { sender } = getConversationalSummary(action);
    expect(sender).toBe('Alice');
  });

  it('extracts sender using fallback to "asked:" split', () => {
    const action = makeAction({ description: 'Bob Smith 123 asked: When is the deadline?' });
    const { sender } = getConversationalSummary(action);
    expect(sender).toBe('Bob Smith 123');
  });

  it('falls back to first word of title when no "asked:" pattern found', () => {
    // When description has no "asked:" → sender = title.split(' ')[0]
    const action = makeAction({ description: 'Generic notification about meeting', title: 'Meeting Notice' });
    const { sender } = getConversationalSummary(action);
    expect(sender).toBe('Meeting'); // first word of title
  });

  it('uses "an email" as platformName for gmail', () => {
    const action = makeAction({ platform: 'gmail' });
    const { platformName } = getConversationalSummary(action);
    expect(platformName).toBe('an email');
  });

  it('uses "a <platform> message" for non-gmail platforms', () => {
    const action = makeAction({ platform: 'slack' });
    const { platformName } = getConversationalSummary(action);
    expect(platformName).toBe('a slack message');
  });

  it('strips Citations: section from cleanDesc', () => {
    const action = makeAction({
      description: 'Alice asked: Can you help?\nCitations:\n- Slack message 1\n- Email thread 2',
    });
    const { cleanDesc } = getConversationalSummary(action);
    expect(cleanDesc).not.toContain('Citations:');
    expect(cleanDesc).not.toContain('Slack message 1');
  });

  it('strips leading/trailing double quotes from cleanDesc', () => {
    const action = makeAction({ description: 'Alice asked: "Can you review the report?"' });
    const { cleanDesc } = getConversationalSummary(action);
    expect(cleanDesc).not.toMatch(/^"/);
    expect(cleanDesc).not.toMatch(/"$/);
  });

  it('falls back to title when cleaned description is empty', () => {
    const action = makeAction({ description: 'Alice asked:', title: 'Review Request' });
    const { cleanDesc } = getConversationalSummary(action);
    expect(cleanDesc).toBe('Review Request');
  });

  it('handles empty description gracefully', () => {
    const action = makeAction({ description: '', title: 'My Title' });
    const { sender, cleanDesc } = getConversationalSummary(action);
    expect(sender).toBe('My'); // first word of title
    expect(cleanDesc).toBe('My Title');
  });
});

// ─── parseCitations ────────────────────────────────────────────────────────────

describe('parseCitations', () => {
  it('parses citations listed after "Citations:" marker', () => {
    const desc = `Alice asked: Can you help?\nCitations:\n- Slack: weekly standup\n- Gmail: project kickoff`;
    const result = parseCitations(desc);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('Slack: weekly standup');
    expect(result[1]).toBe('Gmail: project kickoff');
  });

  it('returns empty array when no Citations: section exists', () => {
    const result = parseCitations('Simple action description without any citations');
    expect(result).toHaveLength(0);
  });

  it('is case-insensitive for the "citations:" marker', () => {
    const desc = `CITATIONS:\n- GitHub: PR review`;
    const result = parseCitations(desc);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('GitHub: PR review');
  });

  it('ignores lines that do not start with "-" after Citations:', () => {
    const desc = `Citations:\nThis is a header line\n- Valid citation\nAnother non-dash line`;
    const result = parseCitations(desc);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('Valid citation');
  });

  it('returns empty array for empty string', () => {
    expect(parseCitations('')).toHaveLength(0);
  });

  it('trims whitespace from extracted citations', () => {
    const desc = `Citations:\n-   Slack: channel message   `;
    const result = parseCitations(desc);
    expect(result[0]).toBe('Slack: channel message');
  });
});

// ─── getNativePlatformLink ────────────────────────────────────────────────────

describe('getNativePlatformLink', () => {
  it('returns direct Gmail link when sourceId is present', () => {
    const action = makeAction({ platform: 'gmail', source_id: 'abc123' });
    expect(getNativePlatformLink(action)).toBe(
      'https://mail.google.com/mail/u/0/#all/abc123'
    );
  });

  it('returns Gmail search link when sourceId is null', () => {
    const action = makeAction({ platform: 'gmail', source_id: null, title: 'Q3 Report Review' });
    const link = getNativePlatformLink(action);
    expect(link).toContain('https://mail.google.com/mail/u/0/#search/');
    expect(link).toContain(encodeURIComponent('Q3 Report Review'));
  });

  it('returns Slack channel redirect with sourceId', () => {
    const action = makeAction({ platform: 'slack', source_id: 'C0123456' });
    expect(getNativePlatformLink(action)).toBe(
      'https://slack.com/app_redirect?channel=C0123456'
    );
  });

  it('returns Slack redirect to general when sourceId is missing', () => {
    const action = makeAction({ platform: 'slack', source_id: null });
    expect(getNativePlatformLink(action)).toBe(
      'https://slack.com/app_redirect?channel=general'
    );
  });

  it('returns GitHub repo link when sourceId provided', () => {
    const action = makeAction({ platform: 'github', source_id: 'org/repo-name' });
    expect(getNativePlatformLink(action)).toBe('https://github.com/org/repo-name');
  });

  it('returns base GitHub URL when sourceId is missing', () => {
    const action = makeAction({ platform: 'github', source_id: null });
    expect(getNativePlatformLink(action)).toBe('https://github.com');
  });

  it('returns Linear issue link when sourceId provided', () => {
    const action = makeAction({ platform: 'linear', source_id: 'EYE-123' });
    expect(getNativePlatformLink(action)).toBe('https://linear.app/issue/EYE-123');
  });

  it('returns base Linear URL when sourceId is missing', () => {
    const action = makeAction({ platform: 'linear', source_id: null });
    expect(getNativePlatformLink(action)).toBe('https://linear.app');
  });

  it('returns null for unsupported platforms', () => {
    const action = makeAction({ platform: 'trello', source_id: 'board-123' });
    expect(getNativePlatformLink(action)).toBeNull();
  });

  it('is case-insensitive for platform matching', () => {
    const action = makeAction({ platform: 'GMAIL', source_id: 'msg-id' });
    expect(getNativePlatformLink(action)).toBe(
      'https://mail.google.com/mail/u/0/#all/msg-id'
    );
  });
});
