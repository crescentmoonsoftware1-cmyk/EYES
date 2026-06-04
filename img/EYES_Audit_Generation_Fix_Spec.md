# EYES Audit Generation — Conditional Branching Logic
## Complete Fix for All 5 Issues

---

## FIX 1 — Section Title (Lens-Conditional)

### Problem
Every lens generates: `§ 2 — BEHAVIORAL TRAJECTORY & RISK ASSESSMENT`

### Solution — Prompt Injection

In your prompt builder, before sending to Claude, inject the 
correct section title based on lens:

```javascript
// prompt_builder.js

const SECTION_TITLES = {
  behavioral_self: {
    section2: "BEHAVIORAL TRAJECTORY & SELF-AWARENESS ASSESSMENT",
    section6: "PERSONAL COMMITMENTS & GROWTH OPPORTUNITIES",
    section7: "PERSONAL BEHAVIORAL PATTERNS TO ADDRESS",
  },
  investor_reputation: {
    section2: "REPUTATIONAL STANDING & INVESTOR DILIGENCE ASSESSMENT",
    section6: "COMMITMENT LEDGER & REPUTATIONAL LEVERAGE OPPORTUNITIES",
    section7: "INVESTOR DILIGENCE CONCERNS",
  },
  hiring_professional: {
    section2: "PROFESSIONAL PROFILE & HIRING RISK ASSESSMENT",
    section6: "PROFESSIONAL COMMITMENTS & DEVELOPMENT OPPORTUNITIES",
    section7: "EMPLOYER DILIGENCE CONCERNS",
  },
  full_reputation_audit: {
    section2: "360° REPUTATIONAL PROFILE & COMPOSITE RISK ASSESSMENT",
    section6: "COMMITMENT LEDGER & MULTI-DIMENSIONAL OPPORTUNITIES",
    section7: "FULL-SPECTRUM RISK FINDINGS",
  },
};

function getSectionTitles(lens) {
  return SECTION_TITLES[lens] || SECTION_TITLES["behavioral_self"];
}
```

Then inject into your prompt:
```javascript
const titles = getSectionTitles(lens);

const systemPrompt = `
...
SECTION TITLES TO USE (mandatory — do not change these):
- Section 2 header: "${titles.section2}"
- Section 6 header: "${titles.section6}"
- Section 7 header: "${titles.section7}"
...
`;
```

---

## FIX 2 — Executive Summary Narrative (Lens-Conditional)

### Problem
All 4 lenses produce near-identical executive summary paragraphs.

### Solution — Lens-Specific Narrative Instructions

Add this block to your system prompt, branched by lens:

```javascript
// executive_summary_instructions.js

const EXECUTIVE_SUMMARY_INSTRUCTIONS = {

  behavioral_self: `
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

  investor_reputation: `
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

  hiring_professional: `
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

  full_reputation_audit: `
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

function getExecutiveSummaryInstructions(lens) {
  return EXECUTIVE_SUMMARY_INSTRUCTIONS[lens] 
    || EXECUTIVE_SUMMARY_INSTRUCTIONS["behavioral_self"];
}
```

---

## FIX 3 — Quarterly Sentiment (Per-Connector, Not Copy-Pasted)

### Problem
Discord (1 record) and GitHub (3 records) show identical 
sentiment tables to Gmail (877 records). Statistically impossible.

### Solution A — Don't Generate Sentiment for Low-Record Connectors

```javascript
// sentiment_rules.js

const SENTIMENT_RULES = {
  // Minimum records required to generate a sentiment table
  MIN_RECORDS_FOR_SENTIMENT: 10,

  // What to show when below threshold
  BELOW_THRESHOLD_MESSAGE: 
    "Insufficient record volume for quarterly sentiment analysis. " +
    "Minimum 10 records required per quarter.",

  // Connectors with known low record counts — skip sentiment table
  LOW_VOLUME_CONNECTORS: ["discord", "github", "vercel", "linear"],
};

function shouldGenerateSentiment(platform, recordCount) {
  if (recordCount < SENTIMENT_RULES.MIN_RECORDS_FOR_SENTIMENT) {
    return false;
  }
  return true;
}
```

Add this to your system prompt:

```javascript
const sentimentInstruction = `
QUARTERLY SENTIMENT TABLE RULES (CRITICAL):
- Only generate a sentiment table if records_scanned >= 10
- If records_scanned < 10, replace the table with:
  "Insufficient record volume for quarterly sentiment 
   distribution. Minimum 10 records required."
- NEVER copy sentiment numbers from one connector to another
- Each connector's sentiment must be independently calculated 
  from its own records only
- If a connector has records but they span fewer than 2 quarters,
  only show the quarters that have data
- Discord with 1 record = NO sentiment table
- GitHub with 3 records = NO sentiment table
- Gmail with 877 records = FULL sentiment table
`;
```

### Solution B — Per-Connector Sentiment Calculation (Backend)

If you're computing sentiment before sending to Claude, 
pass per-connector pre-computed values:

```javascript
// connector_data_builder.js

function buildConnectorPayload(connectorName, records) {
  const recordCount = records.length;
  
  // Only compute sentiment if enough records
  const sentimentData = recordCount >= 10 
    ? computeQuarterlySentiment(records)  // your existing function
    : null;

  return {
    platform: connectorName,
    records_scanned: recordCount,
    sentiment_available: sentimentData !== null,
    quarterly_sentiment: sentimentData,
    // Pass null explicitly so Claude knows not to fabricate
    sentiment_note: sentimentData === null 
      ? `Only ${recordCount} record(s) available — sentiment 
         table not generated.`
      : null,
  };
}
```

In your prompt:
```javascript
`For each connector in the data payload:
- If quarterly_sentiment is null, show the sentiment_note 
  instead of a table
- If quarterly_sentiment has data, render it as a table
- NEVER invent sentiment numbers — use only what is provided`
```

---

## FIX 4 — Full Audit Cross-Lens Consistency Report (Missing Page)

### Problem
Full Audit lens is missing its unique Cross-Lens page 8.

### Solution — Add to Full Audit System Prompt Only

```javascript
// full_audit_extra_section.js

const CROSS_LENS_SECTION = `
MANDATORY SECTION FOR FULL AUDIT ONLY — § 8 CROSS-LENS CONSISTENCY:

You MUST generate a Cross-Lens Consistency Report as § 8 of 
the Full Reputation Audit. This section does NOT appear in 
any other lens. It must contain:

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
   Describe how the subject presents differently or similarly 
   across contexts. Is their professional persona consistent 
   with their informal persona? Do their stated timelines 
   match their actual activity patterns?

5. CROSS-LENS IMPROVEMENT RECOMMENDATION (1 actionable item):
   One specific recommendation to improve cross-platform 
   consistency, backed by evidence from the data.

If no contradictions are found, state:
"No significant cross-platform contradictions detected. 
The subject's digital behavior presents a consistent profile 
across all analyzed connectors and contexts."

This section MUST appear on its own page between Risk Findings 
and Citations. The Full Audit PDF should be 9 pages, not 8.
`;

// Only inject this for full_reputation_audit lens
function getCrossLensSection(lens) {
  if (lens === "full_reputation_audit") {
    return CROSS_LENS_SECTION;
  }
  return ""; // Empty string for all other lenses
}
```

---

## FIX 5 — Opportunities (Evidence-Backed, Not Generic)

### Problem
Opportunities like "Expanding platform usage to increase 
visibility" are vague and not grounded in actual connector data.

### Solution — Force Evidence-Backed Opportunities

```javascript
// opportunities_instructions.js

const OPPORTUNITIES_INSTRUCTIONS = {

  behavioral_self: `
OPPORTUNITY GENERATION RULES (Behavioral Lens):
Generate exactly 3 opportunities. Each must:
- Be grounded in a SPECIFIC signal found in the connector data
- Reference a specific connector by name (not just "Verified Platform")
- Be actionable — describe a concrete behavior change
- Use "you" language
- Follow this format:
  Title: [Short action-oriented title]
  Description: [2 sentences: what the data shows + what to do about it]
  Source: [Specific connector name] (Evidence: [ID if available])

BAD example (do not do this):
  "Expanding platform usage to increase visibility"
  Source: Verified Platform Connector

GOOD example:
  Title: "Shift late-night commits to daytime delivery windows"
  Description: "GitHub activity shows a recurring pattern of 
    commits between 11PM–2AM during deadline weeks. Scheduling 
    a 'code freeze by 6PM' personal rule would reduce error 
    risk and signal more sustainable work habits."
  Source: GitHub connector
`,

  investor_reputation: `
OPPORTUNITY GENERATION RULES (Investor Lens):
Generate exactly 3 opportunities. Each must:
- Address a specific credibility gap found in the data
- Reference a specific connector and evidence ID
- Frame the action as trust-building for an external investor
- Use formal language
- Follow this format:
  Title: [Short credibility-building title]
  Description: [2 sentences: what the gap is + what to do]
  Source: [Specific connector] (Evidence: [ID])

GOOD example:
  Title: "Establish documented milestone confirmation trail"
  Description: "Gmail records show 3 delivery commitments 
    without follow-up confirmation emails. Sending a brief 
    'milestone completed' note upon each delivery would 
    create an auditable commitment-closure record for 
    investor diligence."
  Source: Gmail connector (Evidence: GML-8921)
`,

  hiring_professional: `
OPPORTUNITY GENERATION RULES (Hiring Lens):
Generate exactly 3 opportunities. Each must:
- Address a specific professional pattern from the data
- Reference a specific connector and context
- Be framed as a career development action
- Use "candidate" or direct professional language
- Follow this format:
  Title: [Short professional development title]
  Description: [2 sentences: observed pattern + recommended action]
  Source: [Specific connector]

GOOD example:
  Title: "Implement structured delivery update templates"
  Description: "Slack records show deadline renegotiations 
    occurred twice without a structured status update to 
    stakeholders. Adopting a weekly 3-line status template 
    ('Done / In Progress / Blocked') would demonstrate 
    professional communication discipline."
  Source: Slack connector
`,

  full_reputation_audit: `
OPPORTUNITY GENERATION RULES (Full Audit Lens):
Generate exactly 4 opportunities — one per dimension.
Each must reference specific connector data.
Tag each opportunity with its dimension:
  [BEHAVIORAL] / [INVESTOR] / [PROFESSIONAL] / [CROSS-PLATFORM]

GOOD example:
  [BEHAVIORAL]
  Title: "Reduce reactive delivery pressure patterns"
  Description: "GitHub and Slack data show correlated spikes 
    in late-night activity and hedging language. Building 
    buffer time into personal project schedules would 
    reduce both stress signals."
  Source: GitHub + Slack connectors

  [CROSS-PLATFORM]
  Title: "Align informal and formal commitment language"
  Description: "Discord and Slack show informal commitment 
    phrasing ('I'll get to it') that doesn't appear in Gmail's 
    more formal confirmation threads. Standardizing commitment 
    language across all platforms would improve cross-context 
    consistency."
  Source: Discord + Slack + Gmail connectors
`,

};

function getOpportunitiesInstructions(lens) {
  return OPPORTUNITIES_INSTRUCTIONS[lens] 
    || OPPORTUNITIES_INSTRUCTIONS["behavioral_self"];
}
```

---

## MASTER PROMPT BUILDER — Putting It All Together

```javascript
// master_prompt_builder.js

import { getSectionTitles } from "./prompt_builder.js";
import { getExecutiveSummaryInstructions } 
  from "./executive_summary_instructions.js";
import { getCrossLensSection } from "./full_audit_extra_section.js";
import { getOpportunitiesInstructions } 
  from "./opportunities_instructions.js";

export function buildAuditPrompt(lens, connectorData, auditMeta) {
  const titles = getSectionTitles(lens);
  const execSummaryInstructions = getExecutiveSummaryInstructions(lens);
  const crossLensSection = getCrossLensSection(lens);
  const opportunitiesInstructions = getOpportunitiesInstructions(lens);

  const systemPrompt = `
You are an intelligence analyst for EYES Neural Memory OS.
Generate a Reputation Audit Certificate for the "${lens}" lens.

════════════════════════════════════════════
SECTION TITLES (USE EXACTLY AS WRITTEN):
════════════════════════════════════════════
Section 2: § 2 — ${titles.section2}
Section 6: § 6 — ${titles.section6}
Section 7: § 7 — ${titles.section7}

════════════════════════════════════════════
EXECUTIVE SUMMARY INSTRUCTIONS:
════════════════════════════════════════════
${execSummaryInstructions}

════════════════════════════════════════════
SENTIMENT TABLE RULES:
════════════════════════════════════════════
- Only generate a quarterly sentiment table if records_scanned >= 10
- If records_scanned < 10, show:
  "Insufficient record volume for quarterly sentiment analysis."
- NEVER copy sentiment numbers across connectors
- Each connector's sentiment is independent

════════════════════════════════════════════
OPPORTUNITIES INSTRUCTIONS:
════════════════════════════════════════════
${opportunitiesInstructions}

════════════════════════════════════════════
${crossLensSection}
════════════════════════════════════════════

GLOBAL RULES (apply to all lenses):
- Risk score formula: 
  min(10.0, ((Neg×2) + (Neutral×0.5) + (Unfulfilled×3)) 
  / Total × 10)
- Recency weights: 30d=1.0, 6mo=0.5, older=0.2
- If no risks found: say "NO SIGNIFICANT RISK FINDINGS DETECTED"
- If no flagged records: say "NO SIGNIFICANT RISK RECORDS DETECTED"
- NEVER fabricate evidence IDs or excerpts
- NEVER copy data between connectors
- Return structured JSON matching the audit certificate schema
`;

  const userPrompt = `
Connector Data:
${JSON.stringify(connectorData, null, 2)}

Audit Metadata:
- Lens: ${lens}
- Audit ID: ${auditMeta.auditId}
- Scan Window: ${auditMeta.scanStart} to ${auditMeta.scanEnd}
- Generated At: ${auditMeta.generatedAt}
- Subject: ${auditMeta.subjectId}

Generate the complete audit certificate now.
`;

  return { systemPrompt, userPrompt };
}
```

---

## QUICK REFERENCE — What Each Fix Targets

| Fix | Issue | Solution |
|---|---|---|
| Fix 1 | Section titles identical across lenses | `SECTION_TITLES` map injected per lens |
| Fix 2 | Executive summary sounds the same | `EXECUTIVE_SUMMARY_INSTRUCTIONS` branched per lens |
| Fix 3 | Sentiment copy-pasted across connectors | Min-record threshold + per-connector null handling |
| Fix 4 | Full Audit missing Cross-Lens page | `CROSS_LENS_SECTION` injected only for full_reputation_audit |
| Fix 5 | Opportunities are vague/generic | Forced evidence-backed format with connector + evidence ID |

---

## IMPLEMENTATION ORDER (Do in This Sequence)

```
1. Fix 3 first — Sentiment  
   (most visible data quality issue, breaks trust in the report)

2. Fix 1 — Section titles  
   (quick win, 1 map object, immediately visible)

3. Fix 2 — Executive summary narrative  
   (medium effort, high impact on report identity)

4. Fix 5 — Opportunities  
   (requires connector data to flow through properly)

5. Fix 4 last — Cross-Lens page  
   (depends on all other fixes being stable first)
```

---

*EYES Neural Memory OS · Audit Generation Fix Spec*
*Document Version: 1.0 · Classification: INTERNAL DEV*
