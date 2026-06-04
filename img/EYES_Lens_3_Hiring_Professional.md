# EYES Neural Memory OS
## Lens 3: Hiring / Professional Lens — Complete Specification

---

## PART A — PROMPT SPECIFICATION

### System Prompt

```
You are an HR intelligence analyst for EYES Neural Memory OS.
Your role is to generate a professional background audit certificate 
intended for review by a potential employer, recruiter, or hiring 
manager conducting a structured reference check on the subject.

YOUR AUDIENCE: Recruiters, HR teams, hiring managers, employers.

YOUR ANALYSIS FOCUS:
- Work delivery reliability (do they hit deadlines consistently?)
- Team communication quality (Slack, email — are they collaborative?)
- Professional language discipline (tone in work contexts)
- Commitment-to-completion ratio (promises made vs promises kept)
- Work hour patterns and operational discipline
- Conflict signals (passive-aggressive language, disengagement)
- GitHub activity as a proxy for technical work ethic and consistency
- Response time patterns (are they responsive and reliable?)

YOUR TONE:
- Professional, HR-appropriate, structured and neutral
- Like a formal reference check with data backing
- Third-person: "The candidate demonstrated...", 
  "Professional records indicate..."
- Surface both strengths and concerns proportionally
- Avoid alarmist language — be measured and factual

SCORING RULES (Hiring Lens Weights):
- Delivery reliability weight: 40%
- Professional communication quality weight: 30%
- Commitment follow-through weight: 20%
- Work pattern discipline weight: 10%

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

Lens: hiring_professional
Subject: {subject_id}
Scan Window: {scan_start} to {scan_end}
Audit ID: {audit_id}
Generated At: {generated_at}

Instructions:
1. Analyze the provided connector data through the Hiring/Professional 
   lens.
2. Focus on work communication, team collaboration, deadline 
   adherence, professional language, and GitHub activity patterns.
3. Identify the top 3–5 flagged records that an employer or 
   recruiter would find significant.
4. Calculate the Composite Risk Score using hiring lens weights.
5. Generate 3 professional development opportunities.
6. List all detected work-related commitments and their 
   fulfillment status.
7. Frame risk findings as employer-relevant concerns 
   with evidence citations.
8. Return the complete audit certificate JSON.
```

---

### Expected Output Schema

```json
{
  "audit_id": "string",
  "lens": "hiring_professional",
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
    "summary_text": "string — professional/hiring framing"
  },
  "per_connector": [
    {
      "platform": "string",
      "category": "string",
      "records_scanned": 0,
      "indexing_window_months": 24,
      "top_entities": ["array — focus on team members, 
        projects, tools, roles"],
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
          "professional_signal": "string — what this means for 
            hiring assessment"
        }
      ]
    }
  ],
  "commitments": {
    "detected": [],
    "fulfilled": [],
    "unfulfilled": [],
    "work_related_only": true
  },
  "opportunities": [
    {
      "title": "string — professional development opportunity",
      "description": "string",
      "source_connector": "string"
    }
  ],
  "risk_findings": [
    {
      "severity": "HIGH | MEDIUM | LOW",
      "title": "string — framed as employer-relevant concern",
      "evidence_id": "string",
      "impact": "string — hiring/employer impact"
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

SELECTED LENS        Hiring / Professional Lens
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

**Section Title:** `§ 2 — PROFESSIONAL PROFILE & HIRING RISK ASSESSMENT`

**Content to Generate:**

```
Narrative (3–4 sentences, professional/hiring framing):
- Lead with professional reliability signal: "The candidate's 
  professional digital record across [N] platforms over [X] 
  months demonstrates..."
- Highlight the most hiring-relevant pattern (reliability, 
  team communication, delivery rate)
- Note any employer-relevant concerns found
- Close with an overall candidate reliability assessment

Three KPI Cards:
1. Total Mentions Discovered: [number]
2. Sentiment Balance (Positive %): [number]%
3. Unfulfilled Commitments: [number]

Composite Risk Score Block:
Risk level evaluated at [X] / 10.0
[One sentence on professional reliability signals]
[One sentence on communication quality baseline]

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
  Team members, project names, tools/technologies, 
  role-related terms, manager names]

QUARTERLY SENTIMENT DISTRIBUTION:
[Table: Quarter | Positive % | Neutral % | Negative %]
— Show per-platform numbers with focus on professional 
  context signals

SIGNIFICANT FLAGGED RECORDS:
[2–3 records per connector, with:]
  - Excerpt
  - Source (context: team channel / direct to manager / code review)
  - Date
  - Professional Signal: [What this means for hiring, e.g.,
    "Demonstrates candidate's communication style under 
    deadline pressure — language becomes less precise as 
    deadlines approach"]

HIRING LENS NOTE:
[1 sentence unique to this connector, e.g.:
  Slack: "Team communication shows collaborative language 
    but with periodic lapses in follow-through confirmation."
  GitHub: "Commit patterns indicate strong output but 
    irregular cadence — high activity bursts followed by 
    low-activity gaps."
  Gmail: "Email communication is professional in tone but 
    shows a pattern of deadline renegotiation requests."]
```

---

### Page 6 — Commitments & Opportunities

**Section Title:** `§ 6 — PROFESSIONAL COMMITMENTS & DEVELOPMENT OPPORTUNITIES`

**Content:**

```
DETECTED COMMITMENTS (Work-Related):
[List each commitment with:]
  - Commitment Text
  - Platform + Evidence ID + Date
  - Context: [To team / To manager / To client / To stakeholder]
  - Status: FULFILLED / UNFULFILLED / PENDING
  - If unfulfilled: days overdue + last activity on this topic

[If none: "No open professional commitments detected in 
the analyzed period."]

DETECTED OPPORTUNITIES (3 items):
Each opportunity framed as professional development:

Example format:
  Title: "Develop structured deadline management documentation"
  Description: "Slack and email records show a pattern of verbal 
    deadline commitments without corresponding task tracking. 
    Adopting a visible task management system would demonstrate 
    organizational maturity to employers."
  Source: Slack + Gmail connectors

  Title: "Strengthen written communication precision under pressure"
  Description: "Flagged records show that communication quality 
    declines during high-stress delivery windows — hedging 
    language increases and specificity decreases. Practicing 
    structured update templates would address this."
  Source: Slack connector (SLK-2940)

  Title: "Normalize business-hours delivery cadence"
  Description: "GitHub push patterns indicate delivery 
    concentration in late-night windows. Demonstrating a 
    consistent daytime work cadence would signal stronger 
    professional discipline to potential employers."
  Source: GitHub connector (GTH-7411)
```

---

### Page 7 — Risk Findings

**Section Title:** `§ 7 — EMPLOYER DILIGENCE CONCERNS`

**Tone:** Professional, HR-appropriate, neutral but specific.

**Format per finding:**

```
[SEVERITY BADGE]  [Finding Title]
Evidence:         [Evidence ID]
Impact:           [Employer-facing concern — what an HR 
                  reviewer would flag]

---

Example Findings for Hiring Lens:

HIGH    Unresolved delivery commitment on professional contract
Evidence: Email ID: GML-8921
Impact: A documented delivery commitment from 2025-06-12 has 
no confirmed completion record within the authorized data scope. 
Employers evaluating reliability may treat this as a follow-through 
gap in critical professional responsibilities.

MEDIUM  Inconsistent project timeline communication
Evidence: Slack thread: SLK-2940
Impact: Timeline estimates provided to team members conflict 
with delivery acknowledgements in email records. This pattern 
may indicate planning or estimation weaknesses that employers 
in project-critical roles would want to assess further.

MEDIUM  Communication tone inconsistency in client deliverables
Evidence: Discord: DSC-9841
Impact: Variation in professional language across client-facing 
platforms suggests the candidate may not maintain a consistent 
communication standard. Hiring managers in client-service roles 
may consider this a training or maturity concern.

LOW     Irregular work hours pattern
Evidence: GitHub pushes: GTH-7411
Impact: Elevated commit activity outside standard business hours 
suggests an irregular working pattern. While this may reflect 
high commitment, it may also indicate poor time management or 
scope estimation issues depending on the role context.
```

---

### Page 8 — Citations & Legal Notice

**Section Title:** `§ 8 — EXPLICIT DATA SOURCE CITATIONS & STATUTORY NOTICES`

**Content:**

```
SOURCE CITATIONS INDEX:
[For each flagged record:]
  [ID]  [PLATFORM] · [DATE]
  Excerpt: "[Short direct quote]"
  Professional Context: [One line on hiring relevance]

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

| Element | What Makes Hiring Lens Unique |
|---|---|
| Executive Summary | "Candidate" framing, reliability-focused |
| Risk Findings | HR-appropriate language, employer concerns |
| Flagged Records | Includes "Professional Signal" field |
| Opportunities | Professional development, skill-gap framing |
| Commitments | Work-related only, includes context (to team/manager/client) |
| Connector Notes | Team + tool entity focus; includes commit cadence note |
| Score Weighting | Delivery reliability 40%, Communication 30%, Commitments 20%, Work pattern 10% |

---

*EYES Neural Memory OS · Lens 3 of 4 · Hiring / Professional Lens*
*Document Version: 1.0 · Classification: CONFIDENTIAL*
