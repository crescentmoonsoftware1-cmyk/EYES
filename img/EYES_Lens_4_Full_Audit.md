# EYES Neural Memory OS
## Lens 4: Full Reputation Audit — Complete Specification

---

## PART A — PROMPT SPECIFICATION

### System Prompt

```
You are a comprehensive reputation intelligence analyst for EYES 
Neural Memory OS. Your role is to generate a full-spectrum 
Reputation Audit Certificate that covers all three lens 
dimensions simultaneously — behavioral/self, investor/reputation, 
and hiring/professional — with equal analytical weight.

YOUR AUDIENCE: The subject themselves or a trusted advisor 
with full access authorization.

YOUR ANALYSIS FOCUS (All 4 Dimensions Equally):

1. BEHAVIORAL DIMENSION:
   - Communication tone shifts, stress indicators, self-consistency
   - Off-hours activity, burnout signals, personal growth patterns

2. INVESTOR/REPUTATION DIMENSION:
   - Commitment follow-through on business promises
   - Timeline consistency, public credibility signals
   - Contradiction detection across platforms

3. PROFESSIONAL/HIRING DIMENSION:
   - Delivery reliability, team communication quality
   - Work pattern discipline, professional language consistency

4. CROSS-PLATFORM CONSISTENCY:
   - Do signals across all platforms tell the same story?
   - Are there contradictions between what the subject says 
     in different contexts?
   - Are there platform-specific anomalies vs global patterns?

YOUR TONE:
- Comprehensive, balanced, 360-degree view
- Like a full performance review with data from every angle
- Mix of personal ("you") and formal ("the subject") language 
  where appropriate per section
- Explicitly flag when lens scores diverge significantly

SCORING RULES (Full Audit — Equal Weights):
- Behavioral dimension weight: 25%
- Investor/Reputation dimension weight: 25%
- Professional/Hiring dimension weight: 25%
- Cross-platform consistency weight: 25%

Risk Score Formula:
Risk Score = min(10.0, 
  ((Negative Mentions × 2) + (Neutral Mentions × 0.5) + 
  (Unfulfilled Commitments × 3)) / Total Mentions × 10)
Apply recency weighting:
  - Last 30 days: weight 1.0
  - Last 6 months: weight 0.5
  - Older than 6 months: weight 0.2

ADDITIONAL REQUIREMENT — Cross-Lens Contradiction Report:
If any individual lens would score more than 2.0 points 
differently from the composite score, flag this in a dedicated 
Cross-Lens Contradiction section with explanation.

OUTPUT FORMAT: Return a structured JSON object matching the 
EYES Full Audit Certificate schema. Do not return plain prose.
Every section must be populated. The cross-lens comparison 
section is mandatory.
```

---

### User Prompt

```
Connector Data Input:
{connector_data}

Lens: full_reputation_audit
Subject: {subject_id}
Scan Window: {scan_start} to {scan_end}
Audit ID: {audit_id}
Generated At: {generated_at}

Instructions:
1. Analyze the provided connector data across ALL four dimensions 
   simultaneously.
2. Generate a per-dimension score in addition to the 
   composite score.
3. Identify the top 5–8 flagged records — categorized by 
   which dimension they belong to.
4. Calculate the Composite Risk Score using equal weights 
   across all 4 dimensions.
5. Generate 4 opportunities — one per dimension.
6. List all detected commitments with dimension tags.
7. Generate risk findings across all severity levels, 
   tagged by dimension.
8. Generate a Cross-Lens Consistency Report comparing 
   how the subject presents differently across contexts.
9. Return the complete full audit certificate JSON.
```

---

### Expected Output Schema

```json
{
  "audit_id": "string",
  "lens": "full_reputation_audit",
  "generated_at": "ISO timestamp",
  "scan_window": { "start": "date", "end": "date" },
  "connectors_covered": ["array of connector names"],
  "composite_risk_score": 0.0,
  "risk_label": "LOW | MEDIUM | HIGH",
  "per_dimension_scores": {
    "behavioral": 0.0,
    "investor_reputation": 0.0,
    "hiring_professional": 0.0,
    "cross_platform_consistency": 0.0
  },
  "executive_summary": {
    "total_mentions": 0,
    "sentiment_balance_positive_pct": 0,
    "unfulfilled_commitments": 0,
    "compliance_rate_pct": 100,
    "summary_text": "string — 360-degree framing"
  },
  "per_connector": [
    {
      "platform": "string",
      "category": "string",
      "records_scanned": 0,
      "indexing_window_months": 24,
      "top_entities": ["array — all entity types"],
      "quarterly_sentiment": [
        {
          "quarter": "Q3-Q4 2024",
          "positive_pct": 0,
          "neutral_pct": 0,
          "negative_pct": 0
        }
      ],
      "flagged_records": [
        {
          "excerpt": "string",
          "source": "string",
          "date": "date",
          "dimension": "behavioral | investor | professional | cross",
          "signal": "string — what this means across dimensions"
        }
      ]
    }
  ],
  "commitments": {
    "detected": [],
    "fulfilled": [],
    "unfulfilled": [],
    "by_dimension": {
      "behavioral": [],
      "investor": [],
      "professional": []
    }
  },
  "opportunities": [
    {
      "dimension": "behavioral | investor | professional | cross",
      "title": "string",
      "description": "string",
      "source_connector": "string"
    }
  ],
  "risk_findings": [
    {
      "severity": "HIGH | MEDIUM | LOW",
      "dimension": "behavioral | investor | professional | cross",
      "title": "string",
      "evidence_id": "string",
      "impact": "string — multi-dimensional impact"
    }
  ],
  "cross_lens_consistency_report": {
    "overall_consistency": "HIGH | MEDIUM | LOW",
    "dimension_score_variance": 0.0,
    "contradiction_flags": [
      {
        "description": "string — what contradicts what",
        "platform_a": "string",
        "platform_b": "string",
        "severity": "string"
      }
    ],
    "consistency_summary": "string"
  },
  "citations": [
    {
      "id": "string",
      "platform": "string",
      "date": "date",
      "excerpt": "string",
      "dimension": "string"
    }
  ],
  "cryptographic_hash": "string"
}
```

---

## PART B — FULL PDF CONTENT STRUCTURE

### Page 1 — Cover Page

```
EYES
Neural Memory OS
CONFIDENTIAL · FORENSIC RECORD

Reputation Audit Certificate

SELECTED LENS        Full Reputation Audit
PREPARED FOR         Authenticated Subject
DATE GENERATED       [Date] · [Time] UTC
SCAN WINDOW          [Start Date] – [End Date]
AUDIT ID             EYES-RA-[UUID SHORT]
SYSTEM VERSION       v1.0.0-production

COMPOSITE RISK SCORE
[SCORE] / 10.0   [RISK LABEL]

CONNECTORS COVERED
discord · gmail · github · google_calendar · slack · 
vercel · notion · clickup · linear

This report is cryptographically bound to the certificate 
identifier above and is non-transferable.

CONFIDENTIAL
```

---

### Page 2 — Executive Summary

**Section Title:** `§ 2 — 360° REPUTATIONAL PROFILE & COMPOSITE RISK ASSESSMENT`

**Content to Generate:**

```
Narrative (4–5 sentences, 360-degree framing):
- Lead with overall profile: "A full-spectrum analysis of the 
  subject's digital record across [N] platforms and [X] months 
  reveals a [profile type] pattern across all four dimensions."
- Summarize the behavioral dimension finding in one sentence
- Summarize the investor/reputation dimension finding in one sentence
- Summarize the hiring/professional dimension finding in one sentence
- Close with cross-platform consistency observation

Per-Dimension Score Grid (unique to Full Audit):
  Behavioral Dimension:           [X.X / 10.0]
  Investor / Reputation:          [X.X / 10.0]
  Hiring / Professional:          [X.X / 10.0]
  Cross-Platform Consistency:     [X.X / 10.0]
  ─────────────────────────────────────────────
  COMPOSITE RISK SCORE:           [X.X / 10.0]

Three KPI Cards:
1. Total Mentions Discovered: [number]
2. Sentiment Balance (Positive %): [number]%
3. Unfulfilled Commitments: [number]

Methodology Block (static):
Risk Score = min(10.0, ((Negative Mentions × 2) + 
(Neutral Mentions × 0.5) + (Unfulfilled Commitments × 3)) 
/ Total Mentions × 10)

Recency Weighting: Last 30 days: 1.0 | 6 months: 0.5 | 
Older: 0.2
```

---

### Pages 3–5 — Per-Connector Analysis

**Section Title:** `§ [N] — PER-CONNECTOR ANALYSIS: [PLATFORM NAME]`

**Fields per connector:**

```
PLATFORM CATEGORY:    [Social / Productivity / Development / etc.]
RECORDS SCANNED:      [number] messages/logs
INDEXING WINDOW:      24 Months (Rolling)

TOP IDENTIFIED ENTITIES:
[4 most frequently mentioned entities — all types included:
  People, projects, tools, organizations, financial terms, 
  emotional keywords]

QUARTERLY SENTIMENT DISTRIBUTION:
[Table: Quarter | Positive % | Neutral % | Negative %]
— Actual per-platform numbers

SIGNIFICANT FLAGGED RECORDS:
[3–4 records per connector, with:]
  - Excerpt
  - Source
  - Date
  - Dimension Tag: [BEHAVIORAL / INVESTOR / PROFESSIONAL / CROSS]
  - Signal: [What this means, stated from the relevant 
    dimension's perspective]

FULL AUDIT CONNECTOR SUMMARY:
[2–3 sentences covering what this connector reveals 
across ALL dimensions — not just one]
Example: "Gmail (877 records) is the highest-volume connector. 
From a behavioral perspective, tone is consistently professional 
but shows stress spikes in Q3 2025. From an investor perspective, 
3 delivery commitments lack follow-up confirmation. From a 
hiring perspective, communication is clear but deadlines were 
renegotiated twice."
```

---

### Page 6 — Commitments & Opportunities

**Section Title:** `§ 6 — COMMITMENT LEDGER & MULTI-DIMENSIONAL OPPORTUNITIES`

**Content:**

```
DETECTED COMMITMENTS (All Dimensions):
[List each commitment with:]
  - Commitment Text
  - Platform + Evidence ID + Date
  - Dimension: BEHAVIORAL / INVESTOR / PROFESSIONAL
  - Status: FULFILLED / UNFULFILLED / PENDING
  - Cross-dimension impact: [Does this commitment 
    affect multiple dimensions?]

COMMITMENT SUMMARY TABLE:
  Dimension           Total    Fulfilled    Unfulfilled
  Behavioral          [N]      [N]          [N]
  Investor            [N]      [N]          [N]
  Professional        [N]      [N]          [N]
  ─────────────────────────────────────────────────────
  TOTAL               [N]      [N]          [N]

DETECTED OPPORTUNITIES (4 items — one per dimension):

BEHAVIORAL:
  Title: [Personal growth opportunity]
  Description: [Specific behavioral change]
  Source: [Connector]

INVESTOR:
  Title: [Credibility-building opportunity]
  Description: [Specific credibility action]
  Source: [Connector]

PROFESSIONAL:
  Title: [Career development opportunity]
  Description: [Specific professional development action]
  Source: [Connector]

CROSS-PLATFORM:
  Title: [Consistency improvement opportunity]
  Description: [How to align cross-platform presence]
  Source: [Multiple connectors]
```

---

### Page 7 — Risk Findings

**Section Title:** `§ 7 — FULL-SPECTRUM RISK FINDINGS`

**Tone:** Comprehensive, balanced, multi-dimensional.

**Format per finding:**

```
[SEVERITY BADGE]  [DIMENSION TAG]  [Finding Title]
Evidence:         [Evidence ID]
Dimensions:       [Which lenses this affects]
Impact:           [Multi-dimensional impact statement]

---

Example Findings for Full Audit Lens:

HIGH    [INVESTOR + PROFESSIONAL]
        Unresolved delivery commitment on contract documents
Evidence: GML-8921
Dimensions: Investor · Professional
Impact: From an investor perspective, this represents latency 
in critical follow-through. From a professional perspective, 
it indicates a delivery reliability gap. Behaviorally, this 
pattern aligns with the subject's identified stress response 
under deadline pressure.

MEDIUM  [INVESTOR + BEHAVIORAL]
        Contradictory timeline estimates across platforms
Evidence: SLK-2940
Dimensions: Investor · Behavioral
Impact: Investor diligence concern: milestone dates conflict 
across platforms. Behavioral signal: language uncertainty 
increases when under scheduling pressure — hedging terms 
appear before timeline shifts.

MEDIUM  [PROFESSIONAL + BEHAVIORAL]
        Linguistic tone inconsistency in client deliverables
Evidence: DSC-9841
Dimensions: Professional · Behavioral
Impact: Professional concern: inconsistent formality level 
may reduce client confidence. Behavioral signal: tone shifts 
correlate with periods of high concurrent task load.

LOW     [CROSS-PLATFORM]
        Off-hours communication and delivery concentration
Evidence: GTH-7411
Dimensions: All
Impact: GitHub, Slack, and Gmail data converge to show a 
pattern of elevated activity outside business hours during 
delivery windows. This appears consistently across all three 
lens dimensions as a potential operational strain signal.
```

---

### Page 8 — Cross-Lens Consistency Report

**Section Title:** `§ 8 — CROSS-LENS CONSISTENCY ANALYSIS`

*(Unique to Full Audit — not present in any other lens)*

**Content:**

```
OVERALL CROSS-PLATFORM CONSISTENCY: [HIGH / MEDIUM / LOW]

DIMENSION SCORE VARIANCE: [X.X points]
(Variance > 2.0 = flagged for review)

CONSISTENCY NARRATIVE:
[3–4 sentences describing how the subject presents differently 
or similarly across the three lens contexts]

Example: "The subject presents a consistent behavioral pattern 
across all platforms — professional language in work contexts, 
more informal in social contexts, with stress signals appearing 
uniformly across all connectors during Q3 2025. The most notable 
cross-platform observation is that commitments made informally 
(Slack/Discord) are less consistently followed up than commitments 
made formally (Gmail). This suggests context-awareness in 
communication but a gap in informal accountability."

CONTRADICTION FLAGS:
[List any contradictions found between what the subject 
says across different platforms]

  Flag 1:
  Platform A: [Slack — stated delivery date: Oct 28]
  Platform B: [Gmail — referenced delivery date: Nov 4]
  Severity: MEDIUM
  Description: [Timeline contradiction between informal 
    and formal communication channels]

  Flag 2:
  Platform A: [Discord — "on track for delivery"]
  Platform B: [GitHub — no commits in preceding 8 days]
  Severity: MEDIUM
  Description: [Verbal status update inconsistent with 
    actual development activity]

CROSS-LENS IMPROVEMENT RECOMMENDATION:
[1 actionable recommendation to improve cross-platform 
consistency — specific and evidence-backed]
```

---

### Page 9 — Citations & Legal Notice

**Section Title:** `§ 9 — EXPLICIT DATA SOURCE CITATIONS & STATUTORY NOTICES`

**Content:**

```
SOURCE CITATIONS INDEX (All Dimensions):
[For each flagged record, with dimension tag:]
  [ID]  [PLATFORM] · [DATE]  [DIMENSION TAG]
  Excerpt: "[Short direct quote]"

DATA SOURCE DISCLOSURE (static):
[Same as Lens 1]

GDPR — ARTICLES 15 & 20 STATUTORY DISCLOSURES (static):
[Same as Lens 1]

CRYPTOGRAPHIC SIGNATURE & VERIFICATION HASH (SHA-256):
[Hash line 1]
[Hash line 2]
Audit ID: [full UUID]
Generated: [Date] · [Time] UTC

CONFIDENTIAL
```

---

## PART C — LENS-SPECIFIC DIFFERENTIATORS

| Element | What Makes Full Audit Lens Unique |
|---|---|
| Executive Summary | 4-dimension score grid + 360-degree narrative |
| Risk Findings | Tagged by dimension, multi-impact statements |
| Flagged Records | Dimension-tagged, multi-perspective signal |
| Opportunities | One per dimension (4 total) |
| Commitments | Cross-referenced across all 3 dimensions with summary table |
| Extra Page | Cross-Lens Consistency Report (Page 8) — unique to this lens |
| Connector Notes | Full 2–3 sentence multi-dimensional summary per connector |
| Score Weighting | Equal 25% across all 4 dimensions |
| Page Count | 9 pages (vs 8 for other lenses) due to Cross-Lens page |

---

## PART D — COMPARISON: ALL 4 LENSES AT A GLANCE

| Feature | Behavioral | Investor | Hiring | Full Audit |
|---|---|---|---|---|
| Audience | Self | Investors/VCs | Employers/HR | Self + Advisors |
| Tone | Personal, reflective | Formal, formal | Professional, neutral | Balanced, 360° |
| Score Weights | Self-consistency 40% | Commitment 45% | Delivery 40% | Equal 25% each |
| Flagged Record Field | Behavioral Signal | Investor Signal | Professional Signal | Dimension Tag + Signal |
| Commitment Tracking | Self + fulfillment status | Type + overdue days | Work-only + context | All + dimension tags |
| Unique Page | — | — | — | Cross-Lens Report |
| Language Framing | "You showed..." | "Records indicate..." | "The candidate..." | Mix of both |
| Opportunities Focus | Personal habits | Credibility-building | Career development | One per dimension |
| Entity Focus | People + emotions | Business + clients | Team + tools | All types |

---

*EYES Neural Memory OS · Lens 4 of 4 · Full Reputation Audit*
*Document Version: 1.0 · Classification: CONFIDENTIAL*
