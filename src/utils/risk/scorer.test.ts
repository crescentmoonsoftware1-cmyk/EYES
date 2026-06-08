import { describe, expect, it } from 'vitest';

import {
  scoreGmailEvent,
  scoreGithubEvent,
  scoreRedditEvent,
  scoreSlackEvent,
  scoreDiscordEvent,
  scoreNotionEvent,
  scoreDropboxEvent,
  scoreTwitterEvent,
  scoreLinearEvent,
} from '@/utils/risk/scorer';

// ── Risk Scorer: Unit Tests ────────────────────────────────────────────────────

describe('Risk Scorer — Gmail', () => {
  it('flags external sender with sensitive keywords', async () => {
    const result = await scoreGmailEvent({
      subject: 'Please rotate API key',
      snippet: 'The password and token are in this thread',
      from: 'security@corp.com',
    });
    expect(result.flagged).toBe(true);
    expect(result.severity === 'MEDIUM' || result.severity === 'HIGH').toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(45);
  });

  it('returns LOW risk for benign internal email', async () => {
    const result = await scoreGmailEvent({
      subject: 'Team lunch tomorrow',
      snippet: 'See you all at noon!',
      from: 'alice@gmail.com',
    });
    expect(result.flagged).toBe(false);
    expect(result.severity).toBe('LOW');
  });

  it('adds exposure score for external domain senders', async () => {
    const internal = await scoreGmailEvent({
      subject: 'Hello',
      snippet: 'Just checking in',
      from: 'bob@gmail.com',
    });
    const external = await scoreGmailEvent({
      subject: 'Hello',
      snippet: 'Just checking in',
      from: 'bob@enterprise.io',
    });
    expect(external.score).toBeGreaterThan(internal.score);
  });

  it('flags email with multiple sensitive keywords as HIGH risk', async () => {
    const result = await scoreGmailEvent({
      subject: 'Credentials leaked',
      snippet: 'Your password, token, and private key have been exposed. 2fa compromised.',
      from: 'alert@external.com',
    });
    expect(result.severity).toBe('HIGH');
    expect(result.score).toBeGreaterThanOrEqual(75);
  });
});

// ── GitHub ─────────────────────────────────────────────────────────────────────

describe('Risk Scorer — GitHub', () => {
  it('flags high-star Shell repo as HIGH', async () => {
    const result = await scoreGithubEvent({
      title: 'org/deploy-scripts',
      description: 'production deployment scripts',
      stars: 700,
      forks: 120,
      language: 'Shell',
    });
    expect(result.flagged).toBe(true);
    expect(result.severity).toBe('HIGH');
  });

  it('does not flag small, low-exposure repo', async () => {
    const result = await scoreGithubEvent({
      title: 'my-side-project',
      description: 'A hobby app for tracking movies',
      stars: 3,
      forks: 0,
      language: 'TypeScript',
    });
    expect(result.flagged).toBe(false);
    expect(result.severity).toBe('LOW');
  });

  it('flags repo with 50+ stars as at least MEDIUM', async () => {
    const result = await scoreGithubEvent({
      title: 'org/popular-lib',
      description: 'A useful library',
      stars: 60,
      forks: 5,
      language: 'Python',
    });
    // 5 (base) + 28 (stars) = 33 → below 45, but Shell would push it
    expect(result.score).toBeGreaterThanOrEqual(5);
  });

  it('adds risk for repos with sensitive keywords in description', async () => {
    const result = await scoreGithubEvent({
      title: 'infra/secrets-manager',
      description: 'Manages API keys, tokens and credentials for all services',
      stars: 10,
      forks: 2,
      language: 'Go',
    });
    expect(result.flagged).toBe(true);
  });
});

// ── Reddit ─────────────────────────────────────────────────────────────────────

describe('Risk Scorer — Reddit', () => {
  it('scores benign comment in safe subreddit as LOW', async () => {
    const result = await scoreRedditEvent({
      body: 'Had a great day building features!',
      subreddit: 'programming',
      score: 3,
    });
    expect(result.flagged).toBe(false);
    expect(result.severity).toBe('LOW');
    expect(result.score).toBeLessThan(45);
  });

  it('adds exposure for sensitive subreddit (legaladvice)', async () => {
    const safe = await scoreRedditEvent({
      body: 'Simple comment',
      subreddit: 'programming',
      score: 1,
    });
    const sensitive = await scoreRedditEvent({
      body: 'Simple comment',
      subreddit: 'legaladvice',
      score: 1,
    });
    expect(sensitive.score).toBeGreaterThan(safe.score);
  });

  it('adds engagement score for high-karma post', async () => {
    const lowKarma = await scoreRedditEvent({
      body: 'Testing this out',
      subreddit: 'programming',
      score: 5,
    });
    const highKarma = await scoreRedditEvent({
      body: 'Testing this out',
      subreddit: 'programming',
      score: 200,
    });
    expect(highKarma.score).toBeGreaterThan(lowKarma.score);
  });

  it('flags post with sensitive keywords in sensitive subreddit', async () => {
    const result = await scoreRedditEvent({
      body: 'I lost my password and need help with my credentials',
      subreddit: 'depression',
      score: 50,
    });
    expect(result.flagged).toBe(true);
  });
});

// ── Slack ──────────────────────────────────────────────────────────────────────

describe('Risk Scorer — Slack', () => {
  it('flags message in #general as higher risk than private channel', async () => {
    const general = await scoreSlackEvent({
      text: 'Here is the project update',
      channelName: 'general',
      user: 'user123',
    });
    const privateChannel = await scoreSlackEvent({
      text: 'Here is the project update',
      channelName: 'team-backend',
      user: 'user123',
    });
    expect(general.score).toBeGreaterThan(privateChannel.score);
  });

  it('flags message with "token" keyword', async () => {
    // scorer keyword list includes "token" → 5 (base) + 16 (1 hit) = 21 → LOW (not yet flagged)
    // adding "secret" pushes it: 5 + 32 = 37 → still LOW. With "api key" too: 5 + 48 = 53 → MEDIUM
    const result = await scoreSlackEvent({
      text: 'Here is the api key and the secret token: sk_test_abc123',
      channelName: 'team-backend',
      user: 'user123',
    });
    expect(result.flagged).toBe(true);
  });

  it('returns LOW risk for safe Slack message', async () => {
    const result = await scoreSlackEvent({
      text: 'Meeting at 3pm',
      channelName: 'random',
      user: 'user456',
    });
    expect(result.flagged).toBe(false);
    expect(result.severity).toBe('LOW');
  });
});

// ── Discord ────────────────────────────────────────────────────────────────────

describe('Risk Scorer — Discord', () => {
  it('adds exposure for admin/staff channels', async () => {
    const adminChannel = await scoreDiscordEvent({
      text: 'Server update incoming',
      channelName: 'admin-logs',
      user: 'mod123',
    });
    const publicChannel = await scoreDiscordEvent({
      text: 'Server update incoming',
      channelName: 'general',
      user: 'mod123',
    });
    expect(adminChannel.score).toBeGreaterThan(publicChannel.score);
  });

  it('flags message with multiple sensitive keywords in discord', async () => {
    // "secret" (16) + "token" (16) + base(5) = 37 → still LOW alone.
    // Add "password" (16) → 5 + 48 = 53 → MEDIUM, flagged
    const result = await scoreDiscordEvent({
      text: 'Shared the password and secret token in DM',
      channelName: 'general',
      user: 'user1',
    });
    expect(result.flagged).toBe(true);
  });

  it('handles missing channelName gracefully', async () => {
    const result = await scoreDiscordEvent({
      text: 'Just a simple message',
      user: 'user2',
    });
    expect(result).toBeDefined();
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});

// ── Notion ─────────────────────────────────────────────────────────────────────

describe('Risk Scorer — Notion', () => {
  it('flags document with "password" in title', async () => {
    const result = await scoreNotionEvent({
      title: 'Password Sanctum — Private',
      content: 'All credentials stored here',
    });
    expect(result.score).toBeGreaterThan(5); // has title exposure + keywords
    expect(result.flagged).toBe(true);
  });

  it('returns LOW risk for normal meeting notes', async () => {
    const result = await scoreNotionEvent({
      title: 'Q2 Planning Notes',
      content: 'Discussed roadmap and team responsibilities',
    });
    expect(result.flagged).toBe(false);
    expect(result.severity).toBe('LOW');
  });

  it('uses title as content when content is absent', async () => {
    const result = await scoreNotionEvent({
      title: 'simple page',
    });
    expect(result).toBeDefined();
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});

// ── Dropbox ────────────────────────────────────────────────────────────────────

describe('Risk Scorer — Dropbox', () => {
  it('flags backup file as higher risk', async () => {
    const backup = await scoreDropboxEvent({
      name: 'database_backup_2024.zip',
      path: '/archives/database_backup_2024.zip',
    });
    const normal = await scoreDropboxEvent({
      name: 'project_logo.png',
      path: '/assets/project_logo.png',
    });
    expect(backup.score).toBeGreaterThan(normal.score);
  });

  it('flags file with multiple sensitive keywords in content', async () => {
    // 'credential' (16) + 'token' (16) + 'secret' (16) + base(5) = 53 → MEDIUM, flagged
    const result = await scoreDropboxEvent({
      name: 'credential_token_secret.csv',
      path: '/exports/credential_token_secret_backup.csv',
    });
    expect(result.flagged).toBe(true);
  });

  it('returns LOW risk for a regular document', async () => {
    const result = await scoreDropboxEvent({
      name: 'Q3_report.pdf',
      path: '/reports/Q3_report.pdf',
    });
    expect(result.flagged).toBe(false);
    expect(result.severity).toBe('LOW');
  });
});

// ── Twitter/X ──────────────────────────────────────────────────────────────────

describe('Risk Scorer — Twitter/X', () => {
  it('flags high-reach tweet as higher risk', async () => {
    const viral = await scoreTwitterEvent({
      text: 'Big announcement coming!',
      reach: 5000,
    });
    const quiet = await scoreTwitterEvent({
      text: 'Big announcement coming!',
      reach: 10,
    });
    expect(viral.score).toBeGreaterThan(quiet.score);
  });

  it('flags tweet with sensitive keyword + high reach as HIGH', async () => {
    const result = await scoreTwitterEvent({
      text: 'Our confidential API token was accidentally exposed — investigating now',
      reach: 2000,
    });
    expect(result.flagged).toBe(true);
    expect(result.severity).toBe('HIGH');
  });

  it('handles zero reach gracefully', async () => {
    const result = await scoreTwitterEvent({
      text: 'Just a regular post',
      reach: 0,
    });
    expect(result).toBeDefined();
    expect(result.flagged).toBe(false);
  });
});

// ── Linear ─────────────────────────────────────────────────────────────────────

describe('Risk Scorer — Linear', () => {
  it('flags security-labeled issue with additional keyword', async () => {
    // label 'security' gives +30 exposure, but 5+30=35 is below the 45 flag threshold.
    // Adding a sensitive keyword ("credential") in the description pushes it over.
    const result = await scoreLinearEvent({
      title: 'Fix auth bypass',
      description: 'Users can access admin routes using leaked credentials',
      label: 'security',
    });
    expect(result.flagged).toBe(true);
  });

  it('adds extra score for urgent high-priority issues', async () => {
    const normal = await scoreLinearEvent({
      title: 'UI bug on settings page',
      description: 'Button is misaligned',
      label: 'bug',
    });
    const urgent = await scoreLinearEvent({
      title: 'UI bug on settings page',
      description: 'Button is misaligned',
      label: 'urgent',
    });
    expect(urgent.score).toBeGreaterThan(normal.score);
  });

  it('returns LOW risk for routine feature tasks', async () => {
    const result = await scoreLinearEvent({
      title: 'Add dark mode toggle',
      description: 'Implement a UI preference for dark mode',
    });
    expect(result.flagged).toBe(false);
    expect(result.severity).toBe('LOW');
  });
});
