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

    // Section 06: stage updater — drives the Thinking Veil status line in real-time
    const setStage = (stage: string, extra?: Record<string, unknown>) =>
      supabase.from('reputation_audits').update({ stage, ...(extra ?? {}) }).eq('id', auditId).then(() => {});

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
        } catch { }
      }

      // Unify keywords for a comprehensive extraction pass (identical across all lenses to ensure strict determinism)
      const commitmentKeywords = /\b(will|i'll|we'll|i will|we will|i'll|going to|plan to|planning to|need to|have to|should|must|shall|promised|commit|deadline|by (monday|tuesday|wednesday|thursday|friday|saturday|sunday|eod|eow|next week|tomorrow)|follow.?up|send|review|check|handle|take care|responsible for|assigned|action item|todo|to.do)\b/i;
      const sensitiveKeywords = /\b(salary|budget|invoice|payment|debt|legal|lawsuit|confidential|private|conflict|fired|quit|resign|burnout|stressed|anxiety|urgent|critical|emergency|overdue|missed|failed|broke|broken|issue|problem|complaint|dispute|disagree|delay|late|incomplete|pending|cancel|deadline|drift|dropped|slip|loops|angry|happy|sad|depressed|excited|furious|love|hate|dislike|upset|mad|frustrated|annoyed|disappoint|glad|awesome|terrible|bad|good|worst|best)\b/i;

      // Unified extraction instruction (identical across all lenses to maintain strict data-layer consistency)
      const finalRiskInstruction = `
- Be precise and objective. Do not over-flag or hallucinate risks.
- Flag standard reputational risks, unmet commitments, and moderate negative sentiment.
- Treat automated notifications or emails from external parties as neutral and isCommitment=false.
- CONTEXT-AWARE SENTIMENT: Conversations where the subject is actively debugging code, discussing technical bugs, compilation issues, or product errors (especially in developer platforms or Claude sessions) are standard software engineering activities. Classify them as neutral (sentiment: 0), NOT negative, unless there is a genuine interpersonal conflict, project failure, or professional misconduct.
- FALSE POSITIVES FILTER: Internal development and debugging sessions where the subject is discussing product issues to improve/debug EYES (e.g., discussing "contradictory data in executive summary" or "fixing the PDF generator") are self-improvement/product feedback loops, NOT reputational risks. Do NOT flag them as sensitive or risks.
- NORMAL TRANSACTION / RECEIVED EMAILS: Standard received transactions, service alerts, trial expirations, or social invites (e.g., birthday invitations) are neutral (sentiment: 0) and do NOT constitute PII exposures or security/reputation risks unless they expose raw secret credentials or financial account keys.
- STRICTION: Commands, queries, prompts, search terms, or instructions sent to AI systems (e.g. Claude, ChatGPT), search engines, or code compilers (like "remove final page", "make perfect doc", "search receipts") are NOT personal commitments or promises made by the subject. Set isCommitment=false for them. A commitment is only when the subject explicitly promises they will do an action themselves in the future.
`;

      // Stage: aggregate — data retrieval begins
      await setStage('aggregate');

      // 1. Data Retrieval (Real data only)
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

      let { data: rawEvents, error: fetchError } = await supabase
        .from('memories')
        .select('id, platform, timestamp, title, content, author')
        .eq('user_id', userId)
        .gte('timestamp', twoYearsAgo.toISOString())
        .limit(5000);

      const events = rawEvents
        ? rawEvents
            .filter(e => e.content !== null)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        : null;

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

      // Calculate actual scan window date range
      const timestamps = events.map(e => new Date(e.timestamp).getTime());
      const minDate = new Date(Math.min(...timestamps));
      const maxDate = new Date(Math.max(...timestamps));
      
      const formatQuarterYear = (date: Date) => {
        const quarter = Math.floor(date.getMonth() / 3) + 1;
        return `Q${quarter} ${date.getFullYear()}`;
      };
      const actualScanWindow = `${formatQuarterYear(minDate)} - ${formatQuarterYear(maxDate)}`;

      // Stage: filter — smart record selection begins
      await setStage('filter', { metadata: { ...((auditRecord?.metadata as Record<string, unknown>) ?? {}), record_count: events.length } });

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

      // Stage: extract — AI classification begins
      await setStage('extract');

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
- riskDescription: if isSensitive=true or sentiment=-1, a brief 5-10 word description of why it is flagged/sensitive. Be highly concrete and specific (e.g. "API key leak in code block", "Late night deliverable tension"). Avoid vague generalities like "Discussion about protecting assets". Refer to concrete details in the text. Else ""
- entities: array of proper nouns representing projects, tools, companies, or organizations (do NOT include individual people's names like "Tommy", "Sabari", "Alex", etc. to protect privacy) — [] if none
- behaviorType: "output"|"communication"|"planning"|"social"|"reflection"|"other"
- detectedPII: array of strings. Identify if this record contains real personal PII. Include "id" only for actual permanent government ID numbers, SSNs, or national identifiers. Do NOT include temporary login codes, OTP verification codes, email verification PINs, or random 6-digit tokens (like "010414") as "id". Include other items like "name", "email", "phone", "address", "financial", "health", "biometric" only if present. Return [] if none.

Rules:
${finalRiskInstruction}

Return JSON ONLY:
{ "analysis": [ { "id": "uuid", "sentiment": -1|0|1, "isCommitment": true|false, "commitmentText": "text or empty", "isSensitive": true|false, "riskDescription": "string or empty", "entities": [], "behaviorType": "output", "detectedPII": [] } ] }
`;

      console.log(`[Audit] Batched extraction: ${batches.length} batches of ~${BATCH_SIZE} records each, running sequentially to prevent API rate limits`);

      const batchResults: (string | null)[] = [];
      for (const batch of batches) {
        const result = await invokeModel({
          capability: 'chat',
          messages: [{ role: 'user', content: buildExtractionPrompt(batch) }],
          system: 'You are a clinical intelligence analyst. Return valid JSON only.',
          preference: 'auto',
          maxTokens: 4000
        });
        batchResults.push(typeof result === 'string' ? result : null);
        // Add a 250ms delay between sequential calls to let the API rate limit recover
        await new Promise(resolve => setTimeout(resolve, 250));
      }

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
        platform?: string;
      }
      const extractedFindings: RiskFinding[] = [];

      interface AnalysisItem {
        id: string;
        sentiment: -1 | 0 | 1;
        isCommitment: boolean;
        commitmentText?: string;
        isSensitive: boolean;
        riskDescription?: string;
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

        // Proactive platform routing: map external notifications (e.g. Sentry/Vercel/GitHub alerts received in Gmail)
        // to their respective platform.
        let resolvedPlatform = evt.platform;
        const lowerContent = ((evt.content || '') + ' ' + (evt.title || '')).toLowerCase();
        if (evt.platform === 'gmail') {
          if (lowerContent.includes('sentry') || lowerContent.includes('vercel')) {
            resolvedPlatform = 'vercel';
          } else if (lowerContent.includes('github') || lowerContent.includes('pull request')) {
            resolvedPlatform = 'github';
          } else if (lowerContent.includes('linear')) {
            resolvedPlatform = 'linear';
          } else if (lowerContent.includes('clickup')) {
            resolvedPlatform = 'clickup';
          } else if (lowerContent.includes('slack')) {
            resolvedPlatform = 'slack';
          } else if (lowerContent.includes('discord')) {
            resolvedPlatform = 'discord';
          }
        }

        // Datadog trial emails: force to gmail since it is a trial expiration email received via Gmail
        if (lowerContent.includes('datadog') && lowerContent.includes('trial')) {
          resolvedPlatform = 'gmail';
        }

        if (a.isCommitment) {
          unfulfilledCommitmentsCount++;
          weightedUnfulfilledCommitments += weight;
          extractedCommitments.push({
            text: a.commitmentText || 'Commitment detected',
            status: 'pending',
            citation: a.id,
            platform: resolvedPlatform,
            date: evt.timestamp || new Date().toISOString()
          });
        }

        if (a.isSensitive || a.sentiment === -1) {
          extractedFindings.push({
            severity: a.sentiment === -1 ? 'High' : 'Medium',
            finding: a.riskDescription || a.commitmentText || `Reputational risk in ${resolvedPlatform}`,
            evidence: `Source event: ${evt.id}`,
            impact: 'Potential diligence concern.',
            platform: resolvedPlatform
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
              finding: `PII exposure: ${label} detected in ${resolvedPlatform}`,
              evidence: `Source event: ${evt.id}`,
              impact: 'Potential PII compliance exposure.',
              platform: resolvedPlatform
            });
          });
        }
      });

      // Stage: cross-ref — commitment vs calendar check begins
      await setStage('cross-ref');

      // Cross-reference commitments with calendar events to resolve statuses
      // (marks commitments as 'completed' if a matching calendar event exists nearby)
      const calendarEvents = events
        .filter(e => e.platform === 'google_calendar' || e.platform === 'google-calendar')
        .map(e => ({ title: e.title, timestamp: e.timestamp }));
      const resolvedCommitments = await resolveCommitmentStatuses(extractedCommitments, calendarEvents);

      // Calculate real quarterly sentiment per platform
      const platformSentiment: Record<string, Record<string, { positive: number; neutral: number; negative: number; total: number }>> = {};
      
      const getQuarterKey = (dateStr: string) => {
        const date = new Date(dateStr);
        const year = date.getFullYear();
        const month = date.getMonth(); // 0-11
        if (month >= 6) {
          return `Q3-Q4 ${year}`;
        } else {
          return `Q1-Q2 ${year}`;
        }
      };

      // 1. Pre-populate sentiment using regex for all retrieved events to cover historical quarters
      const negRegex = /\b(error|fail|crash|issue|bad|worst|overdue|missed|delay|unauthorized|failed|conflict|burnout|stressed|angry|resign|dispute|terrible|broken|late)\b/i;
      const posRegex = /\b(success|completed|solved|resolved|great|awesome|good|best|glad|thanks|thank\s+you|excellent|perfect|approved|done)\b/i;

      events.forEach(evt => {
        const platformKey = evt.platform.toLowerCase();
        const quarterKey = getQuarterKey(evt.timestamp);
        
        if (!platformSentiment[platformKey]) {
          platformSentiment[platformKey] = {};
        }
        if (!platformSentiment[platformKey][quarterKey]) {
          platformSentiment[platformKey][quarterKey] = { positive: 0, neutral: 0, negative: 0, total: 0 };
        }

        const text = `${evt.title ?? ''} ${evt.content ?? ''}`;
        let sentiment = 0;
        if (negRegex.test(text)) sentiment = -1;
        else if (posRegex.test(text)) sentiment = 1;

        const stats = platformSentiment[platformKey][quarterKey];
        stats.total++;
        if (sentiment === 1) stats.positive++;
        else if (sentiment === 0) stats.neutral++;
        else if (sentiment === -1) stats.negative++;
      });

      // 2. Overwrite with precise AI sentiment for the 60 selected records
      analysisResult.analysis.forEach((a: AnalysisItem) => {
        const evt = events.find(e => e.id === a.id);
        if (!evt) return;

        const platformKey = evt.platform.toLowerCase();
        const quarterKey = getQuarterKey(evt.timestamp);

        const stats = platformSentiment[platformKey]?.[quarterKey];
        if (stats) {
          // Revert the regex-based guess first
          const text = `${evt.title ?? ''} ${evt.content ?? ''}`;
          let oldSentiment = 0;
          if (negRegex.test(text)) oldSentiment = -1;
          else if (posRegex.test(text)) oldSentiment = 1;

          if (oldSentiment === 1 && stats.positive > 0) stats.positive--;
          else if (oldSentiment === 0 && stats.neutral > 0) stats.neutral--;
          else if (oldSentiment === -1 && stats.negative > 0) stats.negative--;

          // Add the precise AI sentiment
          if (a.sentiment === 1) stats.positive++;
          else if (a.sentiment === 0) stats.neutral++;
          else if (a.sentiment === -1) stats.negative++;
        }
      });

      // Suppress unused variable: void is retained for type safety
      void 0;

      // Programmatically calculate risk score per active platform, incorporating log-volume-weighted
      // platform scaling and total database footprint to eliminate sample bias and platform imbalance.
      const activePlatforms = Array.from(new Set(events.map(e => e.platform.toLowerCase())));
      let weightedPlatformScoresSum = 0;
      let platformWeightsSum = 0;

      activePlatforms.forEach(p => {
        const platformEvents = events.filter(e => e.platform.toLowerCase() === p);
        if (platformEvents.length === 0) return;

        // Calculate total DB weight of this platform (using recency weights)
        let platformDbWeight = 0;
        platformEvents.forEach(evt => {
          const ageMs = nowTs - new Date(evt.timestamp).getTime();
          const sixMonthsMs = 180 * 24 * 60 * 60 * 1000;
          const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
          const weight = ageMs < thirtyDaysMs ? 1.0 : ageMs < sixMonthsMs ? 0.5 : 0.2;
          platformDbWeight += weight;
        });

        // Sum negative, neutral, and unfulfilled commitments for this platform from the AI sample
        let pNeg = 0;
        let pNeut = 0;
        let pUnfulfilled = 0;
        let pSampleWeight = 0;

        analysisResult.analysis.forEach((a: AnalysisItem) => {
          const evt = events.find(e => e.id === a.id);
          if (!evt || evt.platform.toLowerCase() !== p) return;

          const ageMs = nowTs - new Date(evt.timestamp).getTime();
          const sixMonthsMs = 180 * 24 * 60 * 60 * 1000;
          const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
          const weight = ageMs < thirtyDaysMs ? 1.0 : ageMs < sixMonthsMs ? 0.5 : 0.2;

          pSampleWeight += weight;
          if (a.sentiment === -1) pNeg += weight;
          else if (a.sentiment === 0) pNeut += weight;
          
          if (a.isCommitment) {
            const comm = resolvedCommitments.find(c => c.citation === a.id);
            if (comm && comm.status === 'pending') {
              pUnfulfilled += weight;
            }
          }
        });

        // The denominator is the sample weight + a scaled version of the unsampled volume's weight
        // (assuming unsampled records are neutral/positive to reduce sample bias).
        const unsampledWeight = Math.max(0, platformDbWeight - pSampleWeight);
        const platformDenominator = pSampleWeight + unsampledWeight * 0.4;

        const platformScore = platformDenominator > 0
          ? Math.min(10, (((pNeg * 2) + (pNeut * 0.5) + (pUnfulfilled * 3)) / platformDenominator) * 10)
          : 0;

        // Log-scaled weight for the platform volume
        const pWeight = Math.log(1 + platformEvents.length);
        weightedPlatformScoresSum += platformScore * pWeight;
        platformWeightsSum += pWeight;
      });

      const riskScore = platformWeightsSum > 0
        ? Math.min(10, Number((weightedPlatformScoresSum / platformWeightsSum).toFixed(1)))
        : 0.0;

      const failureRate = selectedRecords.length > 0 ? (negativeMentions / selectedRecords.length) * 100 : 0;
      const complianceRate = 100 - failureRate;

      // Stage: score — risk scoring and projection begin
      await setStage('score');

      // 4. Reputation Projection: pattern-level narrative across time
      // Collect all entities extracted per-record for the summary prompt, excluding connector/platform names
      const EXCLUDED_ENTITIES = new Set([
        'gmail', 'slack', 'discord', 'github', 'notion', 'vercel', 'google_calendar', 'google-calendar', 'clickup', 'linear',
        'email', 'calendar', 'message', 'messages', 'chat', 'chats', 'system', 'connector', 'connectors', 'eyes', 'user', 'me',
        // Human names to prevent PII leakage
        'tommy', 'alex', 'john', 'david', 'sarah', 'emma', 'james', 'robert', 'michael', 'william', 'mary', 'patricia', 'linda', 'elizabeth',
        'barbara', 'susan', 'jessica', 'karen', 'nancy', 'lisa', 'sabari', 'sabarish', 'chandra', 'mohan', 'sanjay', 'ram', 'raj', 'kumar',
        'aaron', 'adam', 'alan', 'albert', 'ben', 'bill', 'bob', 'brian', 'charles', 'chris', 'daniel', 'don', 'donald', 'edward', 'eric',
        'frank', 'gary', 'george', 'harry', 'henry', 'jack', 'jerry', 'jim', 'joe', 'joseph', 'ken', 'kevin', 'mark', 'paul', 'peter',
        'philip', 'richard', 'ron', 'sam', 'steve', 'steven', 'thomas', 'tim', 'timothy', 'tony', 'walter', 'friend', 'boss', 'guy', 'dude'
      ]);
      const allExtractedEntities = analysisResult.analysis
        .flatMap((a: AnalysisItem) => a.entities || [])
        .filter(Boolean)
        .map((e: string) => e.trim())
        .filter((e: string) => !EXCLUDED_ENTITIES.has(e.toLowerCase()));

      const entityFrequency: Record<string, number> = {};
      allExtractedEntities.forEach((e: string) => { entityFrequency[e] = (entityFrequency[e] || 0) + 1; });
      const topExtractedEntities = Object.entries(entityFrequency)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name]) => name);

      // Calculate database platform counts for prompt injection
      const dbPlatformCounts: Record<string, number> = {};
      events.forEach(e => {
        const pKey = e.platform.toLowerCase();
        dbPlatformCounts[pKey] = (dbPlatformCounts[pKey] || 0) + 1;
      });

      // If it is a full audit, fetch sibling lenses to feed to crossLensConsistency
      let siblingLensesText = '';
      if (auditType === 'full') {
        const { data: siblingAudits } = await supabase
          .from('reputation_audits')
          .select('risk_score, metadata')
          .eq('user_id', userId)
          .eq('status', 'completed')
          .neq('id', auditId);
          
        if (siblingAudits && siblingAudits.length > 0) {
          siblingLensesText = siblingAudits.map(s => {
            const sType = s.metadata?.audit_type || 'unknown';
            const sFindings = s.metadata?.riskFindings || [];
            return `Sibling Lens: ${sType.toUpperCase()}
- Risk Score: ${s.risk_score}/10
- Key Findings: ${JSON.stringify(sFindings.slice(0, 3).map((f: any) => f.finding))}`;
          }).join('\n\n');
        }
      }

      // 5. Build prompts following EYES Audit Generation Fix Spec
      const SECTION_TITLES = {
        behavioral: {
          section2: "BEHAVIORAL TRAJECTORY & SELF-AWARENESS ASSESSMENT",
          section6: "PERSONAL COMMITMENTS & GROWTH OPPORTUNITIES",
          section7: "PERSONAL BEHAVIORAL PATTERNS TO ADDRESS",
        },
        reputation: {
          section2: "REPUTATIONAL STANDING & INVESTOR DILIGENCE ASSESSMENT",
          section6: "COMMITMENT LEDGER & REPUTATIONAL LEVERAGE OPPORTUNITIES",
          section7: "INVESTOR DILIGENCE CONCERNS",
        },
        hiring: {
          section2: "PROFESSIONAL PROFILE & HIRING RISK ASSESSMENT",
          section6: "PROFESSIONAL COMMITMENTS & DEVELOPMENT OPPORTUNITIES",
          section7: "EMPLOYER DILIGENCE CONCERNS",
        },
        full: {
          section2: "360° REPUTATIONAL PROFILE & COMPOSITE RISK ASSESSMENT",
          section6: "COMMITMENT LEDGER & MULTI-DIMENSIONAL OPPORTUNITIES",
          section7: "FULL-SPECTRUM RISK FINDINGS",
        },
      };

      const EXECUTIVE_SUMMARY_INSTRUCTIONS = {
        behavioral: `
EXECUTIVE SUMMARY INSTRUCTIONS:
- Use second-person "you" language throughout
- Lead with: "Your digital behavior over the past [X] months..."
- Focus on: personal growth trajectory, self-consistency, 
  stress signals, communication tone trends
- Highlight: quarter-over-quarter improvement or decline
- Close with: a constructive self-reflection statement
- Tone: personal coach, honest but compassionate
- Example opening: "Your digital footprint across [N] platforms 
  over the past 24 months reflects a subject with strong 
  professional output discipline, though recurring late-night 
  delivery patterns suggest scope underestimation as a 
  persistent personal challenge."
`,
        reputation: `
EXECUTIVE SUMMARY INSTRUCTIONS:
- Use third-person "the subject" language throughout
- Lead with: "The subject's digital record across [N] platforms..."
- Focus on: commitment follow-through rate, timeline consistency,
  credibility signals, contradiction count
- Highlight: any unfulfilled commitments or cross-platform 
  contradictions that would concern an investor
- Close with: an overall investability assessment statement
- Tone: formal, due-diligence grade, neutral
- Example opening: "The subject's digital record across [N] 
  platforms over a 24-month window indicates a broadly 
  consistent professional profile, with [X] commitment 
  instances identified and a [Y]% follow-through rate — 
  a profile that presents [low/moderate/elevated] diligence 
  exposure for prospective investors."
`,
        hiring: `
EXECUTIVE SUMMARY INSTRUCTIONS:
- Use "the candidate" language throughout
- Lead with: "The candidate's professional digital record..."
- Focus on: delivery reliability, team communication quality,
  professional language consistency, work pattern discipline
- Highlight: any patterns an employer would flag — missed 
  deadlines, communication gaps, irregular work hours
- Close with: an overall candidate reliability assessment
- Tone: structured HR language, like a formal reference check
- Example opening: "The candidate's professional digital record 
  across [N] platforms demonstrates consistent delivery behavior 
  with a [X]% commitment fulfillment rate. Communication quality 
  is generally professional across work platforms, though 
  [specific pattern] warrants attention in high-stakes 
  client-facing roles."
`,
        full: `
EXECUTIVE SUMMARY INSTRUCTIONS:
- Use mixed language — "you" for behavioral, "the subject" 
  for investor/professional sections
- Lead with: "A full-spectrum analysis across [N] platforms..."
- Cover ALL 4 dimensions explicitly in the narrative — 
  one sentence per dimension
- Include a per-dimension score grid in this section:
    Behavioral Dimension:         [X.X / 10.0]
    Investor / Reputation:        [X.X / 10.0]
    Hiring / Professional:        [X.X / 10.0]
    Cross-Platform Consistency:   [X.X / 10.0]
    ──────────────────────────────────────────
    COMPOSITE RISK SCORE:         [X.X / 10.0]
- Close with: a cross-platform consistency observation
- Tone: balanced, comprehensive, 360-degree review language
- Example opening: "A full-spectrum analysis of [N] platform 
  records over 24 months reveals a consistent behavioral 
  profile with low reputational exposure across all four 
  assessment dimensions. Behaviorally, [pattern]. From an 
  investor perspective, [pattern]. Professionally, [pattern]. 
  Cross-platform consistency is [HIGH/MEDIUM/LOW]."
`,
      };

      const OPPORTUNITIES_INSTRUCTIONS = {
        behavioral: `
OPPORTUNITY GENERATION RULES (Behavioral Lens):
Generate exactly 3 opportunities. Each must:
- Be grounded in a SPECIFIC signal found in the connector data
- Reference a specific connector by name (not just "Verified Platform")
- Be actionable — describe a concrete behavior change
- Use "you" language
- Follow this format in JSON:
  {
    "title": "[Short action-oriented title]",
    "description": "[2 sentences: what the data shows + what to do about it]",
    "source": "[Specific platform name] connector (Record window: \${actualScanWindow})",
    "priority": "[High/Medium/Low]",
    "scoreReduction": "[Estimated risk score reduction points, e.g., -0.8 or -0.4]"
  }
`,
        reputation: `
OPPORTUNITY GENERATION RULES (Investor Lens):
Generate exactly 3 opportunities. Each must:
- Address a specific credibility gap found in the data
- Reference a specific connector and record window
- Frame the action as trust-building for an external investor
- Use formal language
- Follow this format in JSON:
  {
    "title": "[Short credibility-building title]",
    "description": "[2 sentences: what the gap is + what to do]",
    "source": "[Specific platform name] connector (Record window: \${actualScanWindow})",
    "priority": "[High/Medium/Low]",
    "scoreReduction": "[Estimated risk score reduction points, e.g., -0.8 or -0.4]"
  }
`,
        hiring: `
OPPORTUNITY GENERATION RULES (Hiring Lens):
Generate exactly 3 opportunities. Each must:
- Address a specific professional pattern from the data
- Reference a specific connector and record window
- Be framed as a career development action
- Use "candidate" or direct professional language
- Follow this format in JSON:
  {
    "title": "[Short professional development title]",
    "description": "[2 sentences: observed pattern + recommended action]",
    "source": "[Specific platform name] connector (Record window: \${actualScanWindow})",
    "priority": "[High/Medium/Low]",
    "scoreReduction": "[Estimated risk score reduction points, e.g., -0.8 or -0.4]"
  }
`,
        full: `
OPPORTUNITY GENERATION RULES (Full Audit Lens):
Generate exactly 4 opportunities — one per dimension.
Each must reference specific connector data and record window.
Tag each opportunity with its dimension:
  [BEHAVIORAL] / [INVESTOR] / [PROFESSIONAL] / [CROSS-PLATFORM]
- Follow this format in JSON:
  {
    "title": "[Short title prefixed with the dimension]",
    "description": "[Observed pattern + recommended action]",
    "source": "[Specific platform name] connector (Record window: \${actualScanWindow})",
    "priority": "[High/Medium/Low]",
    "scoreReduction": "[Estimated risk score reduction points, e.g., -0.8 or -0.4]"
  }
`,
      };

      const CROSS_LENS_SECTION = `
MANDATORY SECTION FOR FULL AUDIT ONLY — § 8 CROSS-LENS CONSISTENCY:
You MUST generate a Cross-Lens Consistency Report as § 8 of the Full Reputation Audit. This section does NOT appear in any other lens. It must contain:

1. OVERALL CONSISTENCY RATING: HIGH / MEDIUM / LOW
   - HIGH: All platforms tell the same story, no contradictions
   - MEDIUM: Minor tone or timeline inconsistencies detected
   - LOW: Significant contradictions between platforms

2. DIMENSION SCORE VARIANCE: 
   Calculate: max(dimension_scores) - min(dimension_scores)
   If variance > 2.0, flag as "SIGNIFICANT VARIANCE DETECTED"

3. CONTRADICTION FLAGS (list each cross-platform contradiction):
   Format:
   Platform A: [platform + what was said/done + date]
   Platform B: [platform + conflicting signal + date]  
   Severity: HIGH / MEDIUM / LOW
   Description: [What exactly contradicts what]

4. CONSISTENCY NARRATIVE (3–4 sentences):
   Describe how the subject presents differently or similarly across contexts. Is their professional persona consistent with their informal persona? Do their stated timelines match their actual activity patterns?

5. CROSS-LENS IMPROVEMENT RECOMMENDATION (1 actionable item):
   One specific recommendation to improve cross-platform consistency, backed by evidence from the data.

If no contradictions are found, state:
"No significant cross-platform contradictions detected. The subject's digital behavior presents a consistent profile across all analyzed connectors and contexts."
`;

      const auditKey = auditType === 'reputation' ? 'reputation' :
                       auditType === 'behavioral' ? 'behavioral' :
                       auditType === 'hiring' ? 'hiring' : 'full';

      const titles = SECTION_TITLES[auditKey];
      const execSummaryInstructions = EXECUTIVE_SUMMARY_INSTRUCTIONS[auditKey];
      const opportunitiesInstructions = OPPORTUNITIES_INSTRUCTIONS[auditKey];
      const crossLensSection = auditKey === 'full' ? CROSS_LENS_SECTION : '';

      let summarySystemPrompt = `You are a forensic intelligence analyst producing a clinical reputation audit. Your output will be read by the subject themselves — not their investor, not their recruiter. You are a mirror, not a publicist.
Tone: Cold, declarative, and direct. State what the data shows. Nothing more.
Do NOT compliment, flatter, or soften findings. No "strong foundation", no "high professionalism", no "great track record".
Do NOT use advisory language like "consider", "might want to", "could leverage".
If negative signals are zero, say so plainly — do not spin it as a positive character trait.
If commitments are zero, say so plainly using natural terminology (e.g., "no unresolved commitments were identified" rather than "0 unfulfilled commitments") — do not infer virtue from absence of data.
Every sentence must be grounded in a specific number or pattern from the data.`;

      if (auditType === 'reputation') {
        summarySystemPrompt = `You are a due diligence analyst generating a reputation audit for external investor review via EYES. Your audience is a potential investor or financial stakeholder. Focus on:
- commitment follow-through on financial/business promises
- timeline consistency across platforms
- professional language and tone in client-facing communications
- public-facing credibility signals
- any contradictions between stated milestones and actual delivery
- network quality and entity associations

Tone: Formal, objective, investor-grade language. Like a credit report meets a background check.
Do NOT compliment, flatter, or soften findings. No "strong foundation", no "high professionalism", no "great track record".`;
      } else if (auditType === 'behavioral') {
        summarySystemPrompt = `You are a behavioral analyst generating a personal self-reflection audit report for EYES. Your audience is the subject themselves. Be honest, introspective, and constructive. Focus on:
- Personal communication patterns (tone shifts, response latency)
- Late-night or off-hours activity signals
- Emotional language trends over time
- Self-consistency (do they say one thing and do another?)
- Stress indicators (dense communication bursts, deadline panic)
- Growth patterns (are things improving quarter over quarter?)

Tone: Personal, reflective, non-judgmental. Like a mirror, not a judge.
Do NOT compliment, flatter, or soften findings.`;
      } else if (auditType === 'hiring') {
        summarySystemPrompt = `You are an HR intelligence analyst generating a professional background audit via EYES. Your audience is a potential employer or recruiter. Focus on:
- Reliability and delivery consistency
- Collaboration signals (how do they communicate with teams?)
- Professional tone in work-related platforms (Slack, email, GitHub)
- Commitment-to-completion ratio
- Work hour patterns and operational discipline
- Any red flags an employer would care about

Tone: Professional, HR-appropriate, neutral but thorough. Like a structured reference check with data.
Do NOT compliment, flatter, or soften findings. No "strong foundation", no "high professionalism", no "great track record".`;
      } else if (auditType === 'full') {
        summarySystemPrompt = `You are a comprehensive reputation intelligence analyst generating a full-spectrum audit via EYES. Your audience is the subject themselves for complete self-awareness, or a trusted advisor with full access. Focus on ALL dimensions (behavioral patterns, financial/business credibility, and professional reliability) with equal weight. Tone: Comprehensive, thorough, balanced. Like a 360-degree review with full data access.
Do NOT compliment, flatter, or soften findings. No "strong foundation", no "high professionalism", no "great track record".`;
      }

      const SCORE_CONSISTENCY_RULE = `
CRITICAL CONSISTENCY RULE:
If riskScore > 0.0, you MUST generate at least one risk finding in riskFindings that explains the non-zero score.
A riskScore of > 0.0 with zero findings is a logical contradiction and will be rejected.

If truly no findings exist, riskScore MUST be exactly 0.0.
Never produce a non-zero riskScore with an empty riskFindings array.
`;

      const summaryPrompt = `
System Prompt context:
${summarySystemPrompt}

Lens instructions:
- Section 2 header: "§ 2 — ${titles.section2}"
- Section 6 header: "§ 6 — ${titles.section6}"
- Section 7 header: "§ 7 — ${titles.section7}"

EXECUTIVE SUMMARY INSTRUCTIONS:
${execSummaryInstructions}

SENTIMENT TABLE RULES (CRITICAL):
- Only generate a quarterly sentiment table if records_scanned >= 10
- If records_scanned < 10, replace the table with: "Insufficient record volume for quarterly sentiment distribution. Minimum 10 records required."
- NEVER copy sentiment numbers from one connector to another
- Each connector's sentiment must be independently calculated from its own records only
- If a connector has records but they span fewer than 2 quarters, only show the quarters that have data
- Discord with 1 record = NO sentiment table
- GitHub with 3 records = NO sentiment table
- Gmail with 877 records = FULL sentiment table

NEGATIVE SIGNALS NOTE:
If the number of "Negative signals detected" (passed in Data below) is higher than the number of items in "riskFindings" (which is capped at 5), you MUST include a parenthetical note or a sentence in the executive summary narrative clarifying this (e.g. "...with 12 negative signal instances synthesized into 5 key risk areas..."). This ensures consistency between the total count of negative records and the curated summary findings.

OPPORTUNITIES INSTRUCTIONS:
${opportunitiesInstructions}

${SCORE_CONSISTENCY_RULE}

${crossLensSection}

Data:
- Total records analysed: ${selectedRecords.length} (out of ${events.length} total database records)
- Platforms: ${connectorsCovered.join(', ')}
- Platforms and record counts: ${JSON.stringify(dbPlatformCounts)}
- Negative signals detected: ${negativeMentions}
- Unfulfilled commitments extracted: ${unfulfilledCommitmentsCount}
- Calculated baseline risk score (as reference): ${riskScore}/10
- Risk Sensitivity Config: ${riskSensitivity}
- Most mentioned entities: ${topExtractedEntities.join(', ') || 'none detected'}
- Failure rate: ${failureRate.toFixed(1)}%
- Compliance rate: ${complianceRate.toFixed(1)}%
- Scan Window: ${actualScanWindow}
- Sibling Lens Reports (for cross-lens alignment):
${siblingLensesText || 'No completed sibling lens reports found.'}
- Real Extracted Commitments: ${JSON.stringify(resolvedCommitments.slice(0, 10).map(c => ({ text: c.text, platform: c.platform, date: c.date ? c.date.split('T')[0] : 'N/A' })))}
- Real Extracted Risks/Sensitive Events: ${JSON.stringify(extractedFindings.slice(0, 10).map(f => ({ finding: f.finding, evidence: f.evidence, platform: f.platform })))}

Rules for Opportunities and Cross-Lens Section:
1. NEVER suggest opportunities for a platform/connector unless it has at least 5 records in the "Platforms and record counts" list above. Sourcing opportunities from connectors with 0 or 1 records is strictly forbidden.
2. In full audit runs, compare the findings and risk scores of the sibling lenses provided. Call out contradictions (e.g. if the Investor lens shows an 8.0 score with flagged records while another lens shows 0) explicitly.

Produce the following fields in JSON format:
1. narrative: 3-4 sentences. State what the data volume shows, what the signal distribution shows, what the risk score means, and what the single most notable pattern is. Reference specific numbers. Do not flatter. Follow the lens-specific EXECUTIVE SUMMARY INSTRUCTIONS exactly.
2. trajectory: "improving" | "stable" | "declining" — based on chronological distribution of negative signals.
3. dominantPattern: One precise behavioral descriptor. Not a compliment. Example: "high-output with sparse follow-through" or "reactive communicator with deadline sensitivity".
4. reputationProjection: 1-2 sentences. What would a skeptical external observer flag from this data? If nothing is flagged, say that plainly without framing it as praise.
5. opportunities: An array of exactly 3 objects (or 4 objects if full scan) representing specific gaps or under-leveraged patterns. Format:
   [
     {
       "title": "Short action-oriented title",
       "description": "2 sentences explaining the observed pattern and recommended action",
       "source": "Specific platform connector name (e.g. GitHub connector or Slack connector)"
     }
   ]
6. topEntities: Top 5 most frequently mentioned projects, companies, tools, or corporate entities. Use the entity list above if non-empty. Do NOT include platform/connector names (like Gmail, Slack, Discord, etc.). Do NOT include individual people's names (e.g. Tommy, Sabari, Sabarish) to protect privacy.
7. riskScore: A single floating-point number between 0.0 and 10.0 representing the final score for this lens. Make it align perfectly with your narrative and findings.
8. riskFindings: An array of up to 5 findings. If there are no actual risks, return []. Do NOT generate vague findings like "Discussion about protecting project assets" or "reputational concerns". Ground every finding in the concrete data (e.g. refer to the specific source event content or specific issue like "Slack debate about client code backup access"). For each finding, you must strictly ground it in the correct source platform as specified in the "Real Extracted Risks/Sensitive Events" list (do not mix them up or describe a Claude record as a Gmail record). For each finding, output:
   - severity: "Low" | "Medium" | "High"
   - finding: Concise, specific title (do not use generic placeholders, ground it in the data)
   - evidence: Context or event description (not just a generic string)
   - impact: Audience-specific consequence of this finding

${auditKey === 'full' ? `
9. crossLensConsistency: A mandatory object containing:
   - consistencyRating: "HIGH" | "MEDIUM" | "LOW"
   - dimensionScoreVariance: "X.X" (e.g. "1.5" representing difference between max and min dimension scores)
   - contradictionFlags: An array of objects, or [] if none. Format:
     [
       {
         "severity": "HIGH" | "MEDIUM" | "LOW",
         "platformA": "Platform name",
         "platformB": "Platform name",
         "description": "What exactly contradicts what"
       }
     ]
   - consistencyNarrative: 3-4 sentences describing how the subject presents similarly or differently across contexts.
   - improvementRecommendation: "One specific recommendation to improve cross-platform consistency, backed by evidence"
` : ''}

Return JSON ONLY (no markdown, no explanation):
{
  "narrative": "string",
  "trajectory": "improving|stable|declining",
  "dominantPattern": "string",
  "reputationProjection": "string",
  "opportunities": [
    {
      "title": "string",
      "description": "string",
      "source": "string"
    }
  ],
  "topEntities": ["string", "string", "string", "string", "string"],
  "riskScore": 2.5,
  "riskFindings": [
    {
      "severity": "High",
      "finding": "Stale deliverable timeline for client",
      "evidence": "Email to investor regarding timeline alignment",
      "impact": "Impairs external due diligence confidence"
    }
  ]
  ${auditKey === 'full' ? `,
  "crossLensConsistency": {
    "consistencyRating": "HIGH",
    "dimensionScoreVariance": "1.5",
    "contradictionFlags": [
      {
        "severity": "HIGH",
        "platformA": "Slack",
        "platformB": "Gmail",
        "description": "Subject committed to same-day delivery on Slack but sent delayed timeline on Gmail"
      }
    ],
    "consistencyNarrative": "Consistency is generally high, though informal commitments on Slack diverge from formal Gmail threads.",
    "improvementRecommendation": "Align informal delivery estimates with official project timelines."
  }` : ''}
}
      `;

      const summaryRaw = await invokeModel({
        capability: 'chat',
        messages: [{ role: 'user', content: summaryPrompt }],
        system: summarySystemPrompt,
        preference: 'auto',
        maxTokens: 4000
      });

      const summaryRawStr = typeof summaryRaw === 'string' ? summaryRaw : null;
      const summaryMatch = summaryRawStr?.match(/\{[\s\S]*\}/);
      let summaryResult: {
        narrative?: string;
        trajectory?: string;
        dominantPattern?: string;
        reputationProjection?: string;
        opportunities?: any[];
        topEntities?: string[];
        riskScore?: number;
        riskFindings?: { severity: string; finding: string; evidence: string; impact: string }[];
        crossLensConsistency?: {
          consistencyRating: string;
          dimensionScoreVariance: string;
          contradictionFlags: Array<{ severity: string; platformA: string; platformB: string; description: string }>;
          consistencyNarrative: string;
          improvementRecommendation: string;
        };
      } = { narrative: summaryRawStr ?? undefined, opportunities: [], topEntities: [] };

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
        {
          title: "Verify commitment consistency across integrations",
          description: `${complianceRate.toFixed(0)}% of records carried no negative signal — the pattern of low-risk activity is consistent but untested under high-stakes conditions.`,
          source: `${connectorsCovered.slice(0, 2).join(' + ') || 'Platform'} connector`
        },
        {
          title: "Increase thread completion discipline",
          description: `Communication volume across ${connectorsCovered.slice(0, 3).join(', ')} is measurable but the depth of follow-through on initiated threads is not fully captured in this dataset.`,
          source: `${connectorsCovered[0] || 'Platform'} connector`
        },
        {
          title: "Implement structured timeline updates",
          description: `${connectorsCovered.length} platforms are connected — cross-platform commitment consistency has not been independently verified.`,
          source: `${connectorsCovered[0] || 'Platform'} connector`
        }
      ];

      // Always calculate the risk score programmatically using our robust, platform-weighted
      // and volume-calibrated formula to ensure statistical honesty and eliminate sample bias.
      let finalRiskScore = riskScore;

      const finalFindings = (summaryResult.riskFindings && Array.isArray(summaryResult.riskFindings))
        ? [...summaryResult.riskFindings]
        : [...extractedFindings];

      // Resolve platforms for all final findings
      finalFindings.forEach((f: any) => {
        if (!f.platform) {
          const match = (f.evidence || '').match(/\b([a-f0-9]{8,36})\b/i);
          if (match) {
            const refId = match[1].toLowerCase();
            const matchedEvt = events.find(e => e.id.toLowerCase().startsWith(refId));
            if (matchedEvt) {
              f.platform = matchedEvt.platform;
              const lowerContent = ((matchedEvt.content || '') + ' ' + (matchedEvt.title || '')).toLowerCase();
              if (matchedEvt.platform === 'gmail') {
                if (lowerContent.includes('sentry') || lowerContent.includes('vercel')) {
                  f.platform = 'vercel';
                } else if (lowerContent.includes('github') || lowerContent.includes('pull request')) {
                  f.platform = 'github';
                } else if (lowerContent.includes('linear')) {
                  f.platform = 'linear';
                } else if (lowerContent.includes('clickup')) {
                  f.platform = 'clickup';
                } else if (lowerContent.includes('slack')) {
                  f.platform = 'slack';
                } else if (lowerContent.includes('discord')) {
                  f.platform = 'discord';
                }
              }
              // Force Datadog trial alerts to gmail connector
              if (lowerContent.includes('datadog') && lowerContent.includes('trial')) {
                f.platform = 'gmail';
              }
            }
          }
          if (!f.platform) {
            const textToSearch = `${f.finding} ${f.evidence} ${f.impact}`.toLowerCase();
            const knownPlatforms = ['gmail', 'slack', 'discord', 'github', 'notion', 'vercel', 'google_calendar', 'google-calendar', 'clickup', 'linear', 'claude'];
            const foundPlatform = knownPlatforms.find(p => textToSearch.includes(p));
            if (foundPlatform) {
              f.platform = foundPlatform === 'google-calendar' ? 'google_calendar' : foundPlatform;
            }
          }
        }
      });

      // Programmatic consistency guard:
      // If no risk findings exist, but finalRiskScore > 0, generate real findings based on actual user data to avoid overriding score to 0.0
      if (finalFindings.length === 0 && finalRiskScore > 0.0) {
        if (unfulfilledCommitmentsCount > 0) {
          finalFindings.push({
            severity: 'Low',
            finding: `${unfulfilledCommitmentsCount} pending commitment${unfulfilledCommitmentsCount !== 1 ? 's' : ''} detected`,
            evidence: 'Commitment ledger analysis',
            impact: 'Reputational drift indicator'
          });
        } else if (weightedNeutralMentions > 0) {
          finalFindings.push({
            severity: 'Low',
            finding: 'Baseline neutral communication patterns detected',
            evidence: 'Linguistic distribution scanning',
            impact: 'Standard baseline behavior'
          });
        } else {
          finalRiskScore = 0.0;
        }
      }

      // Build clean narrative and prevent raw JSON leakage
      let cleanNarrative = summaryResult.narrative || fallbackNarrative;
      if (cleanNarrative.trim().startsWith('{') || cleanNarrative.includes('"narrative"')) {
        const match = cleanNarrative.match(/"narrative"\s*:\s*"([^"]+)"/);
        if (match && match[1]) {
          cleanNarrative = match[1];
        } else {
          cleanNarrative = fallbackNarrative;
        }
      }
      // Stage: synth — narrative ready, writing final record
      await setStage('synth');

      if (!cleanNarrative || cleanNarrative.length < 50) {
        cleanNarrative = fallbackNarrative;
      }

      // Replace any numeric risk score mentions in narrative with the actual final score to prevent inconsistencies
      const finalScoreStr = finalRiskScore.toFixed(1);
      cleanNarrative = cleanNarrative.replace(/\b(risk score|score)\s+(?:of|is|:)?\s*\d+(\.\d+)?(?:\/10)?\b/gi, `$1 is ${finalScoreStr}/10`);
      cleanNarrative = cleanNarrative.replace(/\b\d+(\.\d+)?\/10\b/g, `${finalScoreStr}/10`);

      // PROACTIVE SELF-CORRECTING VALIDATION LAYER (Checks and aligns platforms, citations, and metrics before writing to DB)
      
      // 1. Correct findings and platform mismatches
      finalFindings.forEach((f: any) => {
        // Enforce proper capitalization of severities (Low, Medium, High)
        if (f.severity) {
          const s = f.severity.toLowerCase();
          f.severity = s === 'high' ? 'High' : s === 'medium' ? 'Medium' : 'Low';
        }
        
        // Align platform using evidence UUID first
        const match = (f.evidence || '').match(/\b([a-f0-9]{8,36})\b/i);
        let resolvedPlat = f.platform;
        if (match) {
          const refId = match[1].toLowerCase();
          const matchedEvt = events.find(e => e.id.toLowerCase().startsWith(refId));
          if (matchedEvt) {
            resolvedPlat = matchedEvt.platform;
            const lowerContent = ((matchedEvt.content || '') + ' ' + (matchedEvt.title || '')).toLowerCase();
            if (matchedEvt.platform === 'gmail') {
              if (lowerContent.includes('sentry') || lowerContent.includes('vercel')) {
                resolvedPlat = 'vercel';
              } else if (lowerContent.includes('github') || lowerContent.includes('pull request')) {
                resolvedPlat = 'github';
              } else if (lowerContent.includes('linear')) {
                resolvedPlat = 'linear';
              } else if (lowerContent.includes('clickup')) {
                resolvedPlat = 'clickup';
              } else if (lowerContent.includes('slack')) {
                resolvedPlat = 'slack';
              } else if (lowerContent.includes('discord')) {
                resolvedPlat = 'discord';
              }
            }
            if (lowerContent.includes('datadog') && lowerContent.includes('trial')) {
              resolvedPlat = 'gmail';
            }
            f.platform = resolvedPlat;
          }
        }

        // Programmatic text correction: make sure wording aligns with resolvedPlat
        if (resolvedPlat) {
          const platDisplay = resolvedPlat === 'google_calendar' || resolvedPlat === 'google-calendar'
            ? 'Google Calendar'
            : resolvedPlat.charAt(0).toUpperCase() + resolvedPlat.slice(1);

          // Replace mentions of wrong platforms (e.g. Gmail/Slack) with the correct one
          const wrongPlatforms = ['gmail', 'slack', 'discord', 'github', 'notion', 'vercel', 'google_calendar', 'clickup', 'linear', 'claude'];
          wrongPlatforms.forEach((wp) => {
            if (wp !== resolvedPlat) {
              const regexRecord = new RegExp(`\\b${wp}\\s+record\\b`, 'gi');
              const regexConnector = new RegExp(`\\b${wp}\\s+connector\\b`, 'gi');
              const regexInPlat = new RegExp(`\\bin\\s+${wp}\\b`, 'gi');
              const regexAcrossPlat = new RegExp(`\\bacross\\s+${wp}\\b`, 'gi');
              const regexViaPlat = new RegExp(`\\bvia\\s+${wp}\\b`, 'gi');

              f.finding = f.finding
                .replace(regexRecord, `${platDisplay} record`)
                .replace(regexConnector, `${platDisplay} connector`)
                .replace(regexInPlat, `in ${platDisplay}`)
                .replace(regexAcrossPlat, `across ${platDisplay}`)
                .replace(regexViaPlat, `via ${platDisplay}`);

              f.evidence = f.evidence
                .replace(regexRecord, `${platDisplay} record`)
                .replace(regexConnector, `${platDisplay} connector`)
                .replace(regexInPlat, `in ${platDisplay}`)
                .replace(regexAcrossPlat, `across ${platDisplay}`)
                .replace(regexViaPlat, `via ${platDisplay}`);
            }
          });
        }

        // Prevent vague/placeholder finding titles
        const lowerFinding = (f.finding || '').toLowerCase();
        if (lowerFinding.includes('protecting project assets') || lowerFinding.includes('reputational risk in') || lowerFinding.includes('reputational concern')) {
          if (match) {
            const refId = match[1].toLowerCase();
            const firstPassMatch = extractedFindings.find(ef => ef.evidence.toLowerCase().includes(refId));
            if (firstPassMatch && firstPassMatch.finding && !firstPassMatch.finding.toLowerCase().includes('reputational risk')) {
              f.finding = firstPassMatch.finding;
            }
          }
        }
      });

      // 2. Correct Opportunities platforms and source strings
      if (summaryResult.opportunities && Array.isArray(summaryResult.opportunities)) {
        summaryResult.opportunities.forEach((o: any) => {
          const textToSearch = `${o.title} ${o.description}`.toLowerCase();
          if (textToSearch.includes('datadog') && textToSearch.includes('trial')) {
            o.source = `Gmail connector (Record window: ${actualScanWindow})`;
            o.description = o.description.replace(/\bslack\s+connector\b/gi, 'Gmail connector').replace(/\bslack\s+record\b/gi, 'Gmail record');
          }
          // Enforce expected score reduction and priority fields are present and correctly formatted
          if (!o.priority) {
            o.priority = textToSearch.includes('vercel') || textToSearch.includes('pii') ? 'High' : 'Medium';
          }
          if (!o.scoreReduction) {
            o.scoreReduction = o.priority === 'High' ? '-0.8' : o.priority === 'Medium' ? '-0.5' : '-0.2';
          }
        });
      }

      // 3. Narrative validation & text consistency
      if (cleanNarrative) {
        const negativeSignalsText = `${negativeMentions} negative signal${negativeMentions === 1 ? '' : 's'}`;
        cleanNarrative = cleanNarrative.replace(/\b\d+\s+negative\s+(?:signals?|records?|mentions?)\b/gi, negativeSignalsText);
      }

      // 6. Persist analysis results to DB
      // Use resolvedCommitments (calendar-verified) — count only truly pending ones
      const pendingCommitmentsCount = resolvedCommitments.filter(c => c.status === 'pending').length;
      console.log(`[Audit] Commitment resolution: ${resolvedCommitments.length} total, ${pendingCommitmentsCount} pending, ${resolvedCommitments.length - pendingCommitmentsCount} completed via calendar match.`);
      console.log(`[Audit] Finalizing database record for ${auditId}...`);
      const { error: updateError } = await supabase.from('reputation_audits').update({
        status: 'completed',
        risk_score: finalRiskScore,
        mentions_count: events.length,
        commitments_count: pendingCommitmentsCount,
        summary_narrative: cleanNarrative,
        connectors_covered: connectorsCovered,
        report_url: null,
        metadata: {
          commitments: resolvedCommitments,  // ← calendar-verified statuses (pending/completed)
          riskFindings: finalFindings,
          allExtractedFindings: extractedFindings,
          topEntities: (() => {
            const rawEntities = summaryResult.topEntities || [];
            const seenEntities = new Set<string>();
            return rawEntities.filter((ent: string) => {
              if (!ent || typeof ent !== 'string') return false;
              const lower = ent.trim().toLowerCase();
              if (seenEntities.has(lower)) return false;
              seenEntities.add(lower);
              return true;
            });
          })(),
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
          crossLensConsistency: summaryResult.crossLensConsistency || null,
          platformSentiment: platformSentiment
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
