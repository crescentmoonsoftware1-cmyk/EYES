import { SEEDED_PATTERNS, SeededPattern } from '../../config/seed_patterns';

/**
 * Represents the structured graph data extracted by the Chronic Layer (GLiNER/GLiREL).
 * This will eventually be queried directly from Neo4j.
 */
export interface UserGraphData {
  userId: string;
  entities: {
    projects: string[];
    commitments: string[];
    goals: string[];
    people: string[];
  };
  metrics: {
    commitmentsToOthersCompleted: number;
    commitmentsToOthersTotal: number;
    commitmentsToSelfCompleted: number;
    commitmentsToSelfTotal: number;
    projectsStarted: number;
    projectsShipped: number;
    researchMentions: number;
  };
  recentEdges: { head: string; label: string; tail: string }[];
}

export interface PatternMatchResult {
  pattern: SeededPattern;
  confidence: number; // 0.0 to 1.0
  evidence: string[]; // Specific graph nodes/edges that triggered this
}

/**
 * Signal Detection Engine
 * Evaluates the user's raw graph data against the Seeded Pattern Library to detect early life-shapes.
 */
export class PatternMatcher {
  
  /**
   * Evaluates the Cold Start patterns for a user based on their initial data sync.
   * @param graphData The raw entities and relations extracted from the user's first sync.
   * @returns An array of matched patterns with confidence scores.
   */
  public static evaluateColdStart(graphData: UserGraphData): PatternMatchResult[] {
    const matches: PatternMatchResult[] = [];

    // 1. Evaluate THE_LOOP (The Builder's Loop)
    if (graphData.metrics.projectsStarted >= 3 && graphData.metrics.projectsShipped === 0) {
      matches.push({
        pattern: SEEDED_PATTERNS.find(p => p.code === 'THE_LOOP')!,
        confidence: 0.85,
        evidence: [
          `Detected ${graphData.metrics.projectsStarted} started projects.`,
          `Detected 0 shipped/completed projects.`,
          `Projects: ${graphData.entities.projects.join(', ')}`
        ]
      });
    }

    // 2. Evaluate ORBIT (Executes for Others, Orbits Own Work)
    const otherCompletionRate = graphData.metrics.commitmentsToOthersTotal > 0 
      ? graphData.metrics.commitmentsToOthersCompleted / graphData.metrics.commitmentsToOthersTotal 
      : 0;
    
    const selfCompletionRate = graphData.metrics.commitmentsToSelfTotal > 0 
      ? graphData.metrics.commitmentsToSelfCompleted / graphData.metrics.commitmentsToSelfTotal 
      : 0;

    if (otherCompletionRate > 0.8 && selfCompletionRate < 0.3 && graphData.metrics.commitmentsToSelfTotal > 2) {
      matches.push({
        pattern: SEEDED_PATTERNS.find(p => p.code === 'ORBIT')!,
        confidence: 0.9,
        evidence: [
          `Completion rate for external commitments: ${(otherCompletionRate * 100).toFixed(0)}%`,
          `Completion rate for internal/self commitments: ${(selfCompletionRate * 100).toFixed(0)}%`
        ]
      });
    }

    // 3. Evaluate AVOIDANCE (Avoidance-via-Research)
    if (graphData.metrics.researchMentions > 10 && selfCompletionRate < 0.3) {
       matches.push({
        pattern: SEEDED_PATTERNS.find(p => p.code === 'AVOIDANCE')!,
        confidence: 0.75,
        evidence: [
          `High volume of research/learning mentions (${graphData.metrics.researchMentions}).`,
          `Co-occurring with stalled self-directed commitments.`
        ]
      });
    }

    // (Additional pattern detection logic will be wired here as the graph schema expands)

    return matches;
  }

  /**
   * The Confirms / Disconfirms Loop (Pending Phase 2 Graph DB)
   * This will be called periodically to re-evaluate prior hypotheses against new data.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public static validateOngoingPatterns(userId: string, currentMatches: PatternMatchResult[], newGraphData: UserGraphData) {
    // TODO: Implement temporal drift analysis and edge invalidation.
    // This requires the Neo4j temporal graph to be active.
    throw new Error("validateOngoingPatterns requires active Graph DB connection.");
  }
}
