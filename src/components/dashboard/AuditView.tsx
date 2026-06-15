'use client';

import React, { useEffect, useRef, useState } from 'react';
import styles from './AuditView.module.css';
import type { ReputationAudit, AuditSummary } from '@/types/dashboard';
import { AnimatedNumber } from '../common/AnimatedNumber';
import { ThinkingVeil } from './ThinkingVeil';
import { createClient } from '@/utils/supabase/client';

interface AuditViewProps {
  onBack: () => void;
  summary?: AuditSummary;
}

export function AuditView({ onBack, summary }: AuditViewProps) {
  const [activeAudit, setActiveAudit] = useState<ReputationAudit | null>(null);
  const [isInitiating, setIsInitiating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [auditMode, setAuditMode] = useState<'dashboard' | 'running' | 'completed'>('dashboard');


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

  // Poll to refresh the activeAudit data when the certificate view is showing
  // (the ThinkingVeil handles all completion detection while running)
  useEffect(() => {
    if (auditMode !== 'completed' || !activeAudit?.id) return;

    let stopped = false;
    const poll = async () => {
      if (stopped) return;
      try {
        const res = await fetch(`/api/audit/${activeAudit.id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data) return;
        setActiveAudit(prev => ({ ...(prev ?? {} as Partial<ReputationAudit>), ...data } as ReputationAudit));
        stopped = true; // single refresh on mount is enough
      } catch (err) {
        console.warn('[Audit Poll] failed:', err);
      }
    };

    poll();
    return () => { stopped = true; };
  }, [activeAudit?.id, auditMode]);

  const handleStartAudit = async (type: string = 'full') => {
    setIsInitiating(true);
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
        setActiveAudit({
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
        } as ReputationAudit);

        // Transition to 'running' mode ONLY after the new audit state is queued
        setAuditMode('running');
      }
    } catch (err) {
      console.error('Initiation failed:', err);
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
            <p className={styles.auditSubtitle}>Select a lens to run a deep analysis of your connected data.</p>
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
              <h4>Investor / Reputation</h4>
              <p>"What will someone find when they run diligence on me?" Cold, clinical analysis of unfulfilled commitments, contradictions, and external risks.</p>
            </div>
            <div className={`${styles.miniAuditCard} magnetic-card`} onClick={() => handleStartAudit('behavioral')}>
              <h4>Behavioral / Self</h4>
              <p>"What did I actually accomplish, and what slipped?" Analysis of follow-through, task loops, drift, and dropped commitments.</p>
            </div>
            <div className={`${styles.miniAuditCard} magnetic-card`} onClick={() => handleStartAudit('hiring')}>
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
              : 'SYSTEM READY'}
          </div>
        </div>
      </div>
    );
  }

  // 2. RUNNING / FAILED STATE — Thinking Veil
  if (auditMode === 'running' && activeAudit?.id) {
    return (
      <ThinkingVeil
        auditId={activeAudit.id}
        onComplete={() => setAuditMode('completed')}
        onError={(msg) => { setErrorMessage(msg); setAuditMode('dashboard'); }}
        onReturnToDashboard={() => { setErrorMessage(null); setAuditMode('dashboard'); }}
      />
    );
  }

  // 2b. Error fallback (no audit id yet)
  if (errorMessage) {
    return (
      <ThinkingVeil
        auditId={activeAudit?.id ?? ''}
        onComplete={() => setAuditMode('completed')}
        onError={() => {}}
        onReturnToDashboard={() => { setErrorMessage(null); setAuditMode('dashboard'); }}
      />
    );
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
            </div>
            <div className={styles.metricValue}>
              <AnimatedNumber value={activeAudit.mentionsCount || 0} />
            </div>
            <div className={styles.metricSubText}>Aggregated indexed mentions</div>
          </div>
          <div className={`${styles.metricCard} magnetic-card`}>
            <div className={styles.metricHeader}>
              <span className={styles.metricLabel}>Sentiment Balance</span>
            </div>
            <div className={styles.metricValue}>
              <AnimatedNumber value={((activeAudit.metadata?.sentimentBalance || 0) * 100)} />%
            </div>
            <div className={styles.metricSubText}>Positive linguistic alignment</div>
          </div>
          <div className={`${styles.metricCard} magnetic-card`}>
            <div className={styles.metricHeader}>
              <span className={styles.metricLabel}>Extracted Promises</span>
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
            {/* Minimalist Single Gauge Chart */}
            {(() => {
              const isCritical = activeAudit.riskScore > 7;
              const isModerate = activeAudit.riskScore > 4;
              const riskColor = isCritical ? 'var(--accent-red)' : isModerate ? '#f59e0b' : 'var(--accent-green)';

              // Metric values 0–1
              const promiseVal = activeAudit.riskScore > 7 ? 0.72 : activeAudit.riskScore > 4 ? 0.85 : 0.96;
              const sentimentVal = Math.min(1, (activeAudit.metadata?.sentimentBalance || 1));
              const safetyVal = Math.min(1, (10 - activeAudit.riskScore) / 10);

              const riskFraction = activeAudit.riskScore / 10;
              const circumference = 2 * Math.PI * 60;

              return (
                <div className={styles.singleGaugeContainer}>
                  <div className={styles.gaugeCenter}>
                    <svg className={styles.gaugeSvg} width="160" height="160" viewBox="0 0 160 160">
                      <defs>
                        <filter id="glowSingle">
                          <feGaussianBlur stdDeviation="4" result="blur" />
                          <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                          </feMerge>
                        </filter>
                      </defs>

                      {/* Background Track */}
                      <circle 
                        className={styles.singleRingTrack} 
                        cx="80" cy="80" r="60" 
                        transform="rotate(-90 80 80)" 
                      />
                      
                      {/* Active Fill */}
                      <circle 
                        className={styles.singleRingFill} 
                        cx="80" cy="80" r="60"
                        stroke={riskColor}
                        strokeDasharray={circumference}
                        strokeDashoffset={circumference * (1 - riskFraction)}
                        transform="rotate(-90 80 80)"
                        filter="url(#glowSingle)" 
                      />
                    </svg>
                    <div className={styles.gaugeScore}>
                      <span className={styles.scoreNumber} style={{ color: riskColor }}>
                        {activeAudit.riskScore.toFixed(1)}
                      </span>
                      <span className={styles.scoreText}>RISK SCORE</span>
                    </div>
                  </div>

                  {/* 3-Column Minimal Grid */}
                  <div className={styles.minimalGrid}>
                    <div className={styles.minimalGridItem}>
                      <span className={styles.gridVal}>{Math.round(promiseVal * 100)}%</span>
                      <span className={styles.gridLabel}>Commitments</span>
                      <div className={styles.gridBar}><div className={styles.gridBarFill} style={{ width: `${promiseVal * 100}%`, background: riskColor }}/></div>
                    </div>
                    <div className={styles.minimalGridItem}>
                      <span className={styles.gridVal}>{Math.round(sentimentVal * 100)}%</span>
                      <span className={styles.gridLabel}>Sentiment</span>
                      <div className={styles.gridBar}><div className={styles.gridBarFill} style={{ width: `${sentimentVal * 100}%`, background: riskColor }}/></div>
                    </div>
                    <div className={styles.minimalGridItem}>
                      <span className={styles.gridVal}>{Math.round(safetyVal * 100)}%</span>
                      <span className={styles.gridLabel}>Mentions</span>
                      <div className={styles.gridBar}><div className={styles.gridBarFill} style={{ width: `${safetyVal * 100}%`, background: riskColor }}/></div>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className={styles.sidebarActions}>
              <button
                className={styles.downloadBtnPremium}
                disabled={isDownloading}
                onClick={async () => {
                  if (!activeAudit?.id) return;
                  setIsDownloading(true);
                  try {
                    const supabase = createClient();
                    const { data: { session } } = await supabase.auth.getSession();
                    const res = await fetch(`/api/audit/${activeAudit.id}/pdf`, {
                      headers: {
                        'Authorization': `Bearer ${session?.access_token || ''}`
                      }
                    });
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
                    setActiveAudit(prev => prev ? { ...prev, status: 'pending' } : null);
                    setErrorMessage(null);
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
// Section 06: AgenticTerminal removed — replaced by ThinkingVeil (frosted glass overlay).
// The ThinkingVeil is a self-contained component in ThinkingVeil.tsx.