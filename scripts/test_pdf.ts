import { PDFGenerationService } from '../src/services/audit/pdf-generator';
import { ReputationAudit } from '../src/types/dashboard';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const mockAudit: ReputationAudit = {
  id: 'test-audit-123',
  createdAt: new Date().toISOString(),
  connectorsCovered: ['gmail', 'slack', 'github'],
  mentionsCount: 1500,
  commitmentsCount: 3,
  riskScore: 6.3,
  summaryNarrative: 'The analysis of 1000 records across 3 platforms shows PII exposure detected and 1 unfulfilled commitment extracted, resulting in a Risk Score of 6.3/10.',
  status: 'completed',
  reportUrl: null,
  metadata: {
    subjectName: 'EYES V1 Release Audit',
    riskFindings: [
      { severity: 'Medium', finding: 'PII exposure: Email addresses detected in gmail', evidence: 'Source event: 1', impact: 'Potential PII compliance exposure.' },
      { severity: 'Medium', finding: 'PII exposure: Full legal names detected in gmail', evidence: 'Source event: 2', impact: 'Potential PII compliance exposure.' },
      { severity: 'Medium', finding: 'PII exposure: Phone numbers (intl.) detected in gmail', evidence: 'Source event: 3', impact: 'Potential PII compliance exposure.' }
    ],
    complianceRate: '85.00',
    failureRate: '15.00',
    topEntities: [],
    sentimentBalance: 1.0,
    unfulfilledCommitments: 0,
    commitments: [
      { text: "I will push the latest code by Thursday afternoon", status: "completed", platform: "github", date: "2026-06-01T15:30:00Z", citation: "git-1" },
      { text: "Will email the draft copy tomorrow morning", status: "completed", platform: "gmail", date: "2026-05-28T09:00:00Z", citation: "gmail-1" },
      { text: "I'll review the pull request by end of day today", status: "pending", platform: "slack", date: "2026-06-02T10:00:00Z", citation: "slack-1" }
    ],
    opportunities: [
      'Mobile Responsiveness: Implemented full mobile responsiveness (390px viewport support) for the dashboard.',
      'System Status Page: Built a brand-new, public-facing Health Status page (/status) to monitor connectors.',
      'Production Tracking: Installed and configured Sentry for production error tracking.'
    ]
  }
};

async function generate() {
  console.log('Generating PDF...');
  const url = await PDFGenerationService.generateAndUpload(mockAudit, 'test-user');
  console.log('PDF Generated! URL:', url);
}

generate().catch(console.error);
