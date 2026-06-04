# EYES Neural Memory OS
## Lens 2: Investor / Reputation Lens — Complete Specification

---

## PART A — PROMPT SPECIFICATION

### System Prompt

```
You are a due diligence intelligence analyst for EYES Neural Memory OS.
Your role is to generate a formal Reputation Audit Certificate 
intended for review by potential investors, financial stakeholders, 
or business partners conducting due diligence on the subject.

YOUR AUDIENCE: External investors, VCs, angels, business partners.

YOUR ANALYSIS FOCUS:
- Commitment follow-through on financial and business promises
- Timeline consistency — did stated milestones match actual delivery?
- Professional credibility signals across client-facing platforms
- Contradiction detection — conflicting statements about deliverables
- Entity associations — who does the subject communicate with 
  professionally?
- Public-facing language quality and consistency
- Patterns that would concern an investor (missed deadlines, 
  scope changes, escalating pressure)

YOUR TONE:
- Formal, objective, investor-grade language
- Like a credit report meets a professional background check
- Third-person neutral: "The subject demonstrated...", 
  "Records indicate..."
- Present findings with evidence IDs for traceability
- Do not editorialize — state findings and let evidence speak

SCORING RULES (Investor Lens Weights):
- Commitment follow-through weight: 45%
- Timeline contradiction penalty weight: 30%
- Sentiment trajectory weight: 15%
- Entity association quality weight: 10%

Risk Score Formula:
Risk Score = min(10.0, 
  ((Negative Mentions × 2) + (Neutral Mentions × 0.5) + 
  (Unfulfilled Commitments × 3)) / Total Mentions × 10)
Apply recency weighting:
  - Last 30 days: weight 1.0
  - Last 6 months: weight 0.5
  - Older than 6 months: weight 0.2

OUTPUT FORMAT: Return a structured JSON object matching the 
EYES Audit Certificate schema. Do not return plain prose.
Every section must be populated. Do not leave any field as null 
unless data is genuinely absent.
```

---

### User Prompt

```
Connector Data Input:
{connector_data}

Lens: investor_reputation
Subject: {subject_id}
Scan Window: {scan_start} to {scan_end}
Audit ID: {audit_id}
Generated At: {generated_at}

Instructions:
1. Analyze the provided connector data through the Investor/Reputation 
   lens.
2. Focus specifically on financial language, business commitments, 
   client-facing communications, and milestone tracking.
3. Identify the top 3–5 flagged records that an investor would 
   find significant — missed promises, timeline contradictions, 
   or strong credibility signals.
4. Calculate the Composite Risk Score using investor lens weights.
5. Generate 3 credibility-building opportunities.
6. List all detected commitments with fulfillment status and 
   days-overdue where applicable.
7. Frame risk findings as investor-relevant diligence concerns 
   with formal evidence citations.
8. Return the complete audit certificate JSON.
```

---

### Expected Output Schema

```json
{
  "audit_id": "string",
  "lens": "investor_reputation",
  "generated_at": "ISO timestamp",
  "scan_window": { "start": "date", "end": "date" },
  "connectors_covered": ["array of connector names"],
  "composite_risk_score": 0.0,
  "risk_label": "LOW | MEDIUM | HIGH",
  "executive_summary": {
    "total_mentions": 0,
    "sentiment_balance_positive_pct": 0,
    "unfulfilled_commitments": 0,
    "compliance_rate_pct": 100,
    "summary_text": "string — investor/credibility framing"
  },
  "per_connector": [
    {
      "platform": "string",
      "category": "string",
      "records_scanned": 0,
      "indexing_window_months": 24,
      "top_entities": ["array — focus on business/client entities"],
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
          "investor_signal": "string — what this means for 
            investability/credibility"
        }
      ]
    }
  ],
  "commitments": {
    "detected": [],
    "fulfilled": [],
    "unfulfilled": [],
    "overdue_by_days": {}
  },
  "opportunities": [
    {
      "title": "string — credibility-building opportunity",
      "description": "string",
      "source_connector": "string"
    }
  ],
  "risk_findings": [
    {
      "severity": "HIGH | MEDIUM | LOW",
      "title": "string — framed as investor diligence concern",
      "evidence_id": "string",
      "impact": "string — investor-facing impact description"
    }
  ],
  "citations": [
    {
      "id": "string",
      "platform": "string",
      "date": "date",
      "excerpt": "string"
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

SELECTED LENS        Investor / Reputation Lens
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

**Section Title:** `§ 2 — REPUTATIONAL STANDING & INVESTOR DILIGENCE ASSESSMENT`

**Content to Generate:**

```
Narrative (3–4 sentences, investor/credibility framing):
- Lead with overall investability signal: "The subject's digital 
  record across [N] platforms over [X] months indicates..."
- Highlight the most investor-relevant pattern (commitment rate, 
  timeline consistency, client communication quality)
- Note any contradictions or credibility gaps found
- Close with an overall investability summary statement

Three KPI Cards:
1. Total Mentions Discovered: [number]
2. Sentiment Balance (Positive %): [number]%
3. Unfulfilled Commitments: [number]

Composite Risk Score Block:
Risk level evaluated at [X] / 10.0
[One sentence on investability signals]
[One sentence on commitment consistency baseline]

Methodology Block (static, same across all lenses):
Risk Score = min(10.0, ((Negative Mentions × 2) + 
(Neutral Mentions × 0.5) + (Unfulfilled Commitments × 3)) 
/ Total Mentions × 10)

Recency Weighting:
- Last 30 days: 1.0
- Last 6 months: 0.5
- Older than 6 months: 0.2
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
[4 most frequently mentioned entities — focus on:
  Business names, client names, investor names, 
  financial terms, product names]

QUARTERLY SENTIMENT DISTRIBUTION:
[Table: Quarter | Positive % | Neutral % | Negative %]
— Show actual per-platform numbers relevant to 
  business/investor communications

SIGNIFICANT FLAGGED RECORDS:
[2–3 records per connector, with:]
  - Excerpt
  - Source (context: sent to client / investor call / board update)
  - Date
  - Investor Signal: [What this means for credibility, e.g., 
    "Confirms subject made a binding verbal commitment to a 
    delivery date that was not met per subsequent records"]

INVESTOR LENS NOTE:
[1 sentence unique to this connector describing the investor-
relevant pattern — e.g., "Gmail shows consistent client 
communication but with 3 instances of deadline renegotiation 
over 12 months."]
```

---

### Page 6 — Commitments & Opportunities

**Section Title:** `§ 6 — COMMITMENT LEDGER & REPUTATIONAL LEVERAGE OPPORTUNITIES`

**Content:**

```
DETECTED COMMITMENTS (Investor-Relevant Only):
[List each commitment with:]
  - Commitment Text (exact or paraphrased from source)
  - Platform + Evidence ID + Date
  - Type: FINANCIAL / DELIVERY / PARTNERSHIP / TIMELINE
  - Status: FULFILLED / UNFULFILLED / PENDING
  - If unfulfilled: days overdue

[If none: "No material commitments detected in the analyzed period."]

DETECTED OPPORTUNITIES (3 items):
Each opportunity framed as a credibility-building action:

Example format:
  Title: "Establish a public milestone tracking record"
  Description: "The subject has made several delivery commitments 
    via email and Slack without a corresponding public or 
    documented tracking trail. Publishing milestone progress, 
    even internally, would strengthen investor confidence in 
    execution capacity."
  Source: Gmail + Slack connectors

  Title: "Formalize client communication tone"
  Description: "Current client communications show informal 
    language patterns (e.g., 'we'll make it up') that may 
    reduce credibility during investor due diligence reviews."
  Source: Slack connector (SLK-2940)

  Title: "Build consistent off-hours communication discipline"
  Description: "GitHub activity patterns suggest irregular delivery 
    cadence. Demonstrating a consistent, scheduled work pattern 
    would signal operational maturity to investors."
  Source: GitHub connector
```

---

### Page 7 — Risk Findings

**Section Title:** `§ 7 — INVESTOR DILIGENCE CONCERNS`

**Tone:** Formal, evidence-backed, investor-audience language.

**Format per finding:**

```
[SEVERITY BADGE]  [Finding Title]
Evidence:         [Evidence ID]
Impact:           [Investor-facing impact — what this means 
                  for due diligence]

---

Example Findings for Investor Lens:

HIGH    Unresolved commitment to deliver contract documents
Evidence: Email ID: GML-8921
Impact: A binding delivery commitment made on 2025-06-12 shows 
no subsequent confirmation of completion in the 
authorized data scope. This represents latency in critical 
professional follow-through that may concern investors 
evaluating operational reliability.

MEDIUM  Contradictory timeline estimates across platforms
Evidence: Slack thread: SLK-2940
Impact: Milestone dates stated in Slack conflict with delivery 
dates referenced in Gmail threads. This inconsistency creates 
ambiguity regarding real project timelines and may raise 
questions about planning accuracy during investor diligence.

MEDIUM  Informal language in client-facing communications
Evidence: Discord: DSC-9841
Impact: Use of informal hedging language in client deliverable 
discussions may reduce the subject's perceived professionalism 
in formal investor due diligence review.

LOW     Irregular delivery cadence (off-hours commit pattern)
Evidence: GitHub pushes: GTH-7411
Impact: Elevated GitHub push activity outside core business hours 
may indicate reactive delivery rather than planned execution — 
a pattern that investors may interpret as operational strain.
```

---

### Page 8 — Citations & Legal Notice

**Section Title:** `§ 8 — EXPLICIT DATA SOURCE CITATIONS & STATUTORY NOTICES`

**Content:**

```
SOURCE CITATIONS INDEX:
[For each flagged record:]
  [ID]  [PLATFORM] · [DATE]
  Excerpt: "[Short direct quote from source]"
  Relevance: [One line on investor relevance]

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

| Element | What Makes Investor Lens Unique |
|---|---|
| Executive Summary | Third-person, investability framing |
| Risk Findings | Formal diligence language with evidence IDs |
| Flagged Records | Includes "Investor Signal" field |
| Opportunities | Credibility-building, investor-facing actions |
| Commitments | Includes commitment TYPE (financial/delivery/partnership) |
| Connector Notes | Business/client entity focus in top entities |
| Score Weighting | Commitment follow-through 45%, Contradiction 30%, Sentiment 15%, Entity 10% |

---

*EYES Neural Memory OS · Lens 2 of 4 · Investor / Reputation Lens*
*Document Version: 1.0 · Classification: CONFIDENTIAL*
