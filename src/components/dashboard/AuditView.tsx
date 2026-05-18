'use client';

import React, { useEffect, useState } from 'react';
import styles from './AuditView.module.css';
import type { ReputationAudit, AuditSummary } from '@/types/dashboard';
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
  const [isLoading, setIsLoading] = useState(true);
  const [isInitiating, setIsInitiating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [auditMode, setAuditMode] = useState<'dashboard' | 'running' | 'completed'>('dashboard');

  // Fetch the latest audit on mount
  useEffect(() => {
    const fetchLatest = async () => {
      try {
        const auditRes = await fetch('/api/audit/latest');
        if (auditRes.ok) {
          const data = await auditRes.json();
          if (data) {
            setActiveAudit(data);
            if (data.status === 'completed') {
              setAuditMode('completed');
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch latest audit:', err);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchLatest();
    
    // keep existing load behavior; polling of a specific audit is handled
    // by a dedicated effect that watches `activeAudit.id` so we can
    // perform near-real-time updates for the in-progress audit.
    return () => {};
  }, [activeAudit?.status]);

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
          setAuditMode('completed');
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


  const handleStartAudit = async (type: string = 'full') => {
    setIsInitiating(true);
    setAuditMode('running');
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

  if (isLoading) {
    return (
      <div className={styles.auditContainer}>
        <div className={styles.scanningContainer}>
          <div className={styles.neuralPulse} />
          <div className={styles.scanningText}>ESTABLISHING NEURAL LINK...</div>
        </div>
      </div>
    );
  }

  // 1. DASHBOARD STATE (PROACTIVE)
  if (auditMode === 'dashboard') {
    return (
      <div className={styles.auditContainer}>
        <header className={styles.auditHeader}>
          <div>
            <h1 className={styles.auditTitle}>Audit Control Center</h1>
            <p className={styles.auditSubtitle}>Select a specialized lens for deep neural analysis.</p>
          </div>
        </header>

        <div className={styles.auditGrid}>
          {/* PRIMARY ACTION */}
          <div className={styles.mainAuditCard} onClick={() => handleStartAudit('full')}>
            <div className={styles.cardHeader}>
              <div className={styles.cardBadge}>RECOMMENDED</div>
              <div className={styles.cardIcon}><ShieldIcon size={32} /></div>
            </div>
            <div className={styles.cardBody}>
              <h3>Full Reputation Audit</h3>
              <p>A comprehensive 360° scan of all connected platforms to detect sentiment shifts, commitments, and privacy leaks.</p>
            </div>
            <button className={styles.primaryAuditBtn} disabled={isInitiating}>
              {isInitiating ? 'INITIALIZING...' : 'START FULL SCAN'}
            </button>
          </div>

          {/* SPECIALIZED ACTIONS */}
          <div className={styles.secondaryAuditGrid}>
            <div className={styles.miniAuditCard} onClick={() => handleStartAudit('privacy')}>
              <div className={styles.miniIcon}><PrivacyEyeIcon size={24} /></div>
              <h4>Privacy Leak Scan</h4>
              <p>Detect leaked PII or sensitive identifiers.</p>
            </div>
            <div className={styles.miniAuditCard} onClick={() => handleStartAudit('commitment')}>
              <div className={styles.miniIcon}><OperationalLinkIcon size={24} /></div>
              <h4>Operational Audit</h4>
              <p>Index unfulfilled promises and tasks.</p>
            </div>
            <div className={styles.miniAuditCard} onClick={() => handleStartAudit('sentiment')}>
              <div className={styles.miniIcon}><SentimentChartIcon size={24} /></div>
              <h4>Sentiment Pulse</h4>
              <p>Track real-time emotional variance.</p>
            </div>
          </div>
        </div>

        <div className={styles.readinessFooter}>
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

  // 2. RUNNING / FAILED STATE
  if (auditMode === 'running' || errorMessage) {
    return (
      <div className={styles.auditContainer}>
        <div className={styles.scanningContainer}>
          {errorMessage ? (
            <>
              <div className={styles.errorIcon}>⚠️</div>
              <div className={styles.scanningText}>ANALYSIS FAILED</div>
              <p className={styles.errorDescription}>{errorMessage}</p>
              <button 
                className={styles.rerunBtn} 
                style={{ marginTop: '20px' }}
                onClick={() => {
                  setErrorMessage(null);
                  setAuditMode('dashboard');
                }}
              >
                RETURN TO CONTROL CENTER
              </button>
            </>
          ) : (
            <>
              <div className={styles.neuralPulse} />
              <div className={styles.scanningText}>
                {activeAudit?.status === 'pending' ? 'QUEUEING REQUEST...' :
                  activeAudit?.status === 'analysis' ? 'DEEP NEURAL ANALYSIS...' :
                    'FINALIZING PDF REPORT...'}
              </div>
              <div className={styles.scanningProgress}>
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} />
                </div>
                <p>Analyzing cross-platform vectors. This usually takes 30-45 seconds.</p>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // 3. COMPLETED PREVIEW
  if (auditMode === 'completed' && activeAudit) {
    return (
      <div className={styles.auditContainer}>
        <header className={styles.auditHeader}>
          <div>
            <div className={styles.wordmark}>EYES</div>
            <h1 className={styles.auditTitle}>Audit Certificate</h1>
            <div className={styles.auditMeta}>
              ID: {activeAudit.id.slice(0, 8).toUpperCase()} | {new Date(activeAudit.createdAt).toUTCString()}
            </div>
          </div>
          <div className={styles.headerRight}>
            <button
              className={styles.rerunBtn}
              onClick={() => setAuditMode('dashboard')}
            >
              NEW AUDIT
            </button>
            <div className={styles.confidentialMark}>CONFIDENTIAL</div>
          </div>
        </header>

        <div className={styles.grid}>
          <div className={styles.mainContent}>
            <section className={styles.summaryBox}>
              <h2 className={styles.sectionHeading}>Executive Summary</h2>
              <div className={styles.narrative}>
                {(() => {
                  const raw = activeAudit.summaryNarrative || 'Analysis in progress...';
                  // Pre-process: handle headers and bolding
                  // We split by double newlines for paragraphs, but first we normalize headers
                  const formatted = raw
                    .replace(/#####\s*(.*?)(?:\n|$)/g, '<h4>$1</h4>')
                    .replace(/####\s*(.*?)(?:\n|$)/g, '<h4>$1</h4>')
                    .replace(/###\s*(.*?)(?:\n|$)/g, '<h3>$1</h3>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/---\s*/g, '<hr style="border:0; border-top:1px solid var(--border-subtle); margin:20px 0;" />');

                  return <div dangerouslySetInnerHTML={{ __html: formatted.replace(/\n/g, '<br />') }} />;
                })()}
              </div>

              <div className={styles.metricsRow}>
                <div className={styles.metricCard}>
                  <span className={styles.metricValue}>{activeAudit.mentionsCount || 0}</span>
                  <span className={styles.metricLabel}>Mentions</span>
                </div>
                <div className={styles.metricCard}>
                  <span className={styles.metricValue}>{((activeAudit.metadata?.sentimentBalance || 0) * 100).toFixed(0)}%</span>
                  <span className={styles.metricLabel}>Sentiment</span>
                </div>
                <div className={styles.metricCard}>
                  <span className={styles.metricValue}>{activeAudit.commitmentsCount || 0}</span>
                  <span className={styles.metricLabel}>Commitments</span>
                </div>
              </div>
            </section>
          </div>

          <aside className={styles.sidebar}>
            <div className={styles.riskScoreSection}>
              <div className={styles.riskNumber}>{activeAudit.riskScore}</div>
              <div className={styles.riskInfo}>
                <span className={styles.riskHeadline}>RISK SCORE</span>
                <span className={styles.riskInterpretation}>
                  {activeAudit.riskScore > 7 ? 'CRITICAL' : activeAudit.riskScore > 4 ? 'MODERATE' : 'OPTIMAL'}
                </span>
              </div>
            </div>

            <button
              className={styles.downloadBtn}
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
                  URL.revokeObjectURL(url);
                } catch (err) {
                  console.error('[PDF Download] failed:', err);
                  alert('PDF generation failed. Please try again.');
                } finally {
                  setIsDownloading(false);
                }
              }}
            >
              {isDownloading ? 'GENERATING PDF...' : 'DOWNLOAD FULL PDF'}
            </button>
          </aside>
        </div>
      </div>
    );
  }

  return null;
}
