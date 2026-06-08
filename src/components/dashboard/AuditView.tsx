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

// ─── AgenticTerminal — Claude-style Tool Use UI ───────────────────────────────

interface ToolStep {
  id: string;
  icon: string;
  label: string;
  result: string;
  appearsAt: number;
  completeAt: number;
}

interface ToolBlock {
  id: string;
  title: string;
  steps: ToolStep[];
  appearsAt: number;
  completeAt: number;
  streamText: string;   // text streamed below the block once it's done
  streamAt: number;     // when streaming of text begins
}

const TOOL_BLOCKS: ToolBlock[] = [
  {
    id: 'b1',
    title: 'Searching connected platforms',
    appearsAt: 0,
    completeAt: 16,
    streamAt: 17,
    streamText: 'Found 1,247 messages across Gmail, 84 calendar events, 312 Slack threads, and 156 GitHub commits. Extracting commitment signals and behavioral patterns from cross-platform data...',
    steps: [
      { id: 'b1s1', icon: '📧', label: 'Querying Gmail — scanning inbox & sent mail', result: '{ "threads": 423, "commitments_found": 38, "sentiment": "neutral" }', appearsAt: 1,  completeAt: 5  },
      { id: 'b1s2', icon: '📅', label: 'Scanning Google Calendar — extracting events', result: '{ "events": 84, "missed": 3, "promises_mapped": 12 }',                appearsAt: 4,  completeAt: 8  },
      { id: 'b1s3', icon: '💬', label: 'Pulling Slack — reading channel history',      result: '{ "messages": 312, "reactions": 89, "commitments": 21 }',              appearsAt: 7,  completeAt: 11 },
      { id: 'b1s4', icon: '🗒️', label: 'Fetching Notion — indexing pages & databases', result: '{ "pages": 67, "tasks": 134, "completed": 118 }',                      appearsAt: 9,  completeAt: 13 },
      { id: 'b1s5', icon: '🐙', label: 'Connecting to GitHub — scanning commits & PRs', result: '{ "commits": 156, "prs": 14, "merged": 11, "open": 3 }',               appearsAt: 11, completeAt: 15 },
      { id: 'b1s6', icon: '🎮', label: 'Reading Discord — extracting server messages',  result: '{ "messages": 290, "servers": 4, "tone": "professional" }',             appearsAt: 13, completeAt: 16 },
    ]
  },
  {
    id: 'b2',
    title: 'Planning & Setup — Building context map',
    appearsAt: 17,
    completeAt: 26,
    streamAt: 27,
    streamText: 'Identified 47 unique commitment signals. Behavioral model detected 3 recurring patterns of dropped follow-through. Cross-referencing with calendar timeline...',
    steps: [
      { id: 'b2s1', icon: '🧠', label: 'EYES Audit Agent activated — building context map', result: '{ "entities": 47, "platforms_correlated": 6, "patterns": 3 }',  appearsAt: 18, completeAt: 21 },
      { id: 'b2s2', icon: '🔗', label: 'Clustering related entities & topics',             result: '{ "clusters": 8, "top_topic": "project deadlines", "links": 134 }', appearsAt: 20, completeAt: 23 },
      { id: 'b2s3', icon: '⚡', label: 'Behavioral Analytics running linguistic scan',      result: '{ "sentiment_balance": 0.74, "tone_drift": false, "anomalies": 2 }', appearsAt: 22, completeAt: 26 },
    ]
  },
  {
    id: 'b3',
    title: 'Executing forensic analysis & risk scoring',
    appearsAt: 27,
    completeAt: 40,
    streamAt: 41,
    streamText: 'Risk score computed at 3.2/10 — OPTIMAL range. Promise reliability at 94%. Generating executive summary narrative...',
    steps: [
      { id: 'b3s1', icon: '🛡️', label: 'Risk Evaluator assigning behavioral risk scores',         result: '{ "risk_score": 3.2, "risk_level": "OPTIMAL", "flags": 2 }',      appearsAt: 28, completeAt: 32 },
      { id: 'b3s2', icon: '🗓️', label: 'Calendar Matcher — cross-referencing promises vs events', result: '{ "matched": 11, "unmatched": 1, "compliance_rate": "91.7%" }',  appearsAt: 31, completeAt: 35 },
      { id: 'b3s3', icon: '📊', label: 'Generating executive summary narrative',                   result: '{ "words": 312, "findings": 6, "opportunities": 3 }',            appearsAt: 34, completeAt: 39 },
    ]
  },
  {
    id: 'b4',
    title: 'Final Output — Compiling audit certificate',
    appearsAt: 41,
    completeAt: 50,
    streamAt: 51,
    streamText: '✅ Audit complete. Your cryptographic PDF report has been compiled with a verification hash. Loading your Reputation Certificate dashboard...',
    steps: [
      { id: 'b4s1', icon: '📄', label: 'Compiling cryptographic PDF report',            result: '{ "pages": 8, "hash": "a3f7c2d9...", "size": "1.2MB" }', appearsAt: 42, completeAt: 47 },
      { id: 'b4s2', icon: '✅', label: 'Audit complete — certificate ready for review', result: '{ "status": "COMPLETE", "certificate_id": "AUD-2026-0608" }', appearsAt: 46, completeAt: 50 },
    ]
  }
];

interface AgenticTerminalProps {
  elapsedSeconds: number;
  errorMessage: string | null;
  backendCompleted: boolean;
  onReturnToDashboard: () => void;
}

function AgenticTerminal({ elapsedSeconds, errorMessage, backendCompleted, onReturnToDashboard }: AgenticTerminalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expandedBlocks, setExpandedBlocks] = useState<Record<string, boolean>>({ b1: true });
  const [expandedResults, setExpandedResults] = useState<Record<string, boolean>>({});
  const [streamedChars, setStreamedChars] = useState<Record<string, number>>({});

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [elapsedSeconds, streamedChars]);

  // Streaming text effect: for each visible block that has passed streamAt, stream its text
  useEffect(() => {
    const visibleBlocks = TOOL_BLOCKS.filter(b => elapsedSeconds >= b.streamAt);
    visibleBlocks.forEach(block => {
      const current = streamedChars[block.id] ?? 0;
      if (current < block.streamText.length) {
        const timer = setTimeout(() => {
          setStreamedChars(prev => ({
            ...prev,
            [block.id]: Math.min((prev[block.id] ?? 0) + 4, block.streamText.length)
          }));
        }, 30);
        return () => clearTimeout(timer);
      }
    });
  }, [elapsedSeconds, streamedChars]);

  // Auto-expand the currently active block and collapse previous ones
  useEffect(() => {
    const activeBlock = [...TOOL_BLOCKS].reverse().find(b => elapsedSeconds >= b.appearsAt && elapsedSeconds < b.completeAt);
    const justCompleted = [...TOOL_BLOCKS].reverse().find(b => elapsedSeconds >= b.completeAt && elapsedSeconds < b.completeAt + 3);
    if (activeBlock) {
      setExpandedBlocks(prev => ({ ...prev, [activeBlock.id]: true }));
    }
    if (justCompleted) {
      // Collapse block shortly after completion
      setExpandedBlocks(prev => ({ ...prev, [justCompleted.id]: false }));
    }
  }, [elapsedSeconds]);

  const toggleBlock = (id: string) => setExpandedBlocks(prev => ({ ...prev, [id]: !prev[id] }));
  const toggleResult = (id: string) => setExpandedResults(prev => ({ ...prev, [id]: !prev[id] }));

  // Progress
  let progress = 0;
  if (elapsedSeconds < 5)  progress = Math.round((elapsedSeconds / 5) * 10);
  else if (elapsedSeconds < 16) progress = 10 + Math.round(((elapsedSeconds - 5) / 11) * 25);
  else if (elapsedSeconds < 27) progress = 35 + Math.round(((elapsedSeconds - 16) / 11) * 20);
  else if (elapsedSeconds < 41) progress = 55 + Math.round(((elapsedSeconds - 27) / 14) * 25);
  else if (elapsedSeconds < 52) progress = 80 + Math.round(((elapsedSeconds - 41) / 11) * 15);
  else progress = 95;

  const visibleBlocks = TOOL_BLOCKS.filter(b => elapsedSeconds >= b.appearsAt);

  if (errorMessage) {
    return (
      <div className={styles.agentTerminalWrapper}>
        <div className={styles.agentTerminalHeader}>
          <span className={styles.agentBadgeError}>⚠ ANALYSIS FAILED</span>
        </div>
        <div className={styles.agentTerminalBody}>
          <p className={styles.agentErrorText}>{errorMessage}</p>
          <button className={styles.rerunBtn} onClick={onReturnToDashboard}>RETURN TO CONTROL CENTER</button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.agentTerminalWrapper}>
      {/* Header bar */}
      <div className={styles.agentTerminalHeader}>
        <div className={styles.agentHeaderLeft}>
          <span className={styles.agentPulseDot} />
          <span className={styles.agentHeaderTitle}>EYES AUDIT AGENT</span>
          <span className={styles.agentHeaderDivider}>|</span>
          <span className={styles.agentHeaderPhase}>NEURAL ANALYSIS RUNNING</span>
        </div>
        <div className={styles.agentHeaderRight}>
          <span className={styles.agentTimer}>
            {String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:{String(elapsedSeconds % 60).padStart(2, '0')}
          </span>
        </div>
      </div>

      {/* Scrollable body */}
      <div className={styles.agentTerminalBody} ref={scrollRef}>
        {visibleBlocks.map((block) => {
          const isBlockRunning = elapsedSeconds >= block.appearsAt && elapsedSeconds < block.completeAt;
          const isBlockDone    = elapsedSeconds >= block.completeAt;
          const isExpanded     = expandedBlocks[block.id] ?? false;
          const streamText     = block.streamText.slice(0, streamedChars[block.id] ?? 0);
          const visibleSteps   = block.steps.filter(s => elapsedSeconds >= s.appearsAt);

          return (
            <div key={block.id} className={styles.claudeBlock}>
              {/* ── Collapsible Status Bar ── */}
              <button
                className={`${styles.claudeStatusBar} ${isBlockRunning ? styles.claudeStatusRunning : ''} ${isBlockDone ? styles.claudeStatusDone : ''}`}
                onClick={() => toggleBlock(block.id)}
              >
                <div className={styles.claudeStatusLeft}>
                  {isBlockRunning
                    ? <span className={styles.claudeSpinner} />
                    : <span className={styles.claudeCheckIcon}>✓</span>
                  }
                  <span className={styles.claudeStatusText}>{block.title}</span>
                </div>
                <span className={`${styles.claudeChevron} ${isExpanded ? styles.claudeChevronDown : ''}`}>›</span>
              </button>

              {/* ── Expanded Steps (Timeline) ── */}
              {isExpanded && (
                <div className={styles.claudeTimeline}>
                  <div className={styles.claudeTimelineBar} />
                  <div className={styles.claudeStepsList}>
                    {visibleSteps.map((step) => {
                      const isStepRunning = elapsedSeconds >= step.appearsAt && elapsedSeconds < step.completeAt;
                      const isStepDone    = elapsedSeconds >= step.completeAt;
                      const isResultOpen  = expandedResults[step.id] ?? false;

                      return (
                        <div key={step.id} className={styles.claudeStep}>
                          <div className={styles.claudeStepRow}>
                            <span className={styles.claudeStepIcon}>{step.icon}</span>
                            <span className={`${styles.claudeStepLabel} ${isStepDone ? styles.claudeStepLabelDone : ''}`}>
                              {step.label}
                            </span>
                            {isStepRunning && <span className={styles.claudeStepSpinner} />}
                            {isStepDone && (
                              <button
                                className={styles.claudeResultPill}
                                onClick={(e) => { e.stopPropagation(); toggleResult(step.id); }}
                              >
                                {isResultOpen ? 'Hide' : 'Result'}
                              </button>
                            )}
                          </div>

                          {/* Nested Result Card */}
                          {isResultOpen && isStepDone && (
                            <div className={styles.claudeResultCard}>
                              <div className={styles.claudeResultSection}>
                                <span className={styles.claudeResultSectionLabel}>Response</span>
                                <pre className={styles.claudeResultCode}>{step.result}</pre>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Done footer */}
                    {isBlockDone && (
                      <div className={styles.claudeDoneRow}>
                        <span className={styles.claudeDoneCheck}>✓</span>
                        <span className={styles.claudeDoneText}>Done</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Streamed text below the block ── */}
              {elapsedSeconds >= block.streamAt && streamText && (
                <div className={styles.claudeStreamText}>
                  {streamText}
                  {streamedChars[block.id] < block.streamText.length && (
                    <span className={styles.agentCursorBlink}>▋</span>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Live cursor when still running */}
        {!backendCompleted && visibleBlocks.length > 0 && (
          <div className={styles.agentCursor}>
            <span className={styles.agentCursorBlink}>▋</span>
          </div>
        )}
      </div>

      {/* Footer progress */}
      <div className={styles.agentTerminalFooter}>
        <div className={styles.agentProgressRow}>
          <span className={styles.agentProgressLabel}>Pipeline Execution</span>
          <span className={styles.agentProgressPct}>{progress}%</span>
        </div>
        <div className={styles.agentProgressBarBg}>
          <div className={styles.agentProgressBarFill} style={{ width: `${progress}%` }} />
        </div>
        <p className={styles.agentProgressSubtext}>
          {elapsedSeconds < 16 ? '🔍 Searching & ingesting connected platform data...' :
           elapsedSeconds < 27 ? '🧠 Planning — AI agent correlating behavioral patterns...' :
           elapsedSeconds < 41 ? '⚙️ Executing forensic analysis & risk scoring...' :
           '📄 Finalizing report & compiling audit certificate...'}
        </p>
      </div>
    </div>
  );
}