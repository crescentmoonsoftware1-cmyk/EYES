import { describe, expect, it } from 'vitest';

import { buildDeterministicChunks } from '@/services/ai/chunking';

describe('buildDeterministicChunks', () => {
  it('produces deterministic bounded chunks with source preface', () => {
    const content = Array.from(
      { length: 80 },
      (_, index) => `Sentence ${index + 1} covers reliability planning and execution.`
    ).join(' ');

    const input = {
      platform: 'gmail',
      eventType: 'email',
      title: 'Weekly Ops Digest',
      content,
    };

    const first = buildDeterministicChunks(input);
    const second = buildDeterministicChunks(input);

    expect(second).toEqual(first);
    expect(first.length).toBeGreaterThan(1);
    expect(first.length).toBeLessThanOrEqual(5);

    first.forEach((chunk) => {
      expect(chunk.text.startsWith('[Source: gmail] [Type: email] Title: Weekly Ops Digest\n\n')).toBe(true);
      expect(chunk.startIndex).toBeGreaterThanOrEqual(0);
      expect(chunk.endIndex).toBeGreaterThan(chunk.startIndex);
    });
  });

  it('returns a single fallback chunk when content is empty', () => {
    const chunks = buildDeterministicChunks({
      platform: 'notion',
      eventType: null,
      title: null,
      content: '    ',
    });
    expect(chunks.length).toBe(1);
    expect(chunks[0].text).toEqual('[Source: notion] [Type: null] Title: null\n\n');
    expect(chunks[0].startIndex).toBe(0);
    expect(chunks[0].endIndex).toBe(0);
  });
});
