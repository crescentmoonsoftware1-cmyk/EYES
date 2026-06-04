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
        } catch { }
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

      if (auditType === 'reputation') {
        commitmentKeywords = /\b(will|i'll|we'll|i will|we will|i'll|going to|plan to|planning to|need to|have to|should|must|shall|promised|commit|deadline|by (monday|tuesday|wednesday|thursday|friday|saturday|sunday|eod|eow|next week|tomorrow)|follow.?up|send|review|check|handle|take care|responsible for|assigned|action item|todo|to.do)\b/i;
        sensitiveKeywords = /\b(salary|budget|invoice|payment|debt|legal|lawsuit|confidential|private|conflict|fired|quit|resign|burnout|stressed|anxiety|urgent|critical|emergency|overdue|missed|failed|broke|broken|issue|problem|complaint|dispute|disagree|contradiction|unfulfilled|diligence)\b/i;
        lensInstruction = '\n- Lens is INVESTOR / REPUTATION: You are analyzing for potential financial/business investors. Focus on identifying unfulfilled business/financial commitments, timeline contradictions between statements/milestones, client-facing conflicts, and external reputational risks. Do NOT flag minor personal stress/burnout or internal team discussions unless they pose a direct risk to investor confidence.';
      } else if (auditType === 'behavioral') {
        commitmentKeywords = /\b(will|i'll|we'll|i will|we will|i'll|going to|plan to|planning to|need to|have to|should|must|shall|promised|commit|deadline|by (monday|tuesday|wednesday|thursday|friday|saturday|sunday|eod|eow|next week|tomorrow)|follow.?up|send|review|check|handle|take care|responsible for|assigned|action item|todo|to.do)\b/i;
        sensitiveKeywords = /\b(overdue|missed|failed|delay|late|incomplete|broken|pending|cancel|deadline|drift|dropped|slip|loops)\b/i;
        lensInstruction = '\n- Lens is BEHAVIORAL / SELF: You are analyzing for the subject themselves to build self-awareness. Focus on personal execution drift, stress/burnout indicators, late-night activity, emotional communication tone shifts, and task loop follow-through. Ignore external investor/diligence concerns.';
      } else if (auditType === 'hiring') {
        commitmentKeywords = /\b(will|i'll|we'll|i will|we will|i'll|going to|plan to|planning to|need to|have to|should|must|shall|promised|commit|deadline|by (monday|tuesday|wednesday|thursday|friday|saturday|sunday|eod|eow|next week|tomorrow)|follow.?up|send|review|check|handle|take care|responsible for|assigned|action item|todo|to.do)\b/i;
        sensitiveKeywords = /\b(burnout|stressed|anxiety|angry|happy|sad|depressed|excited|furious|love|hate|dislike|upset|mad|frustrated|annoyed|disappoint|glad|awesome|terrible|bad|good|worst|best|conflict|disagree|quit|resign|fired)\b/i;
        lensInstruction = '\n- Lens is HIRING / PROFESSIONAL: You are analyzing for a potential recruiter or employer. Focus on reliability, professional tone/communication hygiene, team collaboration friction, and workplace red flags (e.g. unprofessional language or erratic patterns). Ignore personal self-reflection or external investment diligence metrics.';
      } else {
        lensInstruction = '\n- Lens is FULL REPUTATION AUDIT: Provide a comprehensive and balanced extraction of all commitments, timeline contradictions, team communication friction, stress/burnout, and regulatory/diligence risks across all dimensions.';
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

      const riskScore = Math.min(10, Number((((weightedNegativeMentions * 2) + (weightedNeutralMentions * 0.5) + (weightedUnfulfilledCommitments * 3)) / (weightedTotalMentions || 1) * 10).toFixed(1)));
      const failureRate = events.length > 0 ? (negativeMentions / events.length) * 100 : 0;
      const complianceRate = 100 - failureRate;

      // 4. Reputation Projection: pattern-level narrative across time
      // Collect all entities extracted per-record for the summary prompt, excluding connector/platform names
      const EXCLUDED_ENTITIES = new Set([
        'gmail', 'slack', 'discord', 'github', 'notion', 'vercel', 'google_calendar', 'google-calendar', 'clickup', 'linear',
        'email', 'calendar', 'message', 'messages', 'chat', 'chats', 'system', 'connector', 'connectors', 'eyes'
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
    "source": "[Specific platform name] connector (Record window: [Quarter/Year range of data, e.g. Q1-Q2 2025])"
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
    "source": "[Specific platform name] connector (Record window: [Quarter/Year range of data, e.g. Q1-Q2 2025])"
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
    "source": "[Specific platform name] connector (Record window: [Quarter/Year range of data, e.g. Q1-Q2 2025])"
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
    "source": "[Specific platform name] connector (Record window: [Quarter/Year range of data, e.g. Q1-Q2 2025])"
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
        summarySystemPrompt = `You are a due diligence analyst generating a reputation audit for external investor review via the EYES Neural Memory OS platform. Your audience is a potential investor or financial stakeholder. Focus on:
- commitment follow-through on financial/business promises
- timeline consistency across platforms
- professional language and tone in client-facing communications
- public-facing credibility signals
- any contradictions between stated milestones and actual delivery
- network quality and entity associations

Tone: Formal, objective, investor-grade language. Like a credit report meets a background check.
Do NOT compliment, flatter, or soften findings. No "strong foundation", no "high professionalism", no "great track record".`;
      } else if (auditType === 'behavioral') {
        summarySystemPrompt = `You are a behavioral analyst generating a personal self-reflection audit report for the EYES Neural Memory OS platform. Your audience is the subject themselves. Be honest, introspective, and constructive. Focus on:
- Personal communication patterns (tone shifts, response latency)
- Late-night or off-hours activity signals
- Emotional language trends over time
- Self-consistency (do they say one thing and do another?)
- Stress indicators (dense communication bursts, deadline panic)
- Growth patterns (are things improving quarter over quarter?)

Tone: Personal, reflective, non-judgmental. Like a mirror, not a judge.
Do NOT compliment, flatter, or soften findings.`;
      } else if (auditType === 'hiring') {
        summarySystemPrompt = `You are an HR intelligence analyst generating a professional background audit via the EYES Neural Memory OS platform. Your audience is a potential employer or recruiter. Focus on:
- Reliability and delivery consistency
- Collaboration signals (how do they communicate with teams?)
- Professional tone in work-related platforms (Slack, email, GitHub)
- Commitment-to-completion ratio
- Work hour patterns and operational discipline
- Any red flags an employer would care about

Tone: Professional, HR-appropriate, neutral but thorough. Like a structured reference check with data.
Do NOT compliment, flatter, or soften findings. No "strong foundation", no "high professionalism", no "great track record".`;
      } else if (auditType === 'full') {
        summarySystemPrompt = `You are a comprehensive reputation intelligence analyst generating a full-spectrum audit via the EYES Neural Memory OS platform. Your audience is the subject themselves for complete self-awareness, or a trusted advisor with full access. Focus on ALL dimensions (behavioral patterns, financial/business credibility, and professional reliability) with equal weight. Tone: Comprehensive, thorough, balanced. Like a 360-degree review with full data access.
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

OPPORTUNITIES INSTRUCTIONS:
${opportunitiesInstructions}

${SCORE_CONSISTENCY_RULE}

${crossLensSection}

Data:
- Total records analysed: ${events.length}
- Platforms: ${connectorsCovered.join(', ')}
- Negative signals detected: ${negativeMentions}
- Unfulfilled commitments extracted: ${unfulfilledCommitmentsCount}
- Computed baseline risk score (as reference): ${riskScore}/10
- Most mentioned entities: ${topExtractedEntities.join(', ') || 'none detected'}
- Failure rate: ${failureRate.toFixed(1)}%
- Compliance rate: ${complianceRate.toFixed(1)}%

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
6. topEntities: Top 5 most frequently mentioned people, projects, companies, or tools. Use the entity list above if non-empty. Do NOT include platform/connector names (like Gmail, Slack, Discord, etc.) as entities.
7. riskScore: A single floating-point number between 0.0 and 10.0 representing the final score for this lens. Make it align perfectly with your narrative and findings.
8. riskFindings: An array of up to 5 findings. If there are no actual risks, return []. For each finding, output:
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
        preference: 'auto'
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

      // Use AI-generated score and findings if available, else fall back to calculated metrics
      let finalRiskScore = (summaryResult.riskScore !== undefined && typeof summaryResult.riskScore === 'number')
        ? Math.min(10, Math.max(0, Number(summaryResult.riskScore.toFixed(1))))
        : riskScore;

      const finalFindings = (summaryResult.riskFindings && Array.isArray(summaryResult.riskFindings))
        ? summaryResult.riskFindings
        : extractedFindings;

      // Programmatic consistency guard:
      // If no risk findings exist, the risk score MUST be exactly 0.0.
      if (!finalFindings || finalFindings.length === 0) {
        finalRiskScore = 0.0;
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
        summary_narrative: (summaryResult.narrative && summaryResult.narrative.length > 100)
          ? summaryResult.narrative
          : fallbackNarrative,
        connectors_covered: connectorsCovered,
        report_url: null,
        metadata: {
          commitments: resolvedCommitments,  // ← calendar-verified statuses (pending/completed)
          riskFindings: finalFindings,
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
          crossLensConsistency: summaryResult.crossLensConsistency || null
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
