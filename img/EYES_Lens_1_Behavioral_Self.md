# EYES Neural Memory OS
## Lens 1: Behavioral / Self Lens — Complete Specification

---

## PART A — PROMPT SPECIFICATION

### System Prompt

```
You are a behavioral intelligence analyst for EYES Neural Memory OS.
Your role is to generate a deeply personal, introspective Reputation 
Audit Certificate for the subject themselves — not for any external audience.

YOUR AUDIENCE: The subject (self-review, personal growth context).

YOUR ANALYSIS FOCUS:
- Communication tone shifts across time (are they becoming more 
  positive, negative, erratic?)
- Off-hours activity patterns (late-night pushes, weekend emails)
- Stress and burnout indicators (message density spikes, short responses)
- Self-consistency (do they promise things and deliver them?)
- Emotional language trends (frustration, excitement, disengagement)
- Quarter-over-quarter behavioral improvement or decline
- Personal productivity signals (task completion rates, response times)

YOUR TONE:
- Reflective, compassionate, honest
- Like a personal coach reviewing your own data with you
- Non-judgmental but clear — surface patterns without accusation
- Use "you" framing: "You showed signs of...", "Your communication 
  became more positive in..."

SCORING RULES (Behavioral Lens Weights):
- Self-consistency weight: 40%
- Sentiment trajectory weight: 30%
- Commitment follow-through weight: 20%
- Off-hours strain signals weight: 10%

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

Lens: behavioral_self
Subject: {subject_id}
Scan Window: {scan_start} to {scan_end}
Audit ID: {audit_id}
Generated At: {generated_at}

Instructions:
1. Analyze the provided connector data through the Behavioral/Self lens.
2. Extract communication tone signals, commitment patterns, 
   and off-hours activity.
3. Identify the top 3–5 flagged behavioral records with exact 
   source references.
4. Calculate the Composite Risk Score using behavioral lens weights.
5. Generate 3 personalized improvement opportunities.
6. List all detected commitments and their fulfillment status.
7. Frame all risk findings as personal growth areas, not accusations.
8. Return the complete audit certificate JSON.
```

---

### Expected Output Schema

```json
{
  "audit_id": "string",
  "lens": "behavioral_self",
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
    "summary_text": "string — behavioral/self framing"
  },
  "per_connector": [
    {
      "platform": "string",
      "category": "string",
      "records_scanned": 0,
      "indexing_window_months": 24,
      "top_entities": ["array"],
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
          "behavioral_signal": "string — what this reveals about the subject"
        }
      ]
    }
  ],
  "commitments": {
    "detected": [],
    "fulfilled": [],
    "unfulfilled": []
  },
  "opportunities": [
    {
      "title": "string — personal growth opportunity",
      "description": "string",
      "source_connector": "string"
    }
  ],
  "risk_findings": [
    {
      "severity": "HIGH | MEDIUM | LOW",
      "title": "string — framed as personal pattern, not accusation",
      "evidence_id": "string",
      "impact": "string — personal impact framing"
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

SELECTED LENS        Behavioral / Self Lens
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

**Section Title:** `§ 2 — BEHAVIORAL TRAJECTORY & SELF-AWARENESS ASSESSMENT`

**Content to Generate:**

```
Narrative (3–4 sentences, behavioral/self framing):
- Lead with the overall pattern: "Your digital behavior over the 
  past [X] months reflects a subject who..."
- Highlight the most significant behavioral trend (positive or negative)
- Note the trajectory direction (improving / declining / stable)
- Close with a constructive summary statement

Three KPI Cards:
1. Total Mentions Discovered: [number]
2. Sentiment Balance (Positive %): [number]%
3. Unfulfilled Commitments: [number]

Composite Risk Score Block:
Risk level evaluated at [X] / 10.0
[One sentence on what this means behaviorally]
[One sentence on what the baseline interactions show]

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

**Repeated for each connected platform (Discord, Gmail, GitHub, etc.)**

**Section Title:** `§ [N] — PER-CONNECTOR ANALYSIS: [PLATFORM NAME]`

**Fields per connector:**

```
PLATFORM CATEGORY:    [Social / Productivity / Development / etc.]
RECORDS SCANNED:      [number] messages/logs
INDEXING WINDOW:      24 Months (Rolling)

TOP IDENTIFIED ENTITIES:
[4 most frequently mentioned entities in that platform's data]
— For Behavioral lens: focus on people, projects, emotional keywords

QUARTERLY SENTIMENT DISTRIBUTION:
[Table: Quarter | Positive % | Neutral % | Negative %]
— Show actual per-platform numbers, NOT copy-pasted global averages

SIGNIFICANT FLAGGED RECORDS:
[2–3 records per connector, with:]
  - Excerpt (the actual message/text)
  - Source (context: sent to X / internal / public commit)
  - Date
  - Behavioral Signal: [What this reveals about the subject's 
    behavior, e.g., "Indicates stress under deadline pressure"]

BEHAVIORAL LENS NOTE:
[1 sentence unique to this connector describing the behavioral 
pattern observed on this platform specifically]
```

---

### Page 6 — Commitments & Opportunities

**Section Title:** `§ 6 — PERSONAL COMMITMENTS & GROWTH OPPORTUNITIES`

**Content:**

```
DETECTED COMMITMENTS:
[List each detected commitment with:]
  - Commitment Text
  - Platform + Date
  - Status: FULFILLED / UNFULFILLED / PENDING
  - If unfulfilled: days since commitment was made

[If none: "No open commitments detected — strong loop closure pattern."]

DETECTED OPPORTUNITIES (3 items):
Each opportunity should be:
  - Specific to behavioral patterns found in the data
  - Actionable and personal
  - Sourced to a connector

Example format:
  Title: "Reduce late-night communication spikes"
  Description: "GitHub activity shows a pattern of commits between 
    11PM–2AM, concentrated around deadline weeks. Consider batching 
    work earlier in the day to reduce cognitive strain."
  Source: GitHub connector (GTH-XXXX)

  Title: "Improve follow-through consistency on verbal promises"
  Description: "Slack and Gmail data show 3 instances of 
    commitment-language with no follow-up confirmation thread. 
    A simple reply thread confirming completion would close the loop."
  Source: Slack + Gmail connectors
```

---

### Page 7 — Risk Findings

**Section Title:** `§ 7 — PERSONAL BEHAVIORAL PATTERNS TO ADDRESS`

**Tone:** Framed as self-improvement areas, NOT as accusations.

**Format per finding:**

```
[SEVERITY BADGE]  [Finding Title]
Evidence:         [Evidence ID]
Impact:           [Personal impact — how this affects you, 
                  not how others perceive you]

---

Example Findings for Behavioral Lens:

HIGH    Recurring pattern of late-night delivery pressure
Evidence: GitHub pushes: GTH-7411
Impact: Consistently pushing commits after midnight around deadlines 
suggests a reactive work pattern. This increases error rates and 
signals scope underestimation.

MEDIUM  Promise-to-confirmation gap on client deliverables
Evidence: Email ID: GML-8921
Impact: You tend to state commitments clearly but don't always send 
a follow-up confirmation once completed. This creates ambiguity for 
collaborators.

MEDIUM  Tone inconsistency in high-stakes communication
Evidence: Slack thread: SLK-2940
Impact: Your language in Slack shows occasional hedging ("I think", 
"maybe", "kind of") in contexts where confidence would serve you better.

LOW     Communication density spikes during project transitions
Evidence: Discord: DSC-9841
Impact: Message volume increases sharply at project handoffs, 
suggesting a tendency to over-communicate under uncertainty.
```

---

### Page 8 — Citations & Legal Notice

**Section Title:** `§ 8 — EXPLICIT DATA SOURCE CITATIONS & STATUTORY NOTICES`

**Content:**

```
SOURCE CITATIONS INDEX:
[For each flagged record, one citation entry:]
  [ID]  [PLATFORM] · [DATE]
  Excerpt: "[Short direct quote from the source record]"

DATA SOURCE DISCLOSURE (static text):
This certificate has been generated using only the data sources 
you have explicitly authorized through OAuth. Citations referenced 
in this report are sourced from your authorized connectors only. 
EYES does not search the public web, query third-party data brokers, 
or enrich this report with information from sources outside your 
authorized scope.

GDPR — ARTICLES 15 & 20 STATUTORY DISCLOSURES (static text):
Pursuant to Articles 15 and 20 of the General Data Protection 
Regulation (EU 2016/679), the data analysed in this report 
constitutes your personal data, processed on your instruction. 
You have the right to access, rectify, erase, and export this 
data at any time through your EYES account. EYES does not retain 
analysis artefacts beyond the audit delivery period and does not 
use your data to train any model without your separate, explicit, 
opt-in consent.

CRYPTOGRAPHIC SIGNATURE & VERIFICATION HASH (SHA-256):
[Line 1 of hash]
[Line 2 of hash]
Audit ID: [full UUID]
Generated: [Date] · [Time] UTC

CONFIDENTIAL
```

---

## PART C — LENS-SPECIFIC DIFFERENTIATORS

| Element | What Makes Behavioral Lens Unique |
|---|---|
| Executive Summary | Uses "you" language, focuses on self-awareness |
| Risk Findings | Framed as "patterns to address", not "diligence concerns" |
| Flagged Records | Includes "Behavioral Signal" field explaining the pattern |
| Opportunities | Personal growth focused (habits, routines, communication style) |
| Commitments | Shows fulfillment status with "days since" for open items |
| Connector Notes | Each connector gets a behavioral interpretation sentence |
| Score Weighting | Self-consistency 40%, Sentiment 30%, Commitments 20%, Strain 10% |

---

*EYES Neural Memory OS · Lens 1 of 4 · Behavioral / Self Lens*
*Document Version: 1.0 · Classification: CONFIDENTIAL*
