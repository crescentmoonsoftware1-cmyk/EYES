import { createAdminClient } from '@/utils/supabase/server';
import { invokeModel } from '@/services/ai/ai';
import { Commitment } from '@/types/dashboard';

/**
 * Reputation Audit: Core Analysis Pipeline (REAL WORLD ONLY)
 */

/**
 * Cross-references extracted commitments against Google Calendar events
 * to determine if a commitment was actually fulfilled.
 * A commitment is considered 'completed' if a calendar event was created
 * within 7 days of the commitment date with overlapping keywords.
 */
async function resolveCommitmentStatuses(
  commitments: Commitment[],
  calendarEvents: Array<{ title: string | null; timestamp: string | null }>
): Promise<Commitment[]> {
  if (calendarEvents.length === 0) return commitments;

  return commitments.map(commitment => {
    const commitmentDate = new Date(commitment.date).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    // Extract key words from the commitment text (3+ char words)
    const commitmentWords = commitment.text
      .toLowerCase()
      .split(/\W+/)
      .filter(w => w.length >= 3);

    // Look for a calendar event created within 7 days of the commitment
    // that shares at least 1 keyword with the commitment text
    const hasFulfillingEvent = calendarEvents.some(evt => {
      if (!evt.timestamp || !evt.title) return false;
      const evtDate = new Date(evt.timestamp).getTime();
      const withinWindow = Math.abs(evtDate - commitmentDate) <= sevenDaysMs;
      if (!withinWindow) return false;

      const evtWords = evt.title.toLowerCase().split(/\W+/).filter(w => w.length >= 3);
      return commitmentWords.some(w => evtWords.includes(w));
    });

    return {
      ...commitment,
      status: hasFulfillingEvent ? 'completed' : 'pending',
    };
  });
}

export class AuditAnalysisService {
  static async runAnalysis(auditId: string, userId: string) {
    const supabase = await createAdminClient();
    const startedAt = Date.now();
    
    try {
      // Get the audit record metadata to see if a specialized lens type is requested
      const { data: auditRecord } = await supabase
        .from('reputation_audits')
        .select('metadata')
        .eq('id', auditId)
        .single();
      const auditType = (auditRecord?.metadata as Record<string, any>)?.audit_type || 'full';

      // Get User Settings for Risk Sensitivity
      const { data: settingsData } = await supabase
        .from('connector_settings')
        .select('data_types')
        .eq('user_id', userId)
        .eq('platform', 'user_global')
        .maybeSingle();
        
      let riskSensitivity = 'MEDIUM';
      if (settingsData?.data_types?.[0]) {
        try {
          const parsedSettings = JSON.parse(settingsData.data_types[0]);
          if (parsedSettings.riskSensitivity) riskSensitivity = parsedSettings.riskSensitivity;
        } catch {}
      }

      let riskInstruction = '- Flag standard reputational risks, unmet commitments, and moderate negative sentiment.';
      if (riskSensitivity === 'LOW') {
        riskInstruction = '- Risk Sensitivity is LOW. Only flag massive, undeniable risks (e.g. lawsuits, explicit failure). Ignore minor complaints or subtle issues.';
      } else if (riskSensitivity === 'HIGH') {
        riskInstruction = '- Risk Sensitivity is HIGH. Be hyper-vigilant. Flag even subtle negative sentiment, passive-aggression, minor delays, and implied commitments.';
      }

      // Define keywords and instructions based on the selected lens
      let commitmentKeywords = /\b(will|i'll|we'll|i will|we will|i'll|going to|plan to|planning to|need to|have to|should|must|shall|promised|commit|deadline|by (monday|tuesday|wednesday|thursday|friday|saturday|sunday|eod|eow|next week|tomorrow)|follow.?up|send|review|check|handle|take care|responsible for|assigned|action item|todo|to.do)\b/i;
      let sensitiveKeywords = /\b(salary|budget|invoice|payment|debt|legal|lawsuit|confidential|private|conflict|fired|quit|resign|burnout|stressed|anxiety|urgent|critical|emergency|overdue|missed|failed|broke|broken|issue|problem|complaint|dispute|disagree)\b/i;
      let lensInstruction = '';
      let lensSummaryInstruction = '';

      if (auditType === 'privacy') {
        commitmentKeywords = /\b(private|confidential|auth|secret|pii|id)\b/i;
        sensitiveKeywords = /email:\s|user id:|discord user|account id:|phone:|address:|\bemail\b.*@|password|credential|ssn|passport|dob|token|key|leak|unauthorized/i;
        lensInstruction = '\n- Lens is PRIVACY: Pay special attention to personal data, phone numbers, email addresses, confidential project details, credentials, or PII. Mark isSensitive=true for any potentially exposed private info.';
        lensSummaryInstruction = `
- Focus the narrative and findings heavily on Privacy, Data Exposure, and PII hygiene.
- Analyze if sensitive information is leaking across platforms.
- Frame the opportunities around improving privacy settings and secure communication practices.`;
      } else if (auditType === 'commitment') {
        commitmentKeywords = /\b(will|i'll|we'll|i will|we will|i'll|going to|plan to|planning to|need to|have to|should|must|shall|promised|commit|deadline|by (monday|tuesday|wednesday|thursday|friday|saturday|sunday|eod|eow|next week|tomorrow)|follow.?up|send|review|check|handle|take care|responsible for|assigned|action item|todo|to.do)\b/i;
        sensitiveKeywords = /\b(overdue|missed|failed|delay|late|incomplete|broken|pending|cancel|deadline)\b/i;
        lensInstruction = '\n- Lens is OPERATIONAL/COMMITMENTS: Pay special attention to agreements, promises, deadlines, and action items. Make sure to capture any stated obligation as a commitment.';
        lensSummaryInstruction = `
- Focus the narrative and findings heavily on operational commitments, tasks, and follow-through reliability.
- Analyze the ratio of completed vs pending commitments.
- Frame the opportunities around improving organization, meeting deadlines, and task tracking.`;
      } else if (auditType === 'sentiment') {
        commitmentKeywords = /\b(feel|think|opinion|feedback)\b/i;
        sensitiveKeywords = /\b(burnout|stressed|anxiety|angry|happy|sad|depressed|excited|furious|love|hate|dislike|upset|mad|frustrated|annoyed|disappoint|glad|awesome|terrible|bad|good|worst|best|conflict|disagree)\b/i;
        lensInstruction = '\n- Lens is SENTIMENT: Pay special attention to the emotional tone of the communication. Accurately flag negative sentiment (-1) or positive sentiment (1).';
        lensSummaryInstruction = `
- Focus the narrative and findings heavily on emotional valence, sentiment stability, and relational tone.
- Analyze key triggers for negative or stressed communications.
- Frame the opportunities around tone management, stress reduction, and positive engagement.`;
      } else {
        lensInstruction = '\n- Lens is FULL: Perform a balanced analysis of sentiment, commitments, operational follow-through, and privacy leaks.';
        lensSummaryInstruction = `
- Provide a balanced 360° overview of privacy, commitments, and sentiment across all channels.`;
      }

      const finalRiskInstruction = riskInstruction + lensInstruction;

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
        .limit(5000);

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
          metadata: { riskFindings: [], commitments: [], topEntities: [], opportunities: [], trajectory: 'stable', failureRate: '0.00', complianceRate: '100.00', sentimentBalance: 1.0, audit_type: auditType }
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
      // Result: ~80-120 high-value records sent to AI, covering      // Pass A: keyword-matched records from ALL events
      const commitmentCandidates = events.filter(e => {
        const text = `${e.title ?? ''} ${e.content ?? ''}`;
        return commitmentKeywords.test(text) || sensitiveKeywords.test(text);
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

      // Merge and cap at 60 — 120 records × 400 chars = ~48k chars which hits token limits
      // and causes slow responses or truncated JSON. 60 records is sufficient for a quality audit.
      const selectedRecords = [
        ...commitmentCandidates,
        ...recentRecords,
        ...platformSamples,
        ...historicalSample,
      ].filter((e, idx, arr) => arr.findIndex(x => x.id === e.id) === idx)
       .slice(0, 60);

      console.log(`[Audit] Smart selection: ${commitmentCandidates.length} keyword matches + ${recentRecords.length} recent + ${platformSamples.length} platform samples + ${historicalSample.length} historical = ${selectedRecords.length} records sent to AI (from ${events.length} total)`);

      const analysisInput = selectedRecords.map(e => ({
        id: e.id,
        platform: e.platform,
        author: e.author || 'unknown',
        date: e.timestamp,
        text: `${e.title ?? ''}: ${e.content ?? ''}`.slice(0, 400)
      }));

      // ── Batched parallel extraction ───────────────────────────────────────────
      // Sending 60 records as one prompt causes Groq 413 (payload too large),
      // forcing a slow fallback chain (90-260s). Split into 3×20 parallel batches
      // so each call stays within Groq's limit and responds in ~1s.
      const BATCH_SIZE = 20;
      const batches: typeof analysisInput[] = [];
      for (let i = 0; i < analysisInput.length; i += BATCH_SIZE) {
        batches.push(analysisInput.slice(i, i + BATCH_SIZE));
      }

      const subjectName = (auditRecord?.metadata as Record<string, any>)?.subjectName || 'unknown user';
      const buildExtractionPrompt = (batch: typeof analysisInput) => `
You are a forensic digital analyst. Classify each record below. Return JSON only.
The subject of this audit is: "${subjectName}".

Records (${batch.length} items):
${JSON.stringify(batch)}

For EVERY record output:
- id: same uuid as input
- sentiment: -1 (negative), 0 (neutral), 1 (positive) — integer only, no + prefix
- isCommitment: true ONLY if the record contains a first-person active commitment, promise, task, or scheduled intention made BY the subject of this audit ("${subjectName}"). It must be a personal commitment from the subject, NOT a received notification, system message, automated email, or statement from another person (e.g. "we will notify you" is NOT a commitment by the subject). If the message is automated, passive, or received from someone else, set isCommitment to false.
- commitmentText: exact verbatim text if isCommitment=true, else ""
- isSensitive: true for financial, legal, conflict, stress, missed deadlines, or confidential content
- entities: array of proper nouns (people, companies, projects) — [] if none
- behaviorType: "output"|"communication"|"planning"|"social"|"reflection"|"other"
- detectedPII: array of strings. Identify if this record contains PII. Include any matching items from: ["name", "email", "phone", "address", "id", "financial", "health", "biometric"]. Return [] if none.

Rules:
${finalRiskInstruction}

Return JSON ONLY:
{ "analysis": [ { "id": "uuid", "sentiment": -1|0|1, "isCommitment": true|false, "commitmentText": "text or empty", "isSensitive": true|false, "entities": [], "behaviorType": "output", "detectedPII": [] } ] }
`;

      console.log(`[Audit] Batched extraction: ${batches.length} batches of ~${BATCH_SIZE} records each, running in parallel`);

      const batchResults = await Promise.all(
        batches.map(batch =>
          invokeModel({
            capability: 'chat',
            messages: [{ role: 'user', content: buildExtractionPrompt(batch) }],
            system: 'You are a clinical intelligence analyst. Return valid JSON only.',
            preference: 'auto'
          })
        )
      );

      // Merge all batch results into a single analysisRaw-compatible string
      const analysisRaw = batchResults.every(r => !r)
        ? null
        : JSON.stringify({
            analysis: batchResults.flatMap(raw => {
              if (!raw || typeof raw !== 'string') return [];
              try {
                const m = raw.match(/\{[\s\S]*\}/);
                if (!m) return [];
                const sanitized = m[0].replace(/:\s*\+(\d)/g, ': $1');
                return JSON.parse(sanitized).analysis ?? [];
              } catch { return []; }
            })
          });

      // If AI fails to return data, proceed with empty analysis (avoid crashing the whole audit)
      if (!analysisRaw) {
        console.warn(`[Audit] All batches returned null for ${auditId}. Proceeding with empty analysis.`);
      }


      // 3. Parse and Aggregate
      let weightedTotalMentions = 0;
      let weightedNegativeMentions = 0;
      let weightedNeutralMentions = 0;
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
        detectedPII?: string[];
      }
      
      const nowTs = Date.now();
      // CRITICAL: Guard against null/undefined from AI — calling .match() on null throws TypeError
      // which crashes the entire audit into the catch block, producing "AI Analysis failed" errors.
      let analysisResult: { analysis: AnalysisItem[] } = { analysis: [] };
      if (analysisRaw && typeof analysisRaw === 'string') {
        try {
          const jsonMatch = analysisRaw.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            // Groq returns +1 for positive sentiment which is invalid JSON.
            // Sanitize: replace `: +1` → `: 1` and `: +0` → `: 0` etc.
            const sanitized = jsonMatch[0].replace(/:\s*\+(\d)/g, ': $1');
            analysisResult = JSON.parse(sanitized);
          }
        } catch (parseErr) {
          console.warn(`[Audit] Failed to parse AI analysis JSON for ${auditId}:`, parseErr);
        }
      }
      
      analysisResult.analysis.forEach((a: AnalysisItem) => {
        const evt = events.find(e => e.id === a.id);
        if (!evt) return;

        const ageMs = nowTs - new Date(evt.timestamp).getTime();
        const sixMonthsMs = 180 * 24 * 60 * 60 * 1000;
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        const weight = ageMs < thirtyDaysMs ? 1.0 : ageMs < sixMonthsMs ? 0.5 : 0.2;

        weightedTotalMentions += weight;
        if (a.sentiment === -1) {
          negativeMentions++;
          weightedNegativeMentions += weight;
        } else if (a.sentiment === 0) {
          weightedNeutralMentions += weight;
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

        if (a.detectedPII && a.detectedPII.length > 0) {
          a.detectedPII.forEach((piiType: string) => {
            let label = piiType;
            if (piiType === 'name') label = 'Full legal names';
            else if (piiType === 'email') label = 'Email addresses';
            else if (piiType === 'phone') label = 'Phone numbers (intl.)';
            else if (piiType === 'address') label = 'Physical addresses';
            else if (piiType === 'id') label = 'National ID / SSN';
            else if (piiType === 'financial') label = 'Financial identifiers';
            else if (piiType === 'health') label = 'Health / medical data';
            else if (piiType === 'biometric') label = 'Biometric identifiers';

            extractedFindings.push({
              severity: 'Medium',
              finding: `PII exposure: ${label} detected in ${evt.platform}`,
              evidence: `Source event: ${evt.id}`,
              impact: 'Potential PII compliance exposure.'
            });
          });
        }
      });

      // Cross-reference commitments with calendar events to resolve statuses
      // (marks commitments as 'completed' if a matching calendar event exists nearby)
      const calendarEvents = events
        .filter(e => e.platform === 'google_calendar' || e.platform === 'google-calendar')
        .map(e => ({ title: e.title, timestamp: e.timestamp }));
      const resolvedCommitments = await resolveCommitmentStatuses(extractedCommitments, calendarEvents);

      // Suppress unused variable: void is retained for type safety
      void 0;

      const riskScore = Math.min(10, Number((( (weightedNegativeMentions * 2) + (weightedNeutralMentions * 0.5) + (weightedUnfulfilledCommitments * 3) ) / (weightedTotalMentions || 1) * 10).toFixed(1)));
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
You are a forensic intelligence analyst producing a clinical reputation audit. Your output will be read by the subject themselves — not their investor, not their recruiter. You are a mirror, not a publicist.

Lens-specific Focus:
${lensSummaryInstruction}

Tone rules (non-negotiable):
- Cold, declarative, and direct. State what the data shows. Nothing more.
- Do NOT compliment, flatter, or soften findings. No "strong foundation", no "high professionalism", no "great track record".
- Do NOT use advisory language like "consider", "might want to", "could leverage".
- If negative signals are zero, say so plainly — do not spin it as a positive character trait.
- If commitments are zero, say so plainly using natural terminology (e.g., "no unresolved commitments were identified" rather than "0 unfulfilled commitments") — do not infer virtue from absence of data.
- Every sentence must be grounded in a specific number or pattern from the data below.

Data:
- Total records analysed: ${events.length}
- Platforms: ${connectorsCovered.join(', ')}
- Negative signals detected: ${negativeMentions}
- Unfulfilled commitments extracted: ${unfulfilledCommitmentsCount}
- Risk Score: ${riskScore}/10
- Most mentioned entities: ${topExtractedEntities.join(', ') || 'none detected'}
- Failure rate: ${failureRate.toFixed(1)}%
- Compliance rate: ${complianceRate.toFixed(1)}%

Produce the following:
1. narrative: 3-4 sentences. State what the data volume shows, what the signal distribution shows, what the risk score means, and what the single most notable pattern is. Reference specific numbers. Do not flatter.
2. trajectory: "improving" | "stable" | "declining" — based on chronological distribution of negative signals.
3. dominantPattern: One precise behavioral descriptor. Not a compliment. Example: "high-output with sparse follow-through" or "reactive communicator with deadline sensitivity".
4. reputationProjection: 1-2 sentences. What would a skeptical external observer flag from this data? If nothing is flagged, say that plainly without framing it as praise.
5. opportunities: Exactly 3 specific gaps or under-leveraged patterns visible in THIS data. These are operational observations, not affirmations.
6. topEntities: Top 5 most frequently mentioned people, projects, companies, or tools. Use the entity list above if non-empty.

Return JSON ONLY (no markdown, no explanation):
{ "narrative": "string", "trajectory": "improving|stable|declining", "dominantPattern": "string", "reputationProjection": "string", "opportunities": ["string", "string", "string"], "topEntities": ["string", "string", "string", "string", "string"] }
      `;

      const summaryRaw = await invokeModel({
        capability: 'chat',
        messages: [{ role: 'user', content: summaryPrompt }],
        system: 'You are a forensic intelligence analyst. Return valid JSON only.',
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
      // Tone: cold, declarative, no flattery — matches spec Section 05
      const fallbackNarrative = `${events.length} records were analysed across ${connectorsCovered.join(', ')} over a 24-month window. ${negativeMentions} negative signal${negativeMentions !== 1 ? 's' : ''} were detected, producing a failure rate of ${failureRate.toFixed(1)}%. ${unfulfilledCommitmentsCount > 0 ? `${unfulfilledCommitmentsCount} open commitment${unfulfilledCommitmentsCount !== 1 ? 's' : ''} were extracted and remain unresolved.` : 'No commitment records were extracted from the dataset.'} Risk score: ${riskScore}/10 — ${riskScore <= 2 ? 'minimal exposure detected' : riskScore <= 5 ? 'moderate exposure detected' : 'elevated exposure detected'}.${topExtractedEntities.length > 0 ? ` Most referenced entities: ${topExtractedEntities.slice(0, 3).join(', ')}.` : ''}`;

      const fallbackOpportunities = [
        `${complianceRate.toFixed(0)}% of records carried no negative signal — the pattern of low-risk activity is consistent but untested under high-stakes conditions.`,
        `Communication volume across ${connectorsCovered.slice(0, 3).join(', ')} is measurable but the depth of follow-through on initiated threads is not fully captured in this dataset.`,
        `${connectorsCovered.length} platforms are connected — cross-platform commitment consistency has not been independently verified.`,
      ];

      // 6. Persist analysis results to DB
      // Use resolvedCommitments (calendar-verified) — count only truly pending ones
      const pendingCommitmentsCount = resolvedCommitments.filter(c => c.status === 'pending').length;
      console.log(`[Audit] Commitment resolution: ${resolvedCommitments.length} total, ${pendingCommitmentsCount} pending, ${resolvedCommitments.length - pendingCommitmentsCount} completed via calendar match.`);
      console.log(`[Audit] Finalizing database record for ${auditId}...`);
      const { error: updateError } = await supabase.from('reputation_audits').update({
        status: 'completed',
        risk_score: riskScore,
        mentions_count: events.length,
        commitments_count: pendingCommitmentsCount,
        summary_narrative: (summaryResult.narrative && summaryResult.narrative.length > 100)
          ? summaryResult.narrative
          : fallbackNarrative,
        connectors_covered: connectorsCovered,
        report_url: null,
        metadata: {
          commitments: resolvedCommitments,  // ← calendar-verified statuses (pending/completed)
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
          audit_type: auditType,
        }
      }).eq('id', auditId);

      if (updateError) {
        console.error(`[Audit] Database update failed for ${auditId}:`, updateError);
      } else {
        console.log(`[Audit] Successfully finalized ${auditId} in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
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
