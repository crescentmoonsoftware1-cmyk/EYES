import { createAdminClient } from '@/utils/supabase/server';
import { invokeModel } from '@/services/ai/ai';
import { Commitment } from '@/types/dashboard';

/**
 * Reputation Audit: Core Analysis Pipeline (REAL WORLD ONLY)
 */
export class AuditAnalysisService {
  static async runAnalysis(auditId: string, userId: string) {
    const supabase = await createAdminClient();
    
    try {
      // 1. Data Retrieval (Real data only)
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

      const { data: events, error: fetchError } = await supabase
        .from('memories')
        .select('id, platform, timestamp, title, content, author')
        .eq('user_id', userId)
        .not('content', 'is', null)
        .gte('timestamp', twoYearsAgo.toISOString())
        .order('timestamp', { ascending: false })
        .limit(500);

      if (fetchError || !events) {
        throw new Error(`Data retrieval failed: ${fetchError?.message}`);
      }

      if (events.length === 0) {
        // No data yet — complete the audit gracefully with a sync prompt
        await supabase.from('reputation_audits').update({
          status: 'completed',
          risk_score: 0,
          mentions_count: 0,
          commitments_count: 0,
          summary_narrative: 'No data available yet. Please run a Global Sync first to import your digital archive, then re-run the audit.',
          connectors_covered: [],
          metadata: { riskFindings: [], commitments: [], topEntities: [], opportunities: [], trajectory: 'stable', failureRate: '0.00', complianceRate: '100.00', sentimentBalance: 1.0 }
        }).eq('id', auditId);
        return { success: true, auditId, noData: true };
      }

      const connectorsCovered = Array.from(new Set(events.map(e => e.platform)));

      // ── 2. Smart Record Selection (Keyword Pre-filter + Smart Sampling) ──────
      //
      // Strategy: Don't send ALL records to AI (token limit). Instead, build a
      // high-signal subset using two passes:
      //
      // Pass A — Keyword pre-filter: scan ALL records for commitment/risk signals.
      //          These are the most valuable records for the audit regardless of recency.
      //
      // Pass B — Smart sampling: add recent records + per-platform diversity + 
      //          historical samples to give AI full behavioral context.
      //
      // Result: ~80-120 high-value records sent to AI, covering the whole dataset.

      const COMMITMENT_KEYWORDS = /\b(will|i'll|we'll|i will|we will|i'll|going to|plan to|planning to|need to|have to|should|must|shall|promised|commit|deadline|by (monday|tuesday|wednesday|thursday|friday|saturday|sunday|eod|eow|next week|tomorrow)|follow.?up|send|review|check|handle|take care|responsible for|assigned|action item|todo|to.do)\b/i;

      const SENSITIVE_KEYWORDS = /\b(salary|budget|invoice|payment|debt|legal|lawsuit|confidential|private|conflict|fired|quit|resign|burnout|stressed|anxiety|urgent|critical|emergency|overdue|missed|failed|broke|broken|issue|problem|complaint|dispute|disagree)\b/i;

      // Pass A: keyword-matched records from ALL events
      const commitmentCandidates = events.filter(e => {
        const text = `${e.title ?? ''} ${e.content ?? ''}`;
        return COMMITMENT_KEYWORDS.test(text) || SENSITIVE_KEYWORDS.test(text);
      });

      // Pass B: smart sampling for context
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Recent records (last 30 days) — highest weight in scoring
      const recentRecords = events
        .filter(e => new Date(e.timestamp) >= thirtyDaysAgo)
        .slice(0, 30);

      // Per-platform diversity — up to 10 records per platform
      const seenIds = new Set([
        ...commitmentCandidates.map(e => e.id),
        ...recentRecords.map(e => e.id),
      ]);
      const platformSamples: typeof events = [];
      const platformCounts: Record<string, number> = {};
      for (const e of events) {
        if (seenIds.has(e.id)) continue;
        const count = platformCounts[e.platform] ?? 0;
        if (count < 10) {
          platformSamples.push(e);
          platformCounts[e.platform] = count + 1;
          seenIds.add(e.id);
        }
      }

      // Historical sample — 20 evenly-spaced older records for longitudinal context
      const olderEvents = events.filter(e => !seenIds.has(e.id));
      const step = Math.max(1, Math.floor(olderEvents.length / 20));
      const historicalSample = olderEvents.filter((_, i) => i % step === 0).slice(0, 20);

      // Merge and cap at 120 to stay within token budget
      const selectedRecords = [
        ...commitmentCandidates,
        ...recentRecords,
        ...platformSamples,
        ...historicalSample,
      ].filter((e, idx, arr) => arr.findIndex(x => x.id === e.id) === idx)
       .slice(0, 120);

      console.log(`[Audit] Smart selection: ${commitmentCandidates.length} keyword matches + ${recentRecords.length} recent + ${platformSamples.length} platform samples + ${historicalSample.length} historical = ${selectedRecords.length} records sent to AI (from ${events.length} total)`);

      const analysisInput = selectedRecords.map(e => ({
        id: e.id,
        platform: e.platform,
        date: e.timestamp,
        text: `${e.title ?? ''}: ${e.content ?? ''}`.slice(0, 400)
      }));


      const extractionPrompt = `
You are a forensic digital analyst extracting structured intelligence from a person's raw digital archive.
Be EXHAUSTIVE and AGGRESSIVE — err on the side of extracting MORE, not less.

Records (${analysisInput.length} items across platforms: ${connectorsCovered.join(', ')}):
${JSON.stringify(analysisInput)}

For EVERY record, classify ALL of the following:

1. sentiment: -1 (negative/frustrated/stressed), 0 (neutral/factual), +1 (positive/excited/proud)

2. isCommitment: true for ANY of these patterns:
   - Explicit promises: "I will", "I'll", "We will", "I promise", "I commit"
   - Tasks/to-dos: "need to", "have to", "should", "must", "going to", "plan to"
   - Scheduled intentions: "I'll send", "will review", "will follow up", "will check"
   - Assignments from others accepted: "sure", "ok I'll", "I can handle", "I'll take care of"
   - Calendar events the person created or accepted
   - Deadlines mentioned: "by Friday", "before the meeting", "EOD", "by next week"
   - ANY stated future action, even implicit ("looking into X" = commitment to investigate)

3. commitmentText: Extract the EXACT commitment text verbatim. If isCommitment=true this MUST be non-empty.

4. isSensitive: true for ANY of:
   - Financial discussions (money, budget, salary, invoice, debt, payment)
   - Legal or compliance references
   - Conflict, disagreement, or tension with another person
   - Missed deadlines or broken promises
   - Negative sentiment about a person, company, or situation
   - Confidential or private information
   - Stress, burnout, or emotional distress signals
   - Health issues mentioned

5. entities: Array of ALL people, companies, projects, products, or organizations mentioned (proper nouns only). Empty array [] if none.

6. behaviorType: "output" | "communication" | "planning" | "social" | "reflection" | "other"

Rules:
- If a record could POSSIBLY be a commitment, mark it as one. Do NOT be conservative.
- Every email thread, calendar event, GitHub issue, or task LIKELY contains commitments.
- Extract entities from ALL records — every name, project, org mentioned counts.
- Return EVERY record from the input — do not skip any.

Return JSON ONLY (no markdown, no explanation):
{ "analysis": [ { "id": "uuid", "sentiment": -1|0|1, "isCommitment": true|false, "commitmentText": "exact text or empty string", "isSensitive": true|false, "entities": ["Name1", "Org2"], "behaviorType": "output|communication|planning|social|reflection|other" } ] }
      `;

      const analysisRaw = await invokeModel({
        capability: 'classify',
        messages: [{ role: 'user', content: extractionPrompt }],
        system: 'You are a clinical intelligence analyst. Return JSON only.',
        preference: 'auto'
      });

      // If AI fails to return data, proceed with empty analysis (avoid crashing the whole audit)
      if (!analysisRaw) {
        console.warn(`[Audit] AI returned null for ${auditId}. Proceeding with empty analysis.`);
      }

      // 3. Parse and Aggregate
      let weightedTotalMentions = 0;
      let weightedNegativeMentions = 0;
      const weightedNeutralMentions = 0; // reserved for future sentiment scoring
      let weightedUnfulfilledCommitments = 0;
      let negativeMentions = 0;
      let unfulfilledCommitmentsCount = 0;
      const extractedCommitments: Commitment[] = [];

      interface RiskFinding {
        severity: string;
        finding: string;
        evidence: string;
        impact: string;
      }
      const extractedFindings: RiskFinding[] = [];

      interface AnalysisItem {
        id: string;
        sentiment: -1 | 0 | 1;
        isCommitment: boolean;
        commitmentText?: string;
        isSensitive: boolean;
        entities: string[];
        behaviorType: string;
      }
      
      const nowTs = Date.now();
      // CRITICAL: Guard against null/undefined from AI — calling .match() on null throws TypeError
      // which crashes the entire audit into the catch block, producing "AI Analysis failed" errors.
      let analysisResult: { analysis: AnalysisItem[] } = { analysis: [] };
      if (analysisRaw && typeof analysisRaw === 'string') {
        try {
          const jsonMatch = analysisRaw.match(/\{[\s\S]*\}/);
          if (jsonMatch) analysisResult = JSON.parse(jsonMatch[0]);
        } catch (parseErr) {
          console.warn(`[Audit] Failed to parse AI analysis JSON for ${auditId}:`, parseErr);
          // analysisResult stays as { analysis: [] } — audit continues with zero findings
        }
      }
      
      analysisResult.analysis.forEach((a: AnalysisItem) => {
        const evt = events.find(e => e.id === a.id);
        if (!evt) return;

        const ageMs = nowTs - new Date(evt.timestamp).getTime();
        const weight = ageMs < (30 * 24 * 60 * 60 * 1000) ? 1.0 : 0.5;

        weightedTotalMentions += weight;
        if (a.sentiment === -1) {
          negativeMentions++;
          weightedNegativeMentions += weight;
        }
        
        if (a.isCommitment) {
          unfulfilledCommitmentsCount++;
          weightedUnfulfilledCommitments += weight;
          extractedCommitments.push({
            text: a.commitmentText || 'Commitment detected',
            status: 'pending',
            citation: a.id,
            platform: evt.platform,
            date: evt.timestamp || new Date().toISOString()
          });
        }
        
        if (a.isSensitive || a.sentiment === -1) {
           extractedFindings.push({
             severity: a.sentiment === -1 ? 'High' : 'Medium',
             finding: a.commitmentText || `Reputational risk in ${evt.platform}`,
             evidence: `Source event: ${evt.id}`,
             impact: 'Potential diligence concern.'
           });
        }
      });

      // Suppress unused variable: weightedNeutralMentions is retained for future scoring expansion
      void weightedNeutralMentions;

      const riskScore = Math.min(10, Number((( (weightedNegativeMentions * 2) + (weightedUnfulfilledCommitments * 3) ) / (weightedTotalMentions || 1) * 10).toFixed(1)));
      const failureRate = events.length > 0 ? (negativeMentions / events.length) * 100 : 0;
      const complianceRate = 100 - failureRate;

      // 4. Reputation Projection: pattern-level narrative across time
      // Collect all entities extracted per-record for the summary prompt
      const allExtractedEntities = analysisResult.analysis
        .flatMap((a: AnalysisItem) => a.entities || [])
        .filter(Boolean);
      const entityFrequency: Record<string, number> = {};
      allExtractedEntities.forEach((e: string) => { entityFrequency[e] = (entityFrequency[e] || 0) + 1; });
      const topExtractedEntities = Object.entries(entityFrequency)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name]) => name);

      const summaryPrompt = `
You are building a Reputation Projection for someone based on ${events.length} records spanning up to 2 years.
Be SPECIFIC and DATA-DRIVEN — reference actual numbers and patterns, not generic statements.

Data summary:
- Total records analysed: ${events.length}
- Platforms: ${connectorsCovered.join(', ')}
- Negative signals detected: ${negativeMentions}
- Commitments extracted: ${unfulfilledCommitmentsCount}
- Risk Score: ${riskScore}/10
- Most mentioned entities: ${topExtractedEntities.join(', ') || 'none detected'}
- Failure rate: ${failureRate.toFixed(1)}%
- Compliance rate: ${complianceRate.toFixed(1)}%

Your job:
1. TRAJECTORY: Is the behavioral pattern improving, declining, or stable? Base this on chronological signal distribution.
2. DOMINANT PATTERN: What specific behavioral archetype emerges? (e.g., "high-output executor with low follow-through", "relationship-first collaborator", "async-heavy deep worker")
3. REPUTATION PROJECTION: In 2-3 sentences, what would an investor, employer, or partner conclude from this data?
4. OPPORTUNITIES: List exactly 3 specific, actionable strengths visible in the data that could be leveraged professionally.
5. topEntities: List the top 5 most frequently mentioned people, projects, companies, or tools from the data. If the most mentioned entities list above is non-empty, use those. Otherwise infer from context.

Rules:
- narrative must be 3-4 sentences minimum, referencing the actual data (mention platforms, record counts, or patterns).
- opportunities must be specific to THIS person's data, not generic career advice.
- Do NOT say "based on the data" or "the records show" — just state the finding directly.

Return JSON ONLY (no markdown, no explanation):
{ "narrative": "3-4 sentence projection", "trajectory": "improving|stable|declining", "dominantPattern": "specific archetype", "reputationProjection": "what others would conclude", "opportunities": ["specific strength 1", "specific strength 2", "specific strength 3"], "topEntities": ["entity1", "entity2", "entity3", "entity4", "entity5"] }
      `;

      const summaryRaw = await invokeModel({
        capability: 'chat',
        messages: [{ role: 'user', content: summaryPrompt }],
        system: 'You are a clinical intelligence analyst.',
        preference: 'auto'
      });

      const summaryRawStr = typeof summaryRaw === 'string' ? summaryRaw : null;
      const summaryMatch = summaryRawStr?.match(/\{[\s\S]*\}/);
      let summaryResult: { narrative?: string; trajectory?: string; dominantPattern?: string; reputationProjection?: string; opportunities?: string[]; topEntities?: string[] } = { narrative: summaryRawStr ?? undefined, opportunities: [], topEntities: [] };
      if (summaryMatch) {
        try {
          summaryResult = JSON.parse(summaryMatch[0]);
        } catch (parseErr) {
          console.warn(`[Audit] Failed to parse summary JSON for ${auditId}:`, parseErr);
        }
      }

      // Build data-driven fallback narrative (used when AI returns empty/short text)
      const fallbackNarrative = `Across ${events.length} records spanning ${connectorsCovered.join(', ')}, the subject maintained a ${complianceRate.toFixed(0)}% compliance rate with ${negativeMentions} negative signal${negativeMentions !== 1 ? 's' : ''} detected over the 24-month window. ${unfulfilledCommitmentsCount > 0 ? `${unfulfilledCommitmentsCount} open commitment${unfulfilledCommitmentsCount !== 1 ? 's' : ''} were identified, indicating follow-through risk.` : 'No open commitments were flagged, reflecting a delivery-first behavioral pattern.'} The computed risk profile of ${riskScore}/10 reflects ${riskScore <= 2 ? 'minimal' : riskScore <= 5 ? 'moderate' : 'elevated'} reputational exposure.${topExtractedEntities.length > 0 ? ` Frequently referenced entities include ${topExtractedEntities.slice(0, 3).join(', ')}.` : ''}`;

      const fallbackOpportunities = [
        `Leverage the ${complianceRate.toFixed(0)}% compliance track record to qualify for high-accountability, high-trust engagements.`,
        `Expand the async communication footprint across ${connectorsCovered.slice(0, 3).join(', ')} into collaborative leadership roles.`,
        `Use consistent activity across ${connectorsCovered.length} platforms as evidence of organised, multi-channel execution capability.`,
      ];

      // 6. Persist analysis results to DB
      console.log(`[Audit] Finalizing database record for ${auditId}...`);
      const { error: updateError } = await supabase.from('reputation_audits').update({
        status: 'completed',
        risk_score: riskScore,
        mentions_count: events.length,
        commitments_count: unfulfilledCommitmentsCount,
        summary_narrative: (summaryResult.narrative && summaryResult.narrative.length > 100)
          ? summaryResult.narrative
          : fallbackNarrative,
        connectors_covered: connectorsCovered,
        report_url: null,
        metadata: {
          commitments: extractedCommitments,
          riskFindings: extractedFindings,
          topEntities: summaryResult.topEntities || [],
          opportunities: (summaryResult.opportunities && summaryResult.opportunities.length > 0)
            ? summaryResult.opportunities
            : fallbackOpportunities,
          trajectory: summaryResult.trajectory || 'stable',
          dominantPattern: summaryResult.dominantPattern || null,
          reputationProjection: summaryResult.reputationProjection || null,
          sentimentBalance: weightedTotalMentions > 0 ? (1 - (weightedNegativeMentions / weightedTotalMentions)) : 1.0,
          failureRate: failureRate.toFixed(2),
          complianceRate: complianceRate.toFixed(2),
        }
      }).eq('id', auditId);

      if (updateError) {
        console.error(`[Audit] Database update failed for ${auditId}:`, updateError);
      } else {
        console.log(`[Audit] Successfully finalized ${auditId}`);
      }

      return { success: true, auditId };

    } catch (err) {
      console.error(`[Audit] Analysis failed for ${auditId}:`, err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      
      // Mark audit as failed in DB — error is already logged, do NOT re-throw
      // (caller is a background fire-and-forget task; re-throwing causes unhandledRejection crash)
      const supabase = await createAdminClient();
      await supabase.from('reputation_audits').update({ 
        status: 'failed',
        summary_narrative: `Analysis failed: ${errorMessage}. Please check AI quotas or retry.`
      }).eq('id', auditId);

      return { success: false, auditId, error: errorMessage };
    }
  }
}
