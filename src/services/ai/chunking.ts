/**
 * AI Brain: Content Chunking Utility
 * 
 * This service handles splitting large blocks of text into smaller, 
 * deterministic chunks for more effective vector embedding and retrieval.
 * All chunks carry exact character spans for anchoring provenance.
 */

export interface ChunkInput {
  platform: string;
  eventType?: string | null;
  title?: string | null;
  content: string;
}

const MAX_CHUNK_SIZE = 1200; // Optimized for Gemini embedding-001 context window
const CHUNK_OVERLAP = 200;

export interface ChunkOutput {
  text: string;
  startIndex: number;
  endIndex: number;
}

/**
 * Splits event content into deterministic chunks for embedding.
 * Injects platform and title context into each chunk so the AI knows 
 * what it's looking at even in isolation.
 */
export function buildDeterministicChunks({
  platform,
  eventType,
  title,
  content,
}: ChunkInput): ChunkOutput[] {
  const cleanContent = content?.trim() || '';
  const header = `[Source: ${platform}] [Type: ${eventType}] Title: ${title}\n\n`;
  
  // If content is empty or very short, just return the header + content as one chunk
  if (header.length + cleanContent.length <= MAX_CHUNK_SIZE) {
    return [{ text: `${header}${cleanContent}`, startIndex: 0, endIndex: cleanContent.length }];
  }

  const chunks: ChunkOutput[] = [];
  let startIndex = 0;

  while (startIndex < cleanContent.length) {
    // Calculate how much content we can fit alongside the header
    const availableSpace = MAX_CHUNK_SIZE - header.length;
    let endIndex = startIndex + availableSpace;

    // Try to find a natural break point (newline or period) within the last 15% of the chunk
    if (endIndex < cleanContent.length) {
      const lookbackRange = Math.floor(availableSpace * 0.15);
      const searchSpace = cleanContent.slice(endIndex - lookbackRange, endIndex);
      
      const lastNewline = searchSpace.lastIndexOf('\n');
      const lastPeriod = searchSpace.lastIndexOf('. ');
      
      if (lastNewline !== -1) {
        endIndex = (endIndex - lookbackRange) + lastNewline + 1;
      } else if (lastPeriod !== -1) {
        endIndex = (endIndex - lookbackRange) + lastPeriod + 1;
      }
    }

    const chunkBody = cleanContent.slice(startIndex, endIndex).trim();
    if (chunkBody) {
      chunks.push({ text: `${header}${chunkBody}`, startIndex, endIndex });
    }

    // Move start index forward, but subtract overlap for continuity
    startIndex = endIndex - CHUNK_OVERLAP;
    
    // Safety check to ensure we're always moving forward
    if (startIndex < 0) startIndex = 0;
    if (endIndex >= cleanContent.length) break;
  }

  return chunks;
}
