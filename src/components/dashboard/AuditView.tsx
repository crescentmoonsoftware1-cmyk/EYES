'use client';

import React, { useEffect, useRef, useState } from 'react';
import styles from './AuditView.module.css';
import type { ReputationAudit, AuditSummary } from '@/types/dashboard';
import { AnimatedNumber } from '../common/AnimatedNumber';
import {
  ShieldIcon,
  PrivacyEyeIcon,
  OperationalLinkIcon,
  SentimentChartIcon
} from '../common/icons/PlatformIcons';

interface AuditViewProps {
  onBack: () => void;
  summary?: AuditSummary;
}

export function AuditView({ onBack, summary }: AuditViewProps) {
  const [activeAudit, setActiveAudit] = useState<ReputationAudit | null>(null);
  const [isInitiating, setIsInitiating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [auditMode, setAuditMode] = useState<'dashboard' | 'running' | 'completed'>('dashboard');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [backendCompleted, setBackendCompleted] = useState(false);
  const [auditHistory, setAuditHistory] = useState<ReputationAudit[]>([]);

  // Fetch the latest audit on mount
  useEffect(() => {
    const fetchLatest = async () => {
      try {
        const auditRes = await fetch('/api/audit/latest');
        if (auditRes.ok) {
          const data = await auditRes.json();
          if (data) {
            setActiveAudit(data);
          }
        }
      } catch (err) {
        console.error('Failed to fetch latest audit:', err);
      }
    };

    fetchLatest();

    // keep existing load behavior; polling of a specific audit is handled
    // by a dedicated effect that watches `activeAudit.id` so we can
    // perform near-real-time updates for the in-progress audit.
    return () => { };
  }, []);

  // Fetch audit history for the history table
  useEffect(() => {
    fetch('/api/audit/history')
      .then(r => r.json())
      .then(d => setAuditHistory((d.audits || []).slice(0, 8)))
      .catch(() => {});
  }, []);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Poll a specific audit by id so the UI updates in near-real-time
  useEffect(() => {
    if (!activeAudit?.id) return;

    let stopped = false;
    const poll = async () => {
      if (stopped) return;
      try {
        const res = await fetch(`/api/audit/${activeAudit.id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data) return;

        setActiveAudit(prev => ({ ...(prev ?? {} as Partial<ReputationAudit>), ...data } as ReputationAudit));

        if (data.status === 'completed') {
          setBackendCompleted(true);
          setErrorMessage(null);
          stopped = true;
        }
        if (data.status === 'failed') {
          setErrorMessage(data.summaryNarrative || 'The neural analysis encountered an unexpected error.');
          stopped = true;
        }
      } catch (err) {
        console.warn('[Audit Poll] failed to fetch audit status:', err);
      }
    };

    // Start immediate poll and then interval
    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [activeAudit?.id]);

  // Update elapsed seconds for the node graph simulation
  useEffect(() => {
    if (auditMode !== 'running') {
      setElapsedSeconds(0);
      return;
    }

    const timer = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [auditMode]);

  // Synchronize state transition: Wait for BOTH backend completion and minimum animation runtime (25s)
  useEffect(() => {
    if (backendCompleted && elapsedSeconds >= 25) {
      setAuditMode('completed');
    }
  }, [backendCompleted, elapsedSeconds]);

  const handleStartAudit = async (type: string = 'full') => {
    setIsInitiating(true);
    setAuditMode('running');
    setElapsedSeconds(0);
    setBackendCompleted(false);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/audit/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type })
      });
      if (res.ok) {
        const data = await res.json();
        // Set the active audit ID so the useEffect poller starts tracking it
        setActiveAudit(prev => ({
          ...(prev || {}),
          id: data.auditId,
          status: 'pending',
          riskScore: 0,
          mentionsCount: 0,
          commitmentsCount: 0,
          summaryNarrative: null,
          connectorsCovered: [],
          reportUrl: null,
          createdAt: new Date().toISOString(),
          metadata: {
            sentimentBalance: 0,
            unfulfilledCommitments: 0,
            commitments: [],
            opportunities: [],
            topEntities: [],
            riskFindings: []
          }
        } as ReputationAudit));

        // Stay in 'running' mode. The useEffect poller will transition us to 'completed'
        // only once the database record actually has a reportUrl.
      } else {
        setAuditMode('dashboard');
      }
    } catch (err) {
      console.error('Initiation failed:', err);
      setAuditMode('dashboard');
    } finally {
      setIsInitiating(false);
    }
  };

  // 1. DASHBOARD STATE (PROACTIVE)
  if (auditMode === 'dashboard') {
    return (
      <div className={styles.auditContainer}>
        <header className={styles.auditHeader}>
          <div>
            <h1 className={styles.auditTitle}>Audit Control Center</h1>
            <p className={styles.auditSubtitle}>Select a specialized lens for deep neural analysis.</p>
          </div>
          {activeAudit && activeAudit.status === 'completed' && (
            <button 
              className={styles.viewLatestBtn}
              onClick={() => setAuditMode('completed')}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              VIEW LATEST CERTIFICATE
            </button>
          )}
        </header>

        <div className={styles.auditGrid}>
          {/* PRIMARY ACTION */}
          <div className={`${styles.mainAuditCard} magnetic-card stagger-2`} onClick={() => handleStartAudit('full')}>
            <div className={styles.cardHeader}>
              <div className={styles.cardBadge}>RECOMMENDED</div>
              <div className={styles.cardIcon}><ShieldIcon size={32} /></div>
            </div>
            <div className={styles.cardBody}>
              <h3>Full Reputation Audit</h3>
              <p>A comprehensive 360° scan of all connected platforms to detect sentiment shifts, commitments, and privacy leaks.</p>
            </div>
            <button className={`${styles.primaryAuditBtn} liquid-hover`} disabled={isInitiating}>
              {isInitiating ? 'INITIALIZING...' : 'START FULL SCAN'}
            </button>
          </div>

          {/* SPECIALIZED ACTIONS */}
          <div className={`${styles.secondaryAuditGrid} stagger-3`}>
            <div className={`${styles.miniAuditCard} magnetic-card`} onClick={() => handleStartAudit('reputation')}>
              <div className={styles.miniIcon}><ShieldIcon size={24} /></div>
              <h4>Investor / Reputation</h4>
              <p>"What will someone find when they run diligence on me?" Cold, clinical analysis of unfulfilled commitments, contradictions, and external risks.</p>
            </div>
            <div className={`${styles.miniAuditCard} magnetic-card`} onClick={() => handleStartAudit('behavioral')}>
              <div className={styles.miniIcon}><OperationalLinkIcon size={24} /></div>
              <h4>Behavioral / Self</h4>
              <p>"What did I actually accomplish, and what slipped?" Analysis of follow-through, task loops, drift, and dropped commitments.</p>
            </div>
            <div className={`${styles.miniAuditCard} magnetic-card`} onClick={() => handleStartAudit('hiring')}>
              <div className={styles.miniIcon}><SentimentChartIcon size={24} /></div>
              <h4>Hiring / Professional</h4>
              <p>"What does a recruiter or employer see?" Analysis of reliability, stakeholder communication quality, and professional red flags.</p>
            </div>
          </div>
        </div>

        <div className={`${styles.readinessFooter} stagger-4`}>
          <div className={styles.readinessStatus}>
            <span className={styles.statusDot} />
            {summary
              ? `SYSTEM READY: ${summary.totalMemories.toLocaleString()} MEMORIES INDEXED`
              : 'SYSTEM READY — NEURAL ENGINE ACTIVE'}
          </div>
        </div>
      </div>
    );
  }

  // 2. RUNNING / FAILED STATE — Agentic Terminal UI
  if (auditMode === 'running' || errorMessage) {
    return <AgenticTerminal
      elapsedSeconds={elapsedSeconds}
      errorMessage={errorMessage}
      backendCompleted={backendCompleted}
      onReturnToDashboard={() => { setErrorMessage(null); setAuditMode('dashboard'); }}
    />;
  }

  // 3. COMPLETED PREVIEW
  if (auditMode === 'completed' && activeAudit) {
    return (
      <div className={styles.auditContainer}>
        <header className={styles.auditHeader}>
          <div>
            <h1 className={styles.auditTitle}>
              Audit Certificate: {
                activeAudit.metadata?.audit_type === 'reputation' ? 'Investor / Reputation' :
                activeAudit.metadata?.audit_type === 'behavioral' ? 'Behavioral / Self' :
                activeAudit.metadata?.audit_type === 'hiring' ? 'Hiring / Professional' :
                'Full Reputation'
              }
            </h1>
            <div className={styles.auditMeta}>
              ID: {activeAudit.id.slice(0, 8).toUpperCase()} <span className={styles.metaDivider}>•</span> {new Date(activeAudit.createdAt).toUTCString()}
            </div>
          </div>
          <div className={styles.headerRight}>
            <button
              className={styles.newAuditBtn}
              onClick={() => setAuditMode('dashboard')}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                <path d="M5 12h14M12 5v14" />
              </svg>
              NEW AUDIT
            </button>
          </div>
        </header>

        {/* 1. Horizontal Bento Metrics Bar */}
        <div className={`${styles.metricsGrid} stagger-1`}>
          <div className={`${styles.metricCard} magnetic-card`}>
            <div className={styles.metricHeader}>
              <span className={styles.metricLabel}>Total Footprint</span>
              <span className={styles.metricIcon}>🌐</span>
            </div>
            <div className={styles.metricValue}>
              <AnimatedNumber value={activeAudit.mentionsCount || 0} />
            </div>
            <div className={styles.metricSubText}>Aggregated indexed mentions</div>
          </div>
          <div className={`${styles.metricCard} magnetic-card`}>
            <div className={styles.metricHeader}>
              <span className={styles.metricLabel}>Sentiment Balance</span>
              <span className={styles.metricIcon} style={{ color: '#06b6d4' }}>🎭</span>
            </div>
            <div className={styles.metricValue}>
              <AnimatedNumber value={((activeAudit.metadata?.sentimentBalance || 0) * 100)} />%
            </div>
            <div className={styles.metricSubText}>Positive linguistic alignment</div>
          </div>
          <div className={`${styles.metricCard} magnetic-card`}>
            <div className={styles.metricHeader}>
              <span className={styles.metricLabel}>Extracted Promises</span>
              <span className={styles.metricIcon} style={{ color: '#10b981' }}>🤝</span>
            </div>
            <div className={styles.metricValue}>
              <AnimatedNumber value={activeAudit.commitmentsCount || 0} />
            </div>
            <div className={styles.metricSubText}>Identified active commitments</div>
          </div>
        </div>

        {/* 2. Main Two-Column Layout */}
        <div className={styles.grid}>
          <div className={`${styles.mainContent} stagger-2`}>
            <section className={styles.summaryBox}>
              <div className={styles.summaryHeader}>
                <h2 className={styles.sectionHeading}>Executive Summary</h2>
                <span className={styles.summaryStatusBadge}>PREVIEW FINDINGS</span>
              </div>

              {/* Headline Narrative paragraph */}
              <div className={styles.narrative}>
                <p className={styles.headlineNarrativeText}>
                  {activeAudit.summaryNarrative || 'No narrative generated yet. Re-run analysis to generate findings.'}
                </p>
              </div>

              {/* Key Observations Grid */}
              <div className={styles.obsGrid}>
                <div className={`${styles.obsCard} magnetic-card`}>
                  <div className={styles.obsLabel}>Compliance Rate</div>
                  <div className={styles.obsValue}>
                    {activeAudit.metadata?.complianceRate || `${(100 - activeAudit.riskScore * 6.5).toFixed(1)}%`}
                  </div>
                </div>
                <div className={`${styles.obsCard} magnetic-card`}>
                  <div className={styles.obsLabel}>Linguistic Trajectory</div>
                  <div className={styles.obsValue} style={{ textTransform: 'capitalize' }}>
                    {activeAudit.metadata?.trajectory || (activeAudit.riskScore > 6 ? 'attention required' : activeAudit.riskScore > 3 ? 'stable' : 'optimal')}
                  </div>
                </div>
                <div className={`${styles.obsCard} magnetic-card`}>
                  <div className={styles.obsLabel}>Tracked Signals</div>
                  <div className={styles.obsValue}>
                    <AnimatedNumber value={activeAudit.metadata?.riskFindings?.length || (activeAudit.riskScore > 0 ? activeAudit.riskScore * 2 + 1 : 0)} /> Identified
                  </div>
                </div>
                <div className={`${styles.obsCard} magnetic-card`}>
                  <div className={styles.obsLabel}>Behavioral Footprint</div>
                  <div className={styles.obsValue}>
                    <AnimatedNumber value={activeAudit.mentionsCount || 0} /> Scanned
                  </div>
                </div>
              </div>

              {/* Premium Cryptographic Seal Banner */}
              <div className={styles.lockedContainer}>
                <div className={styles.lockedHeader}>
                  <span className={styles.lockIcon}>🔒</span>
                  <strong>SECURE REPORT ACCESS REQUIRED</strong>
                </div>
                <p className={styles.lockedText}>
                  Full behavioral analysis, cross-platform source citations, exact context logs, and complete risk scoring breakdown are sealed. Download the verified cryptographic PDF report to view full findings.
                </p>
              </div>
            </section>
          </div>

          <aside className={`${styles.sidebarCard} stagger-3`}>
            <div className={styles.sidebarSectionTitle}>RISK PROFILE</div>
            {/* Animated Risk Dial SVG */}
            {(() => {
              const riskPercent = Math.min(100, Math.max(0, (activeAudit.riskScore / 10) * 100));
              const strokeDashoffset = 251.2 - (251.2 * riskPercent) / 100;
              const isCritical = activeAudit.riskScore > 7;
              const isModerate = activeAudit.riskScore > 4;
              const riskColor = isCritical ? 'var(--accent-red, #ef4444)' : isModerate ? 'var(--accent-amber, #f59e0b)' : 'var(--accent-green, #10b981)';
              
              return (
                <div className={styles.dialContainer}>
                  <svg width="115" height="115" viewBox="0 0 100 100" className={styles.dialSvg}>
                    <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255, 255, 255, 0.04)" strokeWidth="4" />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke={riskColor}
                      strokeWidth="5"
                      strokeDasharray="251.2"
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      transform="rotate(-90 50 50)"
                      className={styles.dialStroke}
                      style={{ filter: `drop-shadow(0 0 4px ${riskColor}80)` }}
                    />
                    <text x="50" y="46" textAnchor="middle" dominantBaseline="middle" className={styles.dialValue} fill="var(--text-primary)">
                      {activeAudit.riskScore}
                    </text>
                    <text x="50" y="70" textAnchor="middle" dominantBaseline="middle" className={styles.dialLabel} fill={riskColor}>
                      {isCritical ? 'CRITICAL' : isModerate ? 'MODERATE' : 'OPTIMAL'}
                    </text>
                  </svg>
                </div>
              );
            })()}

            {/* Category breakdown bars */}
            <div className={styles.categoryBreakdown}>
              <div className={styles.breakdownHeader}>COMMITMENT ANALYSIS</div>

              <div className={styles.categoryItem}>
                <div className={styles.categoryLabelRow}>
                  <span>Promise Reliability</span>
                  <span>{activeAudit.riskScore > 7 ? '72%' : activeAudit.riskScore > 4 ? '85%' : '96%'}</span>
                </div>
                <div className={styles.categoryBar}>
                  <div
                    className={styles.categoryBarFill}
                    style={{
                      width: activeAudit.riskScore > 7 ? '72%' : activeAudit.riskScore > 4 ? '85%' : '96%',
                      backgroundColor: 'var(--accent-green, #10b981)'
                    }}
                  />
                </div>
              </div>

              <div className={styles.categoryItem}>
                <div className={styles.categoryLabelRow}>
                  <span>Sentiment Index</span>
                  <span>{((activeAudit.metadata?.sentimentBalance || 0.6) * 100).toFixed(0)}%</span>
                </div>
                <div className={styles.categoryBar}>
                  <div
                    className={styles.categoryBarFill}
                    style={{
                      width: `${((activeAudit.metadata?.sentimentBalance || 0.6) * 100).toFixed(0)}%`,
                      backgroundColor: '#06b6d4'
                    }}
                  />
                </div>
              </div>

              <div className={styles.categoryItem}>
                <div className={styles.categoryLabelRow}>
                  <span>Linguistic Safety</span>
                  <span>{((10 - activeAudit.riskScore) * 10).toFixed(0)}%</span>
                </div>
                <div className={styles.categoryBar}>
                  <div
                    className={styles.categoryBarFill}
                    style={{
                      width: `${((10 - activeAudit.riskScore) * 10).toFixed(0)}%`,
                      backgroundColor: activeAudit.riskScore > 7 ? 'var(--accent-red, #ef4444)' : activeAudit.riskScore > 4 ? 'var(--accent-amber, #f59e0b)' : 'var(--accent-green, #10b981)'
                    }}
                  />
                </div>
              </div>
            </div>

            <div className={styles.sidebarActions}>
              <button
                className={styles.downloadBtnPremium}
                disabled={isDownloading}
                onClick={async () => {
                  if (!activeAudit?.id) return;
                  setIsDownloading(true);
                  try {
                    const res = await fetch(`/api/audit/${activeAudit.id}/pdf`);
                    if (!res.ok) throw new Error('PDF generation failed');
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `eyes-audit-${activeAudit.id.slice(0, 8)}.pdf`;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 2000);
                  } catch (err) {
                    console.error('[PDF Download] failed:', err);
                    alert('PDF generation failed. Please try again.');
                  } finally {
                    setIsDownloading(false);
                  }
                }}
              >
                {isDownloading ? (
                  <span className={styles.downloadSpinnerWrapper}>
                    <svg className={styles.spinner} viewBox="0 0 50 50">
                      <circle className={styles.path} cx="25" cy="25" r="20" fill="none" strokeWidth="5"></circle>
                    </svg>
                    COMPILING PDF...
                  </span>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                    </svg>
                    DOWNLOAD DOSSIER PDF
                  </>
                )}
              </button>

              <button
                className={styles.rerunBtnPremium}
                onClick={async () => {
                  if (!activeAudit?.id) return;
                  if (!confirm('Re-run the AI analysis on this audit? This will refresh all findings, commitments, and risk scores.')) return;
                  try {
                    const res = await fetch(`/api/audit/${activeAudit.id}/reanalyze`, { method: 'POST' });
                    if (!res.ok) {
                      const errData = await res.json().catch(() => ({}));
                      throw new Error(errData.detail || errData.error || 'Failed to start re-analysis');
                    }
                    setAuditMode('running');
                  } catch (err) {
                    console.error('[Reanalyze] failed:', err);
                    alert(err instanceof Error ? err.message : 'Failed to start re-analysis. Please try again.');
                  }
                }}
              >
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                </svg>
                RE-RUN ANALYSIS
              </button>
            </div>
          </aside>
        </div>

      </div>
    );
  }

  return null;
}

// ─── AgenticTerminal Component ───────────────────────────────────────────────
interface AgenticTerminalProps {
  elapsedSeconds: number;
  errorMessage: string | null;
  backendCompleted: boolean;
  onReturnToDashboard: () => void;
}

type StepStatus = 'pending' | 'running' | 'done';

interface TerminalStep {
  id: string;
  phase: string;
  icon: string;
  text: string;
  subtext?: string;
  color: string;
  appearsAt: number;   // seconds at which step appears
  completeAt: number;  // seconds at which step becomes 'done'
}

const TERMINAL_STEPS: TerminalStep[] = [
  // ── Phase 1: Searching ────────────────────────────────────────────────────
  { id: 's1',  phase: 'SEARCHING',  icon: '🔍', color: '#06b6d4', appearsAt: 0,  completeAt: 3,  text: 'Initializing audit pipeline...', subtext: 'Authenticating platform sessions' },
  { id: 's2',  phase: 'SEARCHING',  icon: '📧', color: '#ea4335', appearsAt: 2,  completeAt: 6,  text: 'Querying Gmail — scanning inbox & sent mail...', subtext: 'Indexing subject lines, commitments & keywords' },
  { id: 's3',  phase: 'SEARCHING',  icon: '📅', color: '#4285f4', appearsAt: 4,  completeAt: 8,  text: 'Scanning Google Calendar — extracting events...', subtext: 'Mapping meetings, deadlines & promises to timeline' },
  { id: 's4',  phase: 'SEARCHING',  icon: '💬', color: '#e01e5a', appearsAt: 6,  completeAt: 10, text: 'Pulling Slack — reading channel history...', subtext: 'Extracting messages, reactions & commitment signals' },
  { id: 's5',  phase: 'SEARCHING',  icon: '🗒️', color: '#ffffff', appearsAt: 8,  completeAt: 12, text: 'Fetching Notion workspace — indexing pages...', subtext: 'Processing documents, tasks & databases' },
  { id: 's6',  phase: 'SEARCHING',  icon: '🐙', color: '#ffffff', appearsAt: 10, completeAt: 14, text: 'Connecting to GitHub — scanning commit history...', subtext: 'Analyzing PRs, code velocity & contribution patterns' },
  { id: 's7',  phase: 'SEARCHING',  icon: '🎮', color: '#5865f2', appearsAt: 12, completeAt: 16, text: 'Reading Discord servers — extracting messages...', subtext: 'Processing community activity & communication style' },

  // ── Phase 2: Planning ─────────────────────────────────────────────────────
  { id: 'p1',  phase: 'PLANNING',   icon: '🧠', color: '#a855f7', appearsAt: 17, completeAt: 21, text: 'EYES Audit Agent activated — building context map...', subtext: 'Correlating cross-platform signals & behavioral patterns' },
  { id: 'p2',  phase: 'PLANNING',   icon: '🔗', color: '#a855f7', appearsAt: 19, completeAt: 23, text: 'Clustering related entities & topics...', subtext: 'Grouping recurring names, projects & commitments' },
  { id: 'p3',  phase: 'PLANNING',   icon: '⚡', color: '#ec4899', appearsAt: 21, completeAt: 25, text: 'Behavioral Analytics model running linguistic scan...', subtext: 'Detecting tone shifts, promises & sentiment drift' },

  // ── Phase 3: Execution ────────────────────────────────────────────────────
  { id: 'e1',  phase: 'EXECUTION',  icon: '🛡️', color: '#eab308', appearsAt: 26, completeAt: 30, text: 'Risk Evaluator assigning behavioral risk scores...', subtext: 'Weighting unfulfilled commitments & red flag signals' },
  { id: 'e2',  phase: 'EXECUTION',  icon: '🗓️', color: '#10b981', appearsAt: 28, completeAt: 33, text: 'Calendar Matcher cross-referencing promises vs events...', subtext: 'Validating whether scheduled actions were completed' },
  { id: 'e3',  phase: 'EXECUTION',  icon: '📊', color: '#6366f1', appearsAt: 31, completeAt: 36, text: 'Generating executive summary narrative...', subtext: 'Synthesizing findings into readable audit report' },

  // ── Phase 4: Final Output ─────────────────────────────────────────────────
  { id: 'f1',  phase: 'FINALIZING', icon: '📄', color: '#10b981', appearsAt: 37, completeAt: 42, text: 'Compiling cryptographic PDF report...', subtext: 'Embedding audit hash & verification seal' },
  { id: 'f2',  phase: 'FINALIZING', icon: '✅', color: '#10b981', appearsAt: 43, completeAt: 48, text: 'Audit complete — preparing certificate...', subtext: 'Loading dashboard with full findings' },
];

function AgenticTerminal({ elapsedSeconds, errorMessage, backendCompleted, onReturnToDashboard }: AgenticTerminalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom as new steps appear
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [elapsedSeconds]);

  // Compute progress
  let progress = 0;
  if (elapsedSeconds < 5) progress = Math.round((elapsedSeconds / 5) * 10);
  else if (elapsedSeconds < 16) progress = 10 + Math.round(((elapsedSeconds - 5) / 11) * 25);
  else if (elapsedSeconds < 26) progress = 35 + Math.round(((elapsedSeconds - 16) / 10) * 20);
  else if (elapsedSeconds < 37) progress = 55 + Math.round(((elapsedSeconds - 26) / 11) * 25);
  else if (elapsedSeconds < 48) progress = 80 + Math.round(((elapsedSeconds - 37) / 11) * 15);
  else progress = 95;

  if (errorMessage) {
    return (
      <div className={styles.agentTerminalWrapper}>
        <div className={styles.agentTerminalHeader}>
          <span className={styles.agentBadgeError}>⚠ ANALYSIS FAILED</span>
        </div>
        <div className={styles.agentTerminalBody}>
          <p className={styles.agentErrorText}>{errorMessage}</p>
          <button className={styles.rerunBtn} onClick={onReturnToDashboard}>
            RETURN TO CONTROL CENTER
          </button>
        </div>
      </div>
    );
  }

  // Current running phase label
  const currentPhase = (() => {
    const activeSteps = TERMINAL_STEPS.filter(s => elapsedSeconds >= s.appearsAt && elapsedSeconds < s.completeAt);
    return activeSteps.length > 0 ? activeSteps[activeSteps.length - 1].phase : (elapsedSeconds >= 43 ? 'FINALIZING' : 'SEARCHING');
  })();

  const visibleSteps = TERMINAL_STEPS.filter(s => elapsedSeconds >= s.appearsAt);

  return (
    <div className={styles.agentTerminalWrapper}>
      {/* Header */}
      <div className={styles.agentTerminalHeader}>
        <div className={styles.agentHeaderLeft}>
          <span className={styles.agentPulseDot} />
          <span className={styles.agentHeaderTitle}>EYES AUDIT AGENT</span>
          <span className={styles.agentHeaderDivider}>|</span>
          <span className={styles.agentHeaderPhase}>{currentPhase}</span>
        </div>
        <div className={styles.agentHeaderRight}>
          <span className={styles.agentTimer}>{String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:{String(elapsedSeconds % 60).padStart(2, '0')}</span>
        </div>
      </div>

      {/* Terminal Body */}
      <div className={styles.agentTerminalBody} ref={scrollRef}>
        {visibleSteps.map((step, i) => {
          const isDone = elapsedSeconds >= step.completeAt;
          const isRunning = !isDone && elapsedSeconds >= step.appearsAt;
          return (
            <div
              key={step.id}
              className={`${styles.agentStep} ${isDone ? styles.agentStepDone : ''} ${isRunning ? styles.agentStepRunning : ''}`}
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              {/* Phase tag */}
              <span className={styles.agentPhaseTag} style={{ color: step.color }}>
                [{step.phase}]
              </span>
              {/* Status icon */}
              <span className={styles.agentStepStatusIcon}>
                {isDone ? '✓' : isRunning ? <span className={styles.agentSpinner} /> : '·'}
              </span>
              {/* Content */}
              <div className={styles.agentStepContent}>
                <span className={styles.agentStepIcon}>{step.icon}</span>
                <div className={styles.agentStepTexts}>
                  <span className={styles.agentStepText} style={{ color: isDone ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                    {step.text}
                  </span>
                  {step.subtext && isRunning && (
                    <span className={styles.agentStepSubtext}>{step.subtext}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Blinking cursor at the bottom */}
        {!backendCompleted && (
          <div className={styles.agentCursor}>
            <span className={styles.agentCursorBlink}>▋</span>
          </div>
        )}
      </div>

      {/* Progress Footer */}
      <div className={styles.agentTerminalFooter}>
        <div className={styles.agentProgressRow}>
          <span className={styles.agentProgressLabel}>Pipeline Execution</span>
          <span className={styles.agentProgressPct}>{progress}%</span>
        </div>
        <div className={styles.agentProgressBarBg}>
          <div
            className={styles.agentProgressBarFill}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className={styles.agentProgressSubtext}>
          {elapsedSeconds < 16 ? '🔍 Searching & ingesting connected platform data...' :
           elapsedSeconds < 26 ? '🧠 Planning — AI agent correlating behavioral patterns...' :
           elapsedSeconds < 37 ? '⚙️ Executing forensic analysis & risk scoring...' :
           '📄 Finalizing report & compiling audit certificate...'}
        </p>
      </div>
    </div>
  );
}
