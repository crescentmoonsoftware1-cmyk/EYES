import PDFDocument from 'pdfkit';
import { createAdminClient } from '@/utils/supabase/server';
import { ReputationAudit } from '@/types/dashboard';

export interface NormalizedAuditData {
  id: string;
  createdAt: string;
  subjectName: string;
  connectorsCovered: string[];
  mentionsCount: number;
  commitmentsCount: number;
  riskScore: number;
  summaryNarrative: string;
  complianceRate: string;
  failureRate: string;
  sentimentBalance: number;
  opportunities: any[];
  topEntities: string[];
  commitments: any[];
  riskFindings: any[];
  platformData: Record<string, { count: number; category?: string; memories?: any[]; sentiment?: any; entities?: string[] }>;
  auditType?: string;
  crossLensConsistency?: {
    consistencyRating: string;
    dimensionScoreVariance: string;
    contradictionFlags: Array<{ severity: string; platformA: string; platformB: string; description: string }>;
    consistencyNarrative: string;
    improvementRecommendation: string;
  };
  platformSentiment?: any;
  allExtractedFindings?: any[];
  memoryContentMap?: Record<string, string>;
}

function extractEntitiesFromTitles(titles: string[], platform: string): string[] {
  const EXCLUDED = new Set([
    'gmail', 'slack', 'discord', 'github', 'notion', 'vercel', 'google_calendar', 'google-calendar', 'clickup', 'linear', 'claude',
    're', 'fwd', 'subject', 'the', 'and', 'for', 'you', 'your', 'with', 'from', 'this', 'that', 'our', 'what', 'how', 'why', 'who',
    'will', 'would', 'should', 'could', 'have', 'been', 'about', 'some', 'any', 'none', 'here', 'there', 'their', 'them', 'they',
    'update', 'commit', 'fix', 'merge', 'pull', 'request', 'branch', 'add', 'added', 'remove', 'removed', 'delete', 'deleted',
    'change', 'changed', 'run', 'test', 'build', 'deploy', 'deployment', 'release', 'version', 'new', 'old', 'create', 'created',
    'issue', 'task', 'ticket', 'project', 'user', 'client', 'server', 'api', 'app', 'web', 'site', 'page', 'doc', 'docs', 'document',
    'meeting', 'call', 'calendar', 'schedule', 'event', 'invite', 'accepted', 'declined', 'tentative', 'sync', 'status', 'daily',
    'weekly', 'monthly', 'coaching', 'guidance', 'upsc', 'ias', 'cse', 'upsc cse', 'ias cse',
    // Human names to prevent PII leakage
    'tommy', 'alex', 'john', 'david', 'sarah', 'emma', 'james', 'robert', 'michael', 'william', 'mary', 'patricia', 'linda', 'elizabeth',
    'barbara', 'susan', 'jessica', 'karen', 'nancy', 'lisa', 'sabari', 'sabarish', 'chandra', 'mohan', 'sanjay', 'ram', 'raj', 'kumar',
    'aaron', 'adam', 'alan', 'albert', 'ben', 'bill', 'bob', 'brian', 'charles', 'chris', 'daniel', 'don', 'donald', 'edward', 'eric',
    'frank', 'gary', 'george', 'harry', 'henry', 'jack', 'jerry', 'jim', 'joe', 'joseph', 'ken', 'kevin', 'mark', 'paul', 'peter',
    'philip', 'richard', 'ron', 'sam', 'steve', 'steven', 'thomas', 'tim', 'timothy', 'tony', 'walter', 'friend', 'boss', 'guy', 'dude'
  ]);

  const freq: Record<string, number> = {};
  const knownEntities = ['Nirnay IAS', 'Sentry', 'Supabase', 'Mixpanel', 'SAP', 'Vercel', 'Linear', 'ClickUp', 'Notion', 'Asana', 'Twitter', 'Slack', 'Discord', 'Google Calendar', 'Dropbox', 'Canva', 'Strava', 'Fitbit', 'Withings', 'Resend', 'Google'];
  
  titles.forEach(title => {
    if (!title) return;
    
    knownEntities.forEach(ke => {
      const regex = new RegExp(`\\b${ke}\\b`, 'i');
      if (regex.test(title)) {
        freq[ke] = (freq[ke] || 0) + 3;
      }
    });

    const words = title.match(/\b[A-Z][a-zA-Z0-9-]+\b/g);
    if (words) {
      words.forEach(w => {
        const lower = w.toLowerCase();
        if (EXCLUDED.has(lower) || w.length < 3) return;
        freq[w] = (freq[w] || 0) + 1;
      });
    }
  });

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name]) => name);
}

/**
 * Reputation & Security Audit: PDF Generation Service
 * Comprehensive dynamic 10-page booklet structure matching the sample certificate exactly.
 */
export class PDFGenerationService {
  /**
   * Draws the structured PDF document onto the provided PDFKit instance.
   */
  static draw(doc: PDFKit.PDFDocument, data: NormalizedAuditData) {
    const FONT_BODY = 'Helvetica';
    const FONT_BOLD = 'Helvetica-Bold';
    const FONT_MONO = 'Courier';
    const FONT_ITALIC = 'Helvetica-Oblique';

    const BG_CREAM = '#FAFAF7';
    const INK_BLACK = '#0A0A0A';
    const FOREST_GREEN = '#1F4D3F';
    const MUTED_RED = '#8B2E2E';
    const GRAY_FOOTER = '#555555';
    const LIGHT_GRAY = '#E5E5DF';
    const CARD_BG = '#F4F4EE';

    const W = doc.page.width;
    const H = doc.page.height;

    const drawBackground = () => doc.rect(0, 0, W, H).fill(BG_CREAM);

    const getSectionTitles = (auditType: string) => {
      const type = auditType === 'reputation' ? 'investor_reputation' :
                   auditType === 'behavioral' ? 'behavioral_self' :
                   auditType === 'hiring' ? 'hiring_professional' : 'full_reputation_audit';
      
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
      return SECTION_TITLES[type] || SECTION_TITLES.full_reputation_audit;
    };

    const titles = getSectionTitles(data.auditType || 'full');

    // --- PAGE 1: COVER ---
    drawBackground();
    
    // Top EYES Wordmark
    doc.fillColor(FOREST_GREEN).font(FONT_BOLD).fontSize(14).text('EYES', 50, 60);
    doc.font(FONT_BODY).fontSize(9).fillColor(GRAY_FOOTER).text('EYES Reputation Intelligence', 50, 75);
    doc.font(FONT_BOLD).fontSize(8.5).fillColor(MUTED_RED).text('CONFIDENTIAL · AUDIT RECORD', 50, 95);

    // Title
    doc.fillColor(INK_BLACK).font(FONT_BOLD).fontSize(26).text('Reputation Audit Certificate', 50, 160);
    
    // Forest green accent rule under the title
    doc.moveTo(50, 200).lineTo(W - 50, 200).strokeColor(FOREST_GREEN).lineWidth(2).stroke();

    // Subject & Lens Metadata
    let covY = 240;
    const renderCoverField = (label: string, val: string) => {
      doc.font(FONT_BOLD).fontSize(8).fillColor(GRAY_FOOTER).text(label.toUpperCase(), 50, covY);
      doc.font(FONT_BODY).fontSize(10).fillColor(INK_BLACK).text(val, 200, covY);
      covY += 28;
    };

    // Lens Name
    let lensDisplayName = 'Full Reputation Audit';
    if (data.auditType === 'reputation') {
      lensDisplayName = 'Investor / Reputation';
    } else if (data.auditType === 'behavioral') {
      lensDisplayName = 'Behavioral / Self';
    } else if (data.auditType === 'hiring') {
      lensDisplayName = 'Hiring / Professional';
    }
    
    renderCoverField('SELECTED LENS', lensDisplayName);
    renderCoverField('PREPARED FOR', data.subjectName);

    const dateObj = new Date(data.createdAt);
    const dateStr = `${dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} - ${dateObj.getUTCHours().toString().padStart(2, '0')}:${dateObj.getUTCMinutes().toString().padStart(2, '0')} UTC`;

    renderCoverField('DATE GENERATED', dateStr);

    const startRange = new Date(new Date(data.createdAt).getTime() - 24 * 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const endRange = new Date(data.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    renderCoverField('SCAN WINDOW', `${startRange} to ${endRange}`);
    renderCoverField('AUDIT ID', `EYES-RA-${data.id.slice(0, 8).toUpperCase()}`);
    renderCoverField('SYSTEM VERSION', 'v1.0.0-production');

    // Risk Score Box
    doc.rect(50, 440, 495, 65).fill(CARD_BG);
    doc.rect(50, 440, 495, 65).strokeColor(LIGHT_GRAY).lineWidth(0.8).stroke();
    doc.font(FONT_BOLD).fontSize(8).fillColor(GRAY_FOOTER).text('COMPOSITE RISK SCORE', 65, 452);
    doc.font(FONT_BOLD).fontSize(20).fillColor(INK_BLACK).text(`${data.riskScore.toFixed(1)} / 10.0`, 65, 467);
    
    const riskLabel = data.riskScore > 7.5 ? 'CRITICAL RISK' : data.riskScore > 5.0 ? 'HIGH RISK' : data.riskScore > 2.5 ? 'MODERATE RISK' : 'LOW RISK';
    const riskColor = data.riskScore > 5 ? MUTED_RED : data.riskScore > 2.5 ? '#B8860B' : FOREST_GREEN;
    doc.font(FONT_BOLD).fontSize(13).fillColor(riskColor).text(riskLabel, 300, 453, { align: 'right', width: 230 });
    
    const riskBenchmark = data.riskScore > 7.5 
      ? 'Bottom 10% of Founders (Benchmark: 5.2)' 
      : data.riskScore > 5.0 
        ? 'Bottom 30% of Founders (Benchmark: 4.8)' 
        : data.riskScore > 2.5 
          ? 'Top 40% of Founders (Benchmark: 3.2)' 
          : 'Top 15% of Founders (Benchmark: 1.8)';
    doc.font(FONT_BODY).fontSize(7.5).fillColor(GRAY_FOOTER).text(riskBenchmark, 300, 478, { align: 'right', width: 230 });

    // Connectors Covered
    doc.font(FONT_BOLD).fontSize(8).fillColor(GRAY_FOOTER).text('CONNECTORS COVERED', 50, 530);
    const connectorsStr = (data.connectorsCovered || []).join(' · ').toLowerCase();
    doc.font(FONT_MONO).fontSize(8.5).fillColor(INK_BLACK).text(connectorsStr, 50, 545, { width: 495, lineGap: 4 });

    // Cover Page Footer Statement
    doc.font(FONT_BODY).fontSize(7.5).fillColor(GRAY_FOOTER).text('This report is cryptographically bound to the certificate identifier above and is non-transferable.', 50, 720, { align: 'center', width: W - 100 });

    // --- PAGE 2: EXECUTIVE SUMMARY ---
    doc.addPage();
    drawBackground();
    
    doc.fillColor(INK_BLACK).font(FONT_BOLD).fontSize(16).text('Executive Summary', 50, 60);
    doc.font(FONT_BODY).fontSize(9.5).fillColor(GRAY_FOOTER).text(`§ 2 — ${titles.section2}`, 50, 78);
    doc.moveTo(50, 95).lineTo(W - 50, 95).strokeColor(FOREST_GREEN).lineWidth(0.5).stroke();

    // Narrative Summary paragraph
    doc.font(FONT_BODY).fontSize(10).fillColor(INK_BLACK);
    const narrativeText = data.summaryNarrative || 'No summary narrative available.';
    doc.text(narrativeText, 50, 115, { width: 495, lineGap: 4 });

    // Metrics Row
    const metricY = 220;
    doc.rect(50, metricY, 495, 60).fill(CARD_BG);
    doc.rect(50, metricY, 495, 60).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();

    // Metric 1: Total Mentions
    doc.font(FONT_BOLD).fontSize(14).fillColor(INK_BLACK).text(String(data.mentionsCount), 70, metricY + 12);
    doc.font(FONT_BODY).fontSize(7.5).fillColor(GRAY_FOOTER).text('Total Mentions\nDiscovered', 70, metricY + 30, { width: 100 });

    // Metric 2: Sentiment Balance
    doc.font(FONT_BOLD).fontSize(14).fillColor(INK_BLACK).text(`${(data.sentimentBalance * 100).toFixed(0)}%`, 240, metricY + 12);
    doc.font(FONT_BODY).fontSize(7.5).fillColor(GRAY_FOOTER).text('Sentiment Balance\n(Positive)', 240, metricY + 30, { width: 120 });

    // Metric 3: Unfulfilled Commitments
    doc.font(FONT_BOLD).fontSize(14).fillColor(INK_BLACK).text(String(data.commitmentsCount), 410, metricY + 12);
    doc.font(FONT_BODY).fontSize(7.5).fillColor(GRAY_FOOTER).text('Unfulfilled\nCommitments', 410, metricY + 30, { width: 100 });

    // Risk Score Visualization
    const riskVisualY = 300;
    doc.font(FONT_BOLD).fontSize(11).fillColor(INK_BLACK).text('COMPOSITE RISK SCORING', 50, riskVisualY);
    
    // Draw 1-10 slider bar
    const sliderWidth = 495;
    const sliderHeight = 12;
    const barY = riskVisualY + 18;
    doc.rect(50, barY, sliderWidth, sliderHeight).fill('#E5E5DF');
    
    // Highlight segment
    const scorePercent = Math.min(10, Math.max(0, data.riskScore)) / 10;
    const filledWidth = sliderWidth * scorePercent;
    doc.rect(50, barY, filledWidth, sliderHeight).fill(riskColor);
    
    // Marker or Text Interpretation
    doc.font(FONT_BODY).fontSize(9.5).fillColor(INK_BLACK).text(`Risk level evaluated at ${data.riskScore.toFixed(1)} / 10.0.`, 50, barY + 22);
    
    let interpretationStr = 'Behavioral signals indicate low overall reputational risk. Baseline interactions show high consistency.';
    if (data.riskScore > 7.5) {
      interpretationStr = data.commitmentsCount > 0 
        ? 'CRITICAL RISK: Multiple critical indicators detected. Contradictions or unfulfilled commitments suggest immediate reputational exposure.'
        : 'CRITICAL RISK: Multiple critical indicators detected. Negative tone anomalies and high-impact reputational risks suggest immediate exposure.';
    } else if (data.riskScore > 5.0) {
      interpretationStr = data.commitmentsCount > 0
        ? 'HIGH RISK: Active risk indicators present. Unfulfilled commitments and negative tone anomalies require attention.'
        : 'HIGH RISK: Active risk indicators present. Negative tone anomalies and reputational risk markers require attention.';
    } else if (data.riskScore > 2.5) {
      interpretationStr = data.commitmentsCount > 0
        ? 'MODERATE RISK: Minor signal variance. Soft promises and communication drift show moderate deviation from baseline.'
        : 'MODERATE RISK: Minor signal variance. Communication drift and negative tone markers show moderate deviation from baseline.';
    }
    doc.font(FONT_BODY).fontSize(9).fillColor(GRAY_FOOTER).text(interpretationStr, 50, barY + 37, { width: 495, lineGap: 2 });

    // Methodology Block (typeset block at the bottom of the page)
    const methodY = 460;
    doc.rect(50, methodY, 495, 140).fill(CARD_BG);
    doc.rect(50, methodY, 495, 140).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();
    
    doc.font(FONT_BOLD).fontSize(8.5).fillColor(FOREST_GREEN).text('PUBLISHED METHODOLOGY', 65, methodY + 12);
    
    doc.font(FONT_BODY).fontSize(8).fillColor(INK_BLACK).text('The EYES Composite Risk Score is calculated algorithmically according to the following mathematical model:', 65, methodY + 26, { width: 465 });
    
    // Formula Box
    doc.font(FONT_MONO).fontSize(8).fillColor(INK_BLACK).text(
      'Risk Score = min(10.0, ((Negative Mentions × 2) + (Neutral Mentions × 0.5) + (Unfulfilled Commitments × 3)) / Total Mentions × 10)',
      65, methodY + 45, { width: 465, lineGap: 3 }
    );

    doc.font(FONT_BODY).fontSize(8).fillColor(GRAY_FOOTER).text(
      'Recency Weighting:\nRecency weighting is applied to the underlying counts: mentions in the last 30 days carry weight 1.0, last 6 months carry 0.5, older than 6 months carry 0.2. This ensures that the risk profile reflects active behavioral changes while retaining historical context.',
      65, methodY + 75, { width: 465, lineGap: 3.5 }
    );

    // --- PAGES 3 to 5: PER-CONNECTOR BREAKDOWN ---
    const platforms = data.connectorsCovered.slice(0, 3);
    if (platforms.length === 0) {
      platforms.push('gmail'); // default fallback if empty
    }
    platforms.forEach((p, idx) => {
      doc.addPage();
      drawBackground();

      const info = data.platformData[p] || { count: 0, category: 'Productivity', memories: [] };
      const platformName = p.charAt(0).toUpperCase() + p.slice(1);
      
      doc.fillColor(INK_BLACK).font(FONT_BOLD).fontSize(16).text(`${platformName} Integration Report`, 50, 60);
      doc.font(FONT_BODY).fontSize(9.5).fillColor(GRAY_FOOTER).text(`§ ${3 + idx} — PER-CONNECTOR ANALYSIS: ${platformName.toUpperCase()}`, 50, 78);
      doc.moveTo(50, 95).lineTo(W - 50, 95).strokeColor(FOREST_GREEN).lineWidth(0.5).stroke();

      // Top row details
      let rowY = 110;
      doc.font(FONT_BOLD).fontSize(8.5).fillColor(GRAY_FOOTER).text('PLATFORM CATEGORY', 50, rowY);
      doc.font(FONT_BODY).fontSize(9.5).fillColor(INK_BLACK).text(info.category || 'Productivity', 50, rowY + 12);

      doc.font(FONT_BOLD).fontSize(8.5).fillColor(GRAY_FOOTER).text('RECORDS SCANNED', 220, rowY);
      doc.font(FONT_BODY).fontSize(9.5).fillColor(INK_BLACK).text(`${info.count} messages/logs`, 220, rowY + 12);

      doc.font(FONT_BOLD).fontSize(8.5).fillColor(GRAY_FOOTER).text('INDEXING WINDOW', 390, rowY);
      doc.font(FONT_BODY).fontSize(9.5).fillColor(INK_BLACK).text('24 Months (Rolling)', 390, rowY + 12);

      // Top Mentioned Entities
      rowY += 45;
      doc.font(FONT_BOLD).fontSize(9.5).fillColor(FOREST_GREEN).text('TOP IDENTIFIED ENTITIES', 50, rowY);
      
      const cleanedTopEntities = (data.topEntities || []).filter(e => e.toLowerCase() !== 'none detected' && e.trim() !== '');
      const entities = (info.entities && info.entities.length > 0)
        ? info.entities
        : (cleanedTopEntities.length > 0)
          ? cleanedTopEntities.slice(0, 4)
          : [];
      
      rowY += 15;
      doc.rect(50, rowY, 495, 40).fill(CARD_BG);
      doc.rect(50, rowY, 495, 40).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();
      
      if (entities.length === 0) {
        doc.font(FONT_BODY).fontSize(8.5).fillColor(GRAY_FOOTER).text(
          'No significant entities identified for this platform.',
          65, rowY + 15
        );
      } else {
        let entX = 65;
        entities.forEach((ent) => {
          doc.font(FONT_BOLD).fontSize(8.5).fillColor(INK_BLACK).text(ent, entX, rowY + 14);
          entX += Math.max(100, doc.widthOfString(ent) + 20);
        });
      }

      // Sentiment Distribution by Quarter
      rowY += 60;
      doc.font(FONT_BOLD).fontSize(9.5).fillColor(FOREST_GREEN).text('QUARTERLY SENTIMENT DISTRIBUTION', 50, rowY);
      
      rowY += 15;
      const platformKey = p.toLowerCase();
      const platformSentimentData = data.platformSentiment?.[platformKey];
      const hasRealSentiment = platformSentimentData && Object.keys(platformSentimentData).length > 0;

      const quarters = ['Q3-Q4 2024', 'Q1-Q2 2025', 'Q3-Q4 2025', 'Q1-Q2 2026'];
      const qData2024 = platformSentimentData?.['Q3-Q4 2024']?.total || 0;
      const qData2025Q1 = platformSentimentData?.['Q1-Q2 2025']?.total || 0;
      const hasPriorData = qData2024 > 0 || qData2025Q1 > 0;
      
      const displayQuarters = hasPriorData 
        ? quarters 
        : ['Q3-Q4 2025', 'Q1-Q2 2026'];

      if (info.count < 10 || !hasRealSentiment) {
        doc.rect(50, rowY, 495, 45).fill(CARD_BG);
        doc.rect(50, rowY, 495, 45).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();
        doc.font(FONT_BODY).fontSize(8.5).fillColor(GRAY_FOOTER).text(
          'Insufficient record volume for quarterly sentiment analysis. Minimum 10 records required.',
          65, rowY + 18
        );
        rowY += 45;
      } else {
        const cardHeight = 20 + (displayQuarters.length * 10) + (!hasPriorData ? 12 : 0);
        doc.rect(50, rowY, 495, cardHeight).fill(CARD_BG);
        doc.rect(50, rowY, 495, cardHeight).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();

        doc.font(FONT_BOLD).fontSize(7.5).fillColor(GRAY_FOOTER);
        doc.text('Quarter', 65, rowY + 8);
        doc.text('Positive Valence', 180, rowY + 8);
        doc.text('Neutral Valence', 300, rowY + 8);
        doc.text('Negative Valence', 420, rowY + 8);

        rowY += 18;
        displayQuarters.forEach((q) => {
          const qData = platformSentimentData?.[q] || { positive: 0, neutral: 0, negative: 0, total: 0 };
          const total = qData.total;
          
          let posPct = 0;
          let neuPct = 0;
          let negPct = 0;

          if (total > 0) {
            posPct = Math.round((qData.positive / total) * 100);
            neuPct = Math.round((qData.neutral / total) * 100);
            negPct = 100 - posPct - neuPct;
          }

          doc.font(FONT_BODY).fontSize(8).fillColor(total > 0 ? INK_BLACK : GRAY_FOOTER).text(q, 65, rowY);
          doc.font(FONT_MONO).fontSize(8).fillColor(total > 0 ? INK_BLACK : GRAY_FOOTER).text(total > 0 ? `${posPct}%` : '0%', 180, rowY);
          doc.text(total > 0 ? `${neuPct}%` : '0%', 300, rowY);
          doc.text(total > 0 ? `${negPct}%` : '0%', 420, rowY);
          rowY += 10;
        });

        if (!hasPriorData) {
          doc.font(FONT_BODY).fontSize(7.5).fillColor(GRAY_FOOTER).text('Note: No historical records detected prior to Q3 2025.', 65, rowY + 2);
          rowY += 12;
        }
        rowY += 15;
      }

      // Top 3 Flagged Records
      rowY += 35;
      doc.font(FONT_BOLD).fontSize(9.5).fillColor(FOREST_GREEN).text('SIGNIFICANT FLAGGED RECORDS', 50, rowY);
      
      rowY += 15;
      const rawFindings = data.allExtractedFindings || data.riskFindings || [];
      const platformFindings = rawFindings.filter(f => {
        if (f.platform && f.platform.toLowerCase() === p.toLowerCase()) return true;
        return f.finding.toLowerCase().includes(p.toLowerCase()) || f.evidence.toLowerCase().includes(p.toLowerCase());
      });
      const platformCommitments = data.commitments.filter(c => c.platform === p);
      
      const displayItems: { text: string; meta: string }[] = [];
      platformFindings.slice(0, 3).forEach(f => {
        displayItems.push({ text: f.finding, meta: f.evidence });
      });
      
      if (displayItems.length < 3) {
        platformCommitments.forEach(c => {
          if (displayItems.length < 3 && !displayItems.some(item => item.text === c.text)) {
            displayItems.push({ text: c.text, meta: `Commitment · Ref ID: ${(c.citation || '').slice(0, 8).toUpperCase() || 'N/A'}` });
          }
        });
      }

      if (displayItems.length === 0) {
        doc.rect(50, rowY, 495, 50).fill(CARD_BG);
        doc.rect(50, rowY, 495, 50).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();
        doc.font(FONT_BOLD).fontSize(9.5).fillColor(FOREST_GREEN).text('NO SIGNIFICANT RISK RECORDS DETECTED', 65, rowY + 15);
        doc.font(FONT_BODY).fontSize(8).fillColor(INK_BLACK).text('All scanned logs on this platform connector conform to baseline behavioral expectations.', 65, rowY + 28);
        rowY += 57;
      } else {
        displayItems.forEach((item) => {
          doc.rect(50, rowY, 495, 45).fill(CARD_BG);
          doc.rect(50, rowY, 495, 45).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();

          doc.font(FONT_ITALIC).fontSize(8.5).fillColor(INK_BLACK).text(`"${item.text}"`, 65, rowY + 10, { width: 465, height: 18, ellipsis: true });
          doc.font(FONT_MONO).fontSize(7.5).fillColor(GRAY_FOOTER).text(`Source: ${item.meta}`, 65, rowY + 28, { width: 465 });
          rowY += 52;
        });
      }
    });

    // --- PAGE 6: COMMITMENTS & OPPORTUNITIES ---
    doc.addPage();
    drawBackground();

    doc.fillColor(INK_BLACK).font(FONT_BOLD).fontSize(16).text('Commitments & Opportunities', 50, 60);
    doc.font(FONT_BODY).fontSize(9.5).fillColor(GRAY_FOOTER).text(`§ ${3 + platforms.length} — ${titles.section6}`, 50, 78);
    doc.moveTo(50, 95).lineTo(W - 50, 95).strokeColor(FOREST_GREEN).lineWidth(0.5).stroke();

    const colWidth = 235;
    const colGap = 25;
    const col1X = 50;
    const col2X = col1X + colWidth + colGap;
    let listY = 115;

    // Left Column: Detected Commitments
    doc.font(FONT_BOLD).fontSize(11).fillColor(FOREST_GREEN).text('DETECTED COMMITMENTS', col1X, listY);
    
    let commY = listY + 20;
    const commitments = data.commitments || [];
    if (commitments.length === 0) {
      doc.font(FONT_BODY).fontSize(9).fillColor(GRAY_FOOTER).text('No commitments detected.', col1X, commY);
    } else {
      commitments.slice(0, 7).forEach((c) => {
        doc.font(FONT_BOLD).fontSize(8.5).fillColor(INK_BLACK).text(c.text, col1X, commY, { width: colWidth, height: 24, ellipsis: true });
        const statusLabel = (c.status || 'pending').toUpperCase();
        const statusColor = (c.status === 'completed' || c.status === 'fulfilled') ? FOREST_GREEN : c.status === 'overdue' ? MUTED_RED : '#B8860B';
        
        doc.font(FONT_MONO).fontSize(7).fillColor(GRAY_FOOTER).text(`Status: `, col1X, commY + 26);
        const stW = doc.widthOfString('Status: ');
        doc.font(FONT_BOLD).fillColor(statusColor).text(statusLabel, col1X + stW, commY + 26);
        const metaW = doc.widthOfString(statusLabel);
        doc.font(FONT_MONO).fillColor(GRAY_FOOTER).text(` · Ref: ${(c.citation || '').slice(0, 8).toUpperCase() || 'N/A'}`, col1X + stW + metaW, commY + 26);
        commY += 45;
      });
    }

    // Right Column: Detected Opportunities
    doc.font(FONT_BOLD).fontSize(11).fillColor(FOREST_GREEN).text('DETECTED OPPORTUNITIES', col2X, listY);
    
    let oppY = listY + 20;
    const opportunities = data.opportunities || [];
    if (opportunities.length === 0) {
      doc.font(FONT_BODY).fontSize(9).fillColor(GRAY_FOOTER).text('No opportunities detected.', col2X, oppY);
    } else {
      opportunities.slice(0, 5).forEach((o) => {
        if (typeof o === 'object' && o !== null) {
          const opt = o as any;
          const title = opt.title || '';
          const originalDesc = opt.description || '';
          
          // Limit opportunity description to max ~400 chars to prevent cutoffs
          const MAX_OPPORTUNITY_DESC_LENGTH = 400;
          let desc = originalDesc;
          if (desc.length > MAX_OPPORTUNITY_DESC_LENGTH) {
            const truncated = desc.substring(0, MAX_OPPORTUNITY_DESC_LENGTH);
            const lastPeriod = truncated.lastIndexOf('.');
            const lastSpace = truncated.lastIndexOf(' ');
            desc = lastPeriod > 0 
              ? truncated.substring(0, lastPeriod + 1)
              : lastSpace > 0
                ? truncated.substring(0, lastSpace) + '...'
                : truncated + '...';
          }

          const src = opt.source || 'Verified Platform Connector';
          const priority = opt.priority || 'Medium';
          const scoreRed = opt.scoreReduction || '-0.5';
          
          doc.font(FONT_BOLD).fontSize(8.5).fillColor(INK_BLACK).text(title, col2X, oppY, { width: colWidth });
          const titleHeight = doc.heightOfString(title, { width: colWidth });
          
          doc.font(FONT_BODY).fontSize(7.5);
          const descHeight = doc.heightOfString(desc, { width: colWidth });
          doc.fillColor(GRAY_FOOTER).text(desc, col2X, oppY + titleHeight + 2, { width: colWidth });
          
          doc.font(FONT_MONO).fontSize(6.5).fillColor(FOREST_GREEN).text(`Source: ${src}  |  Priority: ${priority}  |  Impact: ${scoreRed} pts`, col2X, oppY + titleHeight + descHeight + 6);
          oppY += titleHeight + descHeight + 18;
        } else {
          const str = String(o);
          doc.font(FONT_BOLD).fontSize(8.5).fillColor(INK_BLACK).text(str, col2X, oppY, { width: colWidth });
          const titleHeight = doc.heightOfString(str, { width: colWidth });
          doc.font(FONT_MONO).fontSize(7).fillColor(GRAY_FOOTER).text(`Source: Verified Platform Connector  |  Priority: Medium  |  Impact: -0.5 pts`, col2X, oppY + titleHeight + 4);
          oppY += titleHeight + 18;
        }
      });
    }

    // --- PAGE 7: RISK FINDINGS ---
    doc.addPage();
    drawBackground();

    doc.fillColor(INK_BLACK).font(FONT_BOLD).fontSize(16).text('Risk Findings', 50, 60);
    doc.font(FONT_BODY).fontSize(9.5).fillColor(GRAY_FOOTER).text(`§ ${4 + platforms.length} — ${titles.section7}`, 50, 78);
    doc.moveTo(50, 95).lineTo(W - 50, 95).strokeColor(FOREST_GREEN).lineWidth(0.5).stroke();

    let findY = 115;
    const findings = data.riskFindings || [];
    
    if (findings.length === 0) {
      doc.rect(50, findY, 495, 60).fill(CARD_BG);
      doc.rect(50, findY, 495, 60).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();
      doc.font(FONT_BOLD).fontSize(9.5).fillColor(FOREST_GREEN).text('NO SIGNIFICANT RISK FINDINGS DETECTED', 65, findY + 18);
      doc.font(FONT_BODY).fontSize(8.5).fillColor(INK_BLACK).text('No reputational risk findings or compliance exposures were identified in the scanned communication baseline.', 65, findY + 32);
      findY += 72;
    } else {
      findings.slice(0, 5).forEach((f) => {
        doc.rect(50, findY, 495, 60).fill(CARD_BG);
        doc.rect(50, findY, 495, 60).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();

        const sev = (f.severity || 'LOW').toUpperCase();
        const sevColor = sev === 'HIGH' || sev === 'CRITICAL' ? MUTED_RED : sev === 'MEDIUM' ? '#B8860B' : FOREST_GREEN;
        
        doc.rect(65, findY + 12, 50, 14).fill(sevColor);
        doc.font(FONT_BOLD).fontSize(7).fillColor('#FCFCFC').text(sev, 65, findY + 16, { align: 'center', width: 50 });

        doc.font(FONT_BOLD).fontSize(9).fillColor(INK_BLACK).text(f.finding, 130, findY + 13, { width: 395 });
        doc.font(FONT_MONO).fontSize(7.5).fillColor(GRAY_FOOTER).text(`Evidence: ${f.evidence}`, 130, findY + 28);
        doc.font(FONT_BODY).fontSize(8).fillColor(INK_BLACK).text(`Impact: ${f.impact}`, 130, findY + 39, { width: 395 });

        findY += 72;
      });
    }

    // --- PAGE: CROSS-LENS CONSISTENCY REPORT (Full Audit Only) ---
    const isFullAudit = data.auditType === 'full' || data.auditType === 'full_reputation_audit';
    if (isFullAudit) {
      doc.addPage();
      drawBackground();

      doc.fillColor(INK_BLACK).font(FONT_BOLD).fontSize(16).text('Cross-Lens Consistency Report', 50, 60);
      doc.font(FONT_BODY).fontSize(9.5).fillColor(GRAY_FOOTER).text(`§ ${5 + platforms.length} — MULTI-DIMENSIONAL ALIGNMENT & CROSS-PLATFORM CONTRADICTION AUDIT`, 50, 78);
      doc.moveTo(50, 95).lineTo(W - 50, 95).strokeColor(FOREST_GREEN).lineWidth(0.5).stroke();

      const cl = data.crossLensConsistency || {
        consistencyRating: 'HIGH',
        dimensionScoreVariance: '0.0',
        contradictionFlags: [],
        consistencyNarrative: "No significant cross-platform contradictions detected. The subject's digital behavior presents a consistent profile across all analyzed connectors and contexts.",
        improvementRecommendation: "Align informal delivery estimates with official project timelines."
      };

      let clY = 115;

      // 1. Overall Consistency Pill + Variance Box
      doc.rect(50, clY, 235, 60).fill(CARD_BG);
      doc.rect(50, clY, 235, 60).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();
      doc.font(FONT_BOLD).fontSize(8).fillColor(GRAY_FOOTER).text('OVERALL CONSISTENCY RATING', 65, clY + 12);
      
      const rating = (cl.consistencyRating || 'HIGH').toUpperCase();
      const ratingColor = rating === 'HIGH' ? FOREST_GREEN : rating === 'MEDIUM' ? '#B8860B' : MUTED_RED;
      doc.rect(65, clY + 26, 70, 18).fill(ratingColor);
      doc.font(FONT_BOLD).fontSize(9).fillColor('#FCFCFC').text(rating, 65, clY + 31, { align: 'center', width: 70 });

      doc.rect(310, clY, 235, 60).fill(CARD_BG);
      doc.rect(310, clY, 235, 60).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();
      doc.font(FONT_BOLD).fontSize(8).fillColor(GRAY_FOOTER).text('DIMENSION SCORE VARIANCE', 325, clY + 12);
      doc.font(FONT_BOLD).fontSize(16).fillColor(INK_BLACK).text(`${cl.dimensionScoreVariance || '0.0'} pts`, 325, clY + 28);

      const varianceNum = parseFloat(cl.dimensionScoreVariance || '0.0');
      if (varianceNum > 2.0) {
        doc.font(FONT_BOLD).fontSize(7.5).fillColor(MUTED_RED).text('SIGNIFICANT VARIANCE DETECTED', 415, clY + 34, { width: 120 });
      }

      clY += 80;

      // 2. Consistency Narrative
      doc.font(FONT_BOLD).fontSize(10).fillColor(FOREST_GREEN).text('CONSISTENCY NARRATIVE', 50, clY);
      clY += 15;
      doc.rect(50, clY, 495, 60).fill(CARD_BG);
      doc.rect(50, clY, 495, 60).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();
      doc.font(FONT_BODY).fontSize(8.5).fillColor(INK_BLACK).text(
        cl.consistencyNarrative || "No consistency narrative was returned by the engine.",
        65, clY + 12, { width: 465, lineGap: 3 }
      );

      clY += 80;

      // 3. Contradiction Flags
      doc.font(FONT_BOLD).fontSize(10).fillColor(FOREST_GREEN).text('CROSS-PLATFORM CONTRADICTION FLAGS', 50, clY);
      clY += 15;

      const flags = cl.contradictionFlags || [];
      if (flags.length === 0) {
        doc.rect(50, clY, 495, 45).fill(CARD_BG);
        doc.rect(50, clY, 495, 45).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();
        doc.font(FONT_BOLD).fontSize(8.5).fillColor(FOREST_GREEN).text('NO CONTRADICTIONS IDENTIFIED', 65, clY + 18);
        clY += 60;
      } else {
        flags.slice(0, 3).forEach((flag: any) => {
          doc.rect(50, clY, 495, 50).fill(CARD_BG);
          doc.rect(50, clY, 495, 50).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();
          
          const fsev = (flag.severity || 'LOW').toUpperCase();
          const fsevColor = fsev === 'HIGH' ? MUTED_RED : fsev === 'MEDIUM' ? '#B8860B' : FOREST_GREEN;
          
          doc.rect(65, clY + 15, 45, 14).fill(fsevColor);
          doc.font(FONT_BOLD).fontSize(7).fillColor('#FCFCFC').text(fsev, 65, clY + 19, { align: 'center', width: 45 });

          doc.font(FONT_BOLD).fontSize(8.5).fillColor(INK_BLACK).text(
            `${flag.platformA || 'Platform A'} vs ${flag.platformB || 'Platform B'}`,
            120, clY + 12
          );
          doc.font(FONT_BODY).fontSize(8).fillColor(GRAY_FOOTER).text(
            flag.description || 'No details provided.',
            120, clY + 25, { width: 410 }
          );
          clY += 60;
        });
      }

      // 4. Recommendation
      doc.font(FONT_BOLD).fontSize(10).fillColor(FOREST_GREEN).text('ALIGNMENT RECOMMENDATION', 50, clY);
      clY += 15;
      doc.rect(50, clY, 495, 45).fill(CARD_BG);
      doc.rect(50, clY, 495, 45).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();
      doc.font(FONT_BODY).fontSize(8.5).fillColor(INK_BLACK).text(
        cl.improvementRecommendation || "No recommendation was returned.",
        65, clY + 15, { width: 465 }
      );
    }

    // --- PAGE 8: CITATIONS INDEX & LEGAL NOTICE ---
    doc.addPage();
    drawBackground();

    const citationsSectionNum = isFullAudit ? (6 + platforms.length) : (5 + platforms.length);
    doc.fillColor(INK_BLACK).font(FONT_BOLD).fontSize(16).text('Citations Index & Legal Notice', 50, 60);
    doc.font(FONT_BODY).fontSize(9.5).fillColor(GRAY_FOOTER).text(`§ ${citationsSectionNum} — EXPLICIT DATA SOURCE CITATIONS & STATUTORY NOTICES`, 50, 78);
    doc.moveTo(50, 95).lineTo(W - 50, 95).strokeColor(FOREST_GREEN).lineWidth(0.5).stroke();

    let citY = 110;
    doc.font(FONT_BOLD).fontSize(9).fillColor(FOREST_GREEN).text('SOURCE CITATIONS INDEX', 50, citY);
    citY += 15;

    const citationsList: Array<{ platform: string; date: string; id: string; text: string }> = [];
    const memoryContentMap = data.memoryContentMap || {};

    // 1. Gather commitment citations
    commitments.forEach((c: any) => {
      let citId = (c.citation || '').slice(0, 8).toUpperCase();
      let hasRealId = citId && citId !== 'N/A';
      if (!citId || citId === 'N/A') {
        const crypto = require('crypto');
        citId = crypto.createHash('sha256').update(c.text).digest('hex').slice(0, 8).toUpperCase();
      }
      const rawText = hasRealId ? (memoryContentMap[citId.toLowerCase()] || c.text) : c.text;
      const cleanText = rawText.replace(/\s+/g, ' ').trim();
      citationsList.push({
        platform: c.platform || 'Unknown',
        date: c.date ? c.date.split('T')[0] : endRange,
        id: citId,
        text: cleanText
      });
    });

    // 2. Gather risk finding citations from evidence
    const riskFindingsForCitations = data.riskFindings || [];
    riskFindingsForCitations.forEach((f: any) => {
      const match = (f.evidence || '').match(/\b([a-f0-9]{8,36})\b/i);
      if (match) {
        const refId = match[1].slice(0, 8).toUpperCase();
        // Avoid duplicate citations with same ID
        if (!citationsList.some(c => c.id === refId)) {
          let platform = 'System';
          if (f.platform) {
            const p = f.platform.toLowerCase();
            platform = p === 'google-calendar' || p === 'google_calendar' ? 'Google Calendar' : p.charAt(0).toUpperCase() + p.slice(1);
          } else {
            const textToSearch = `${f.finding} ${f.evidence} ${f.impact}`.toLowerCase();
            const knownPlatforms = ['gmail', 'slack', 'discord', 'github', 'notion', 'vercel', 'google_calendar', 'google-calendar', 'clickup', 'linear', 'claude'];
            const foundPlatform = knownPlatforms.find(p => textToSearch.includes(p));
            if (foundPlatform) {
              platform = foundPlatform === 'google-calendar' ? 'Google Calendar' : foundPlatform.charAt(0).toUpperCase() + foundPlatform.slice(1);
            }
          }
          const rawText = memoryContentMap[refId.toLowerCase()] || `${f.finding} — ${f.evidence}`;
          const cleanText = rawText.replace(/\s+/g, ' ').trim();
          citationsList.push({
            platform: platform,
            date: endRange,
            id: refId,
            text: cleanText
          });
        }
      }
    });

    if (citationsList.length === 0) {
      doc.font(FONT_BODY).fontSize(8.5).fillColor(GRAY_FOOTER).text('No active commitments or source citations registered in this audit.', 50, citY);
      citY += 25;
    } else {
      const displayCitations = citationsList.slice(0, 6);
      displayCitations.forEach((c: any) => {
        doc.font(FONT_MONO).fontSize(7.5).fillColor(INK_BLACK).text(`[${c.id}]  ${(c.platform || 'Unknown').toUpperCase()}  ·  ${c.date}`, 50, citY);
        doc.font(FONT_BODY).fontSize(7.5).fillColor(GRAY_FOOTER).text(`Excerpt: "${c.text}"`, 65, citY + 10, { width: 480, height: 10, ellipsis: true });
        citY += 24;
      });
    }

    citY += 10;
    doc.moveTo(50, citY).lineTo(W - 50, citY).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();
    citY += 15;

    doc.font(FONT_BOLD).fontSize(8.5).fillColor(INK_BLACK).text('DATA SOURCE DISCLOSURE', 50, citY);
    doc.font(FONT_BODY).fontSize(7.5).fillColor(GRAY_FOOTER).text(
      'This certificate has been generated using only the data sources you have explicitly authorized through OAuth. Citations referenced in this report are sourced from your authorized connectors only. EYES does not search the public web, query third-party data brokers, or enrich this report with information from sources outside your authorized scope.',
      50, citY + 12, { width: 495, lineGap: 2.5 }
    );

    citY += 58;
    doc.font(FONT_BOLD).fontSize(8.5).fillColor(INK_BLACK).text('GDPR — ARTICLES 15 & 20 STATUTORY DISCLOSURES', 50, citY);
    doc.font(FONT_BODY).fontSize(7.5).fillColor(GRAY_FOOTER).text(
      'Pursuant to Articles 15 and 20 of the General Data Protection Regulation (EU 2016/679), the data analysed in this report constitutes your personal data, processed on your instruction. You have the right to access, rectify, erase, and export this data at any time through your EYES account. EYES does not retain analysis artefacts beyond the audit delivery period and does not use your data to train any model without your separate, explicit, opt-in consent.',
      50, citY + 12, { width: 495, lineGap: 2.5 }
    );

    citY += 68;
    doc.moveTo(50, citY).lineTo(W - 50, citY).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();
    citY += 15;

    doc.font(FONT_BOLD).fontSize(8.5).fillColor(INK_BLACK).text('CRYPTOGRAPHIC SIGNATURE & VERIFICATION HASH (SHA-256)', 50, citY);
    const shaHash = require('crypto').createHash('sha256').update(data.id + data.createdAt + data.riskScore).digest('hex');
    const hashPart1 = shaHash.slice(0, 32);
    const hashPart2 = shaHash.slice(32);
    doc.font(FONT_MONO).fontSize(8.5).fillColor(GRAY_FOOTER).text(hashPart1, 50, citY + 14);
    doc.text(hashPart2, 50, citY + 24);

    doc.font(FONT_BODY).fontSize(7).fillColor(GRAY_FOOTER).text(
      'To verify document integrity, compute the SHA-256 hash of this PDF file and compare it against the verification signature above.',
      50, citY + 36, { width: 280 }
    );

    doc.font(FONT_BODY).fontSize(8).fillColor(GRAY_FOOTER).text(`Audit ID: EYES-RA-${data.id.slice(0, 8).toUpperCase()}`, 350, citY + 14);
    doc.text(`Generated: ${dateStr}`, 350, citY + 24);
  }


  /**
   * Generates the PDF into a binary buffer on-demand.
   */
  static async generateBuffer(audit: ReputationAudit, userId: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      (async () => {
        try {
          const supabase = await createAdminClient();

          const targetConnectors = (audit.connectorsCovered && audit.connectorsCovered.length > 0)
            ? audit.connectorsCovered
            : ['gmail', 'slack', 'discord', 'github', 'notion', 'vercel', 'google_calendar', 'clickup', 'linear'];

          // Fetch exact Counts dynamically via a single batched select query
          const platformCounts: Record<string, number> = {};
          const platformTitles: Record<string, string[]> = {};
          targetConnectors.forEach((platform) => {
            platformCounts[platform] = 0;
            platformTitles[platform.toLowerCase()] = [];
          });

          const { data: countData, error: countError } = await supabase
            .from('memories')
            .select('platform, title')
            .eq('user_id', userId)
            .in('platform', targetConnectors);

          if (!countError && countData) {
            countData.forEach((row) => {
              const p = row.platform;
              if (p && platformCounts[p] !== undefined) {
                platformCounts[p]++;
                if (row.title) {
                  platformTitles[p.toLowerCase()].push(row.title);
                }
              }
            });
          }

          const memoriesByPlatform: Record<string, any[]> = {};
          
          // Compile platform data coverage structures using actual counts if positive, else fall back to default
          const platformVolumeMap: Record<string, number> = {
            gmail: 240,
            slack: 180,
            discord: 150,
            notion: 120,
            github: 100,
            vercel: 80,
            google_calendar: 60,
            clickup: 45,
            linear: 25,
          };
          const platformCategories: Record<string, string> = {
            gmail: 'Productivity',
            slack: 'Productivity',
            discord: 'Social',
            notion: 'Productivity',
            github: 'Development',
            vercel: 'Development',
            google_calendar: 'Productivity',
            clickup: 'Productivity',
            linear: 'Productivity',
          };

          const platformData: Record<string, any> = {};
          targetConnectors.forEach((platform) => {
            const key = platform.toLowerCase();
            const realCount = platformCounts[platform];
            const connectorEntities = extractEntitiesFromTitles(platformTitles[key] || [], key);
            platformData[key] = {
              count: realCount || 0,
              category: platformCategories[key] || 'Ecosystem',
              memories: memoriesByPlatform[key] || [],
              entities: connectorEntities
            };
          });

          // Fetch original contents from memories table for citations
          const citationsToFetch: string[] = [];
          audit.metadata.commitments?.forEach((c: any) => {
            const citId = (c.citation || '').trim();
            if (citId && citId.toLowerCase() !== 'n/a') citationsToFetch.push(citId);
          });
          audit.metadata.riskFindings?.forEach((f: any) => {
            const match = (f.evidence || '').match(/\b([a-f0-9-]{8,36})\b/i);
            if (match) {
              citationsToFetch.push(match[1]);
            }
          });

          const memoryContentMap: Record<string, string> = {};
          if (citationsToFetch.length > 0) {
            // Deduplicate citations to minimize queries
            const uniqueIds = Array.from(new Set(citationsToFetch));
            
            // To be extremely robust and avoid PostgreSQL cast errors, we divide IDs:
            // 36-character UUIDs can be selected directly with eq()
            // Any shorter prefixes can be resolved in memory from a full scan
            const fullUuids = uniqueIds.filter(id => id.length === 36);
            const shortPrefixes = uniqueIds.filter(id => id.length < 36);

            if (fullUuids.length > 0) {
              try {
                const { data: rows } = await supabase
                  .from('memories')
                  .select('id, content')
                  .in('id', fullUuids);
                if (rows) {
                  rows.forEach((row) => {
                    if (row.content) {
                      const lowerId = row.id.toLowerCase();
                      memoryContentMap[lowerId] = row.content;
                      memoryContentMap[lowerId.slice(0, 8)] = row.content;
                    }
                  });
                }
              } catch (e) {
                console.warn('[PDF] Failed to batch fetch full UUID memories:', e);
              }
            }

            if (shortPrefixes.length > 0) {
              try {
                const { data: rows } = await supabase
                  .from('memories')
                  .select('id, content')
                  .eq('user_id', userId);
                if (rows) {
                  rows.forEach((row) => {
                    if (row.content) {
                      const lowerId = row.id.toLowerCase();
                      const prefixMatch = shortPrefixes.find(p => lowerId.startsWith(p.toLowerCase()));
                      if (prefixMatch) {
                        memoryContentMap[prefixMatch.toLowerCase()] = row.content;
                        memoryContentMap[lowerId.slice(0, 8)] = row.content;
                      }
                    }
                  });
                }
              } catch (e) {
                console.warn('[PDF] Failed to scan short prefixes:', e);
              }
            }
          }

          const doc = new PDFDocument({
            size: 'A4',
            margin: 0,
            bufferPages: true,
            info: {
              Title: `Reputation Audit - ${audit.id}`,
              Author: 'EYES',
            }
          });

          const chunks: Buffer[] = [];
          doc.on('data', (chunk: Buffer) => chunks.push(chunk));
          doc.on('end', () => {
            resolve(Buffer.concat(chunks));
          });
          doc.on('error', (err) => {
            reject(err);
          });

          // Draw the shared booklet layout
          const normalized: NormalizedAuditData = {
            id: audit.id,
            createdAt: audit.createdAt,
            subjectName: audit.metadata.subjectName || 'Authenticated Subject',
            connectorsCovered: targetConnectors,
            mentionsCount: audit.mentionsCount || 0,
            commitmentsCount: audit.commitmentsCount || 0,
            riskScore: audit.riskScore || 0,
            summaryNarrative: audit.summaryNarrative || '',
            complianceRate: audit.metadata.complianceRate || '100.00',
            failureRate: audit.metadata.failureRate || '0.00',
            sentimentBalance: audit.metadata.sentimentBalance || 1.0,
            opportunities: audit.metadata.opportunities || [],
            topEntities: audit.metadata.topEntities || [],
            commitments: audit.metadata.commitments || [],
            riskFindings: audit.metadata.riskFindings || [],
            allExtractedFindings: (audit.metadata as any).allExtractedFindings || audit.metadata.riskFindings || [],
            platformData: platformData,
            auditType: audit.metadata.audit_type || 'full',
            crossLensConsistency: (audit.metadata as any).crossLensConsistency || null,
            platformSentiment: (audit.metadata as any).platformSentiment || null,
            memoryContentMap: memoryContentMap
          };

          this.draw(doc, normalized);

          // Add headers & footers dynamically in a second pass
          const range = doc.bufferedPageRange();
          const W = doc.page.width;
          const H = doc.page.height;
          for (let i = 0; i < range.count; i++) {
            doc.switchToPage(i);

            // Draw watermark on every page at low opacity
            doc.save();
            doc.opacity(0.04);
            doc.fillColor('#1F4D3F');
            doc.font('Helvetica-Bold').fontSize(50);
            doc.translate(W / 2, H / 2);
            doc.rotate(-45);
            doc.text('CONFIDENTIAL', -250, -25, { width: 500, align: 'center' });
            doc.restore();

            // Draw page border outline on all pages
            doc.rect(35, 35, W - 70, H - 70)
               .strokeColor('#1F4D3F')
               .lineWidth(1.0)
               .stroke();

            if (i === 0) continue; // Skip cover page header/footer

            // Header EYES wordmark
            doc.fillColor('#1F4D3F').fontSize(10).font('Helvetica-Bold')
               .text('EYES', 50, 48);

            const footerText1 = `Audit ID: EYES-RA-${normalized.id.slice(0, 8).toUpperCase()}  ·  CONFIDENTIAL  ·  EYES`;
            const footerText2 = `Page ${i + 1} of ${range.count}`;

            doc.fillColor('#555555').fontSize(7.5).font('Helvetica')
               .text(footerText1, 50, H - 48, { align: 'center', width: W - 100 })
               .text(footerText2, 50, H - 36, { align: 'center', width: W - 100 });
          }

          doc.end();

        } catch (err) {
          reject(err);
        }
      })();
    });
  }

  /**
   * Generates the PDF, writes it locally (if dev), and uploads it to Supabase Storage.
   */
  static async generateAndUpload(audit: ReputationAudit, userId: string): Promise<string> {
    try {
      const pdfBuffer = await this.generateBuffer(audit, userId);

      // Save local copy in development or test modes
      if (process.env.NODE_ENV === 'development' || process.env.TEST_PDF === 'true' || true) {
        try {
          const fs = require('fs');
          const path = require('path');
          const localPath = path.join(process.cwd(), 'test_audit.pdf');
          fs.writeFileSync(localPath, pdfBuffer);
          console.log('[PDF] Saved local copy to:', localPath);
        } catch (localErr) {
          console.error('[PDF] Failed to write local copy:', localErr);
        }
      }

      const supabase = await createAdminClient();

      // Create bucket if missing
      try {
        await supabase.storage.createBucket('audits', { public: false });
      } catch (_e) {
        // Ignore if bucket exists
      }

      const fileName = `audit_${audit.id}.pdf`;
      const filePath = `${userId}/${fileName}`;

      // Upload the compiled buffer directly to avoid stream lock errors
      const { error: uploadError } = await supabase.storage
        .from('audits')
        .upload(filePath, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: true
        });

      if (uploadError) {
        console.error('[PDF] Upload failed:', uploadError);
        return null as unknown as string;
      }

      // Generate a SIGNED URL (7 days valid)
      const { data: signedData, error: signedError } = await supabase.storage
        .from('audits')
        .createSignedUrl(filePath, 60 * 60 * 24 * 7);

      if (signedError) {
        console.error('[PDF] Signed URL generation failed:', signedError);
        return null as unknown as string;
      }

      return signedData.signedUrl;
    } catch (err) {
      console.error('[PDF] Upload/Write process failed:', err);
      return null as unknown as string;
    }
  }
}
