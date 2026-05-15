import { createClient, createAdminClient } from '@/utils/supabase/server';
import { invokeModel } from '@/services/ai/ai';
import { Commitment, ReputationAudit } from '@/types/dashboard';

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
      
      // 2. Real Claude Analysis (Optimized chunking)
      const significantRecords = events.slice(0, 40);
      const analysisInput = significantRecords.map(e => ({
        id: e.id,
        date: e.timestamp,
        text: `${e.title ?? ''}: ${e.content}`.slice(0, 300)
      }));

      const extractionPrompt = `
You are analyzing a person's complete digital archive to build a Reputation Projection — not a one-time snapshot, but a pattern-level read across time.

Records (${analysisInput.length} total, spanning up to 2 years):
${JSON.stringify(analysisInput)}

For EACH record, extract:
- sentiment: -1 (negative), 0 (neutral), +1 (positive)
- isCommitment: true if this is a promise, task, or stated intention
- commitmentText: the specific commitment if isCommitment is true
- isSensitive: true if this could be a reputational risk
- behaviorType: one of ["output", "communication", "planning", "social", "reflection", "other"]

Return JSON ONLY:
{ "analysis": [ { "id": "uuid", "sentiment": -1|0|1, "isCommitment": true|false, "commitmentText": "...", "isSensitive": true|false, "behaviorType": "output|communication|planning|social|reflection|other" } ] }
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
      let weightedNeutralMentions = 0;
      let weightedUnfulfilledCommitments = 0;
      let negativeMentions = 0;
      let unfulfilledCommitmentsCount = 0;
      const extractedCommitments: Commitment[] = [];
      const extractedFindings: any[] = [];
      
      const nowTs = Date.now();
      // CRITICAL: Guard against null/undefined from AI — calling .match() on null throws TypeError
      // which crashes the entire audit into the catch block, producing "AI Analysis failed" errors.
      let analysisResult: { analysis: any[] } = { analysis: [] };
      if (analysisRaw) {
        try {
          const jsonMatch = analysisRaw.match(/\{[\s\S]*\}/);
          if (jsonMatch) analysisResult = JSON.parse(jsonMatch[0]);
        } catch (parseErr) {
          console.warn(`[Audit] Failed to parse AI analysis JSON for ${auditId}:`, parseErr);
          // analysisResult stays as { analysis: [] } — audit continues with zero findings
        }
      }
      
      analysisResult.analysis.forEach((a: any) => {
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

      const riskScore = Math.min(10, Number((( (weightedNegativeMentions * 2) + (weightedUnfulfilledCommitments * 3) ) / (weightedTotalMentions || 1) * 10).toFixed(1)));
      const failureRate = events.length > 0 ? (negativeMentions / events.length) * 100 : 0;
      const complianceRate = 100 - failureRate;

      // 4. Reputation Projection: pattern-level narrative across time
      const summaryPrompt = `
You are building a Reputation Projection for someone based on ${events.length} records spanning up to 2 years.

Data summary:
- Total records: ${events.length}
- Negative signals: ${negativeMentions}
- Unfulfilled commitments: ${unfulfilledCommitmentsCount}
- Risk Score: ${riskScore}/10
- Platforms covered: ${connectorsCovered.join(', ')}

Your job is to answer 4 questions about this person's pattern across time:
1. TRAJECTORY: Is the pattern improving, declining, or stable over the period?
2. DOMINANT PATTERN: What behavioral archetype consistently emerges (e.g., "high-output executor", "ideas-first builder", "relationship-driven collaborator")?
3. REPUTATION PROJECTION: If this person were scrutinized by an investor, employer, or partner — what pattern would they find in the data?
4. OPPORTUNITIES: What 3 specific positive patterns or strengths appear consistently that could be leveraged?

Also extract:
- topEntities: top 5 most mentioned people, projects, or organizations

Return JSON ONLY:
{ "narrative": "2-3 sentence pattern-level summary", "trajectory": "improving|stable|declining", "dominantPattern": "...", "reputationProjection": "...", "opportunities": ["...", "...", "..."], "topEntities": ["..."] }
      `;

      const summaryRaw = await invokeModel({
        capability: 'chat',
        messages: [{ role: 'user', content: summaryPrompt }],
        system: 'You are a clinical intelligence analyst.',
        preference: 'auto'
      });

      const summaryMatch = summaryRaw?.match(/\{[\s\S]*\}/);
      let summaryResult: { narrative?: string; trajectory?: string; dominantPattern?: string; reputationProjection?: string; opportunities?: string[]; topEntities?: string[] } = { narrative: summaryRaw ?? undefined, opportunities: [], topEntities: [] };
      if (summaryMatch) {
        try {
          summaryResult = JSON.parse(summaryMatch[0]);
        } catch (parseErr) {
          console.warn(`[Audit] Failed to parse summary JSON for ${auditId}:`, parseErr);
        }
      }

      // 6. Persist analysis results to DB
      console.log(`[Audit] Finalizing database record for ${auditId}...`);
      const { error: updateError } = await supabase.from('reputation_audits').update({
        status: 'completed',
        risk_score: riskScore,
        mentions_count: events.length,
        commitments_count: unfulfilledCommitmentsCount,
        summary_narrative: summaryResult.narrative || 'Pattern projection complete.',
        connectors_covered: connectorsCovered,
        report_url: null,
        metadata: {
          commitments: extractedCommitments,
          riskFindings: extractedFindings,
          topEntities: summaryResult.topEntities || [],
          opportunities: summaryResult.opportunities || [],
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
