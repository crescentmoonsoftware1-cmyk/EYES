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
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

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
    // Helper to compute node active states based on elapsed seconds
    const activeState = {
      trigger: elapsedSeconds >= 0,
      supabase: elapsedSeconds >= 0 && elapsedSeconds < 8,
      agent: elapsedSeconds >= 3,
      gemini: elapsedSeconds >= 5 && elapsedSeconds < 28,
      evaluator: elapsedSeconds >= 28,
      calendar: elapsedSeconds >= 28 && elapsedSeconds < 35,
      pdf: elapsedSeconds >= 35,

      wireTriggerToAgent: elapsedSeconds >= 0 && elapsedSeconds < 5,
      wireSupabaseToAgent: elapsedSeconds >= 1 && elapsedSeconds < 6,
      wireGeminiToAgent: elapsedSeconds >= 5 && elapsedSeconds < 28,
      wireAgentToEvaluator: elapsedSeconds >= 25,
      wireEvaluatorToCalendar: elapsedSeconds >= 28 && elapsedSeconds < 35,
      wireEvaluatorToPdf: elapsedSeconds >= 35
    };

    // Smooth progress calculation
    let simulatedProgress = 0;
    if (elapsedSeconds < 5) {
      simulatedProgress = Math.round((elapsedSeconds / 5) * 15);
    } else if (elapsedSeconds < 12) {
      simulatedProgress = 15 + Math.round(((elapsedSeconds - 5) / 7) * 20);
    } else if (elapsedSeconds < 28) {
      simulatedProgress = 35 + Math.round(((elapsedSeconds - 12) / 16) * 35);
    } else if (elapsedSeconds < 35) {
      simulatedProgress = 70 + Math.round(((elapsedSeconds - 28) / 7) * 15);
    } else if (elapsedSeconds < 45) {
      simulatedProgress = 85 + Math.round(((elapsedSeconds - 35) / 10) * 10);
    } else {
      simulatedProgress = 95;
    }

    return (
      <div className={`${styles.auditContainer} ${!errorMessage ? styles.takeover : ''}`}>
        {errorMessage ? (
          <div className={styles.scanningContainer}>
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
          </div>
        ) : (
          <div className={styles.takeoverScanning}>
            <div className={styles.takeoverHeaderMinimal}>
              <span className={styles.minimalBadge}>
                <span className={styles.pulseDot} /> NEURAL FLOW ACTIVE
              </span>
              <span className={styles.minimalDivider}>|</span>
              <span className={styles.minimalTitle}>REPUTATION AUDIT PIPELINE</span>
            </div>

            <div className={styles.takeoverCanvasWrapper}>
              <div className={styles.scanLaser} />

              {/* Tooltip Overlay */}
              {(() => {
                const nodeTooltipPositions: Record<string, { left: number; top: number; title: string; details: string }> = {
                  trigger: { left: 80, top: 145, title: "On Scan Request", details: "Pipeline dispatcher that initializes scanning tasks." },
                  supabase: { left: 220, top: 305, title: "Memory Archive", details: "Retrieves contextual raw chat histories via Supabase DB." },
                  agent: { left: 360, top: 125, title: "EYES Audit Agent", details: "Supervisor agent coordinating memory feeds and analysis runs." },
                  gemini: { left: 520, top: 305, title: "Behavioral Analytics", details: "Performs low-latency linguistic tone analysis and cognitive audits." },
                  evaluator: { left: 640, top: 135, title: "Risk Evaluator", details: "Assigns risk weights and indexes threat metrics." },
                  calendar: { left: 820, top: 45, title: "Calendar Matcher", details: "Validates scheduled events against extracted digital promises." },
                  pdf: { left: 820, top: 235, title: "PDF Compiler", details: "Compiles cryptographic reports with audit verification hashes." }
                };
                if (hoveredNode && nodeTooltipPositions[hoveredNode]) {
                  const pos = nodeTooltipPositions[hoveredNode];
                  return (
                    <div
                      className={styles.nodeTooltip}
                      style={{
                        left: `${pos.left}px`,
                        top: `${pos.top}px`
                      }}
                    >
                      <div className={styles.tooltipTitle}>{pos.title}</div>
                      <div className={styles.tooltipDetails}>{pos.details}</div>
                    </div>
                  );
                }
                return null;
              })()}

              <svg viewBox="0 -10 1000 580" className={`${styles.svgCanvas} ${styles.takeoverCanvas}`}>
                {/* Grid Background Pattern */}
                <defs>
                  <pattern id="dot-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                    <circle cx="2" cy="2" r="1" className={styles.gridDot} />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" rx="16" fill="url(#dot-grid)" />

                {/* Wires (Base layer) */}
                <path d="M 240 240 C 300 240, 300 230, 360 230" className={styles.wireBase} />
                <path d="M 300 360 C 300 320, 410 320, 410 280" className={styles.wireBase} />
                <path d="M 600 360 C 600 320, 490 320, 490 280" className={styles.wireBase} />
                <path d="M 540 230 C 590 230, 590 230, 640 230" className={styles.wireBase} />
                <path d="M 790 210 C 805 210, 805 135, 820 135" className={styles.wireBase} />
                <path d="M 790 250 C 805 250, 805 325, 820 325" className={styles.wireBase} />

                {/* Flowing wires (Active layer) */}
                <path id="wire-trigger-to-agent" d="M 240 240 C 300 240, 300 230, 360 230" className={`${styles.wireActive} ${activeState.wireTriggerToAgent ? styles.wireFlowing : ''}`} />
                <path id="wire-supabase-to-agent" d="M 300 360 C 300 320, 410 320, 410 280" className={`${styles.wireActive} ${activeState.wireSupabaseToAgent ? styles.wireFlowing : ''}`} />
                <path id="wire-gemini-to-agent" d="M 600 360 C 600 320, 490 320, 490 280" className={`${styles.wireActive} ${activeState.wireGeminiToAgent ? styles.wireFlowingCyan : ''}`} stroke="#06b6d4" />
                <path id="wire-agent-to-evaluator" d="M 540 230 C 590 230, 590 230, 640 230" className={`${styles.wireActive} ${activeState.wireAgentToEvaluator ? styles.wireFlowing : ''}`} />
                <path id="wire-evaluator-to-calendar" d="M 790 210 C 805 210, 805 135, 820 135" className={`${styles.wireActive} ${activeState.wireEvaluatorToCalendar ? styles.wireFlowing : ''}`} />
                <path id="wire-evaluator-to-pdf" d="M 790 250 C 805 250, 805 325, 820 325" className={`${styles.wireActive} ${activeState.wireEvaluatorToPdf ? styles.wireFlowing : ''}`} />

                {/* Animated Flowing Data Particles */}
                {activeState.wireTriggerToAgent && (
                  <circle r="3.5" className={styles.particle} fill="#10b981">
                    <animateMotion dur="1.8s" repeatCount="indefinite">
                      <mpath href="#wire-trigger-to-agent" />
                    </animateMotion>
                  </circle>
                )}
                {activeState.wireSupabaseToAgent && (
                  <circle r="3.5" className={styles.particle} fill="#10b981">
                    <animateMotion dur="2.2s" repeatCount="indefinite">
                      <mpath href="#wire-supabase-to-agent" />
                    </animateMotion>
                  </circle>
                )}
                {activeState.wireGeminiToAgent && (
                  <circle r="3.5" className={styles.particleCyan} fill="#06b6d4">
                    <animateMotion dur="2.2s" repeatCount="indefinite">
                      <mpath href="#wire-gemini-to-agent" />
                    </animateMotion>
                  </circle>
                )}
                {activeState.wireAgentToEvaluator && (
                  <circle r="3.5" className={styles.particle} fill="#10b981">
                    <animateMotion dur="1.8s" repeatCount="indefinite">
                      <mpath href="#wire-agent-to-evaluator" />
                    </animateMotion>
                  </circle>
                )}
                {activeState.wireEvaluatorToCalendar && (
                  <circle r="3.5" className={styles.particle} fill="#10b981">
                    <animateMotion dur="1.4s" repeatCount="indefinite">
                      <mpath href="#wire-evaluator-to-calendar" />
                    </animateMotion>
                  </circle>
                )}
                {activeState.wireEvaluatorToPdf && (
                  <circle r="3.5" className={styles.particle} fill="#10b981">
                    <animateMotion dur="1.4s" repeatCount="indefinite">
                      <mpath href="#wire-evaluator-to-pdf" />
                    </animateMotion>
                  </circle>
                )}

                {/* Connection Ports (Pins) */}
                <circle cx="240" cy="240" r="4.5" className={styles.pin} />
                <circle cx="360" cy="230" r="4.5" className={styles.pin} />
                <circle cx="540" cy="230" r="4.5" className={styles.pin} />
                <circle cx="410" cy="280" r="4.5" className={styles.pin} />
                <circle cx="490" cy="280" r="4.5" className={styles.pin} />
                <circle cx="300" cy="360" r="4.5" className={styles.pin} />
                <circle cx="600" cy="360" r="4.5" className={styles.pin} />
                <circle cx="640" cy="230" r="4.5" className={styles.pin} />
                <circle cx="790" cy="210" r="4.5" className={styles.pin} />
                <circle cx="790" cy="250" r="4.5" className={styles.pin} />
                <circle cx="820" cy="135" r="4.5" className={styles.pin} />
                <circle cx="820" cy="325" r="4.5" className={styles.pin} />

                {/* Nodes */}
                {/* 1. Trigger Node */}
                <foreignObject x="80" y="200" width="160" height="80">
                  <div
                    className={`${styles.nodeCard} ${activeState.trigger ? styles.nodeCompleted : ''}`}
                    onMouseEnter={() => setHoveredNode('trigger')}
                    onMouseLeave={() => setHoveredNode(null)}
                  >
                    <div className={styles.nodeIconWrapper} style={{ backgroundColor: 'rgba(249, 115, 22, 0.12)', color: '#f97316' }}>
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                      </svg>
                    </div>
                    <div className={styles.nodeTextWrapper}>
                      <div className={styles.nodeTitle}>On Scan Request</div>
                      <div className={styles.nodeSub}>Trigger Node</div>
                    </div>
                  </div>
                </foreignObject>

                {/* 2. Supabase Memory Node */}
                <foreignObject x="220" y="360" width="160" height="70">
                  <div
                    className={`${styles.nodeCard} ${activeState.supabase ? styles.nodeActive : activeState.agent ? styles.nodeCompleted : ''}`}
                    onMouseEnter={() => setHoveredNode('supabase')}
                    onMouseLeave={() => setHoveredNode(null)}
                  >
                    <div className={styles.nodeIconWrapper} style={{ backgroundColor: 'rgba(6, 182, 212, 0.12)', color: '#06b6d4' }}>
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <ellipse cx="12" cy="5" rx="9" ry="3" />
                        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                        <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
                      </svg>
                    </div>
                    <div className={styles.nodeTextWrapper}>
                      <div className={styles.nodeTitle}>Memory Archive</div>
                      <div className={styles.nodeSub}>Supabase DB</div>
                    </div>
                  </div>
                </foreignObject>

                {/* 3. Gemini Node */}
                <foreignObject x="520" y="360" width="160" height="70">
                  <div
                    className={`${styles.nodeCard} ${activeState.gemini ? styles.nodeActiveSpecial : activeState.evaluator ? styles.nodeCompleted : ''}`}
                    onMouseEnter={() => setHoveredNode('gemini')}
                    onMouseLeave={() => setHoveredNode(null)}
                  >
                    <div className={styles.nodeIconWrapper} style={{ backgroundColor: 'rgba(236, 72, 153, 0.12)', color: '#ec4899' }}>
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1 0-3.12 3 3 0 0 1 0-3.88 2.5 2.5 0 0 1 0-3.12A2.5 2.5 0 0 1 9.5 2Z" />
                        <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 0-3.12 3 3 0 0 0 0-3.88 2.5 2.5 0 0 0 0-3.12A2.5 2.5 0 0 0 14.5 2Z" />
                      </svg>
                    </div>
                    <div className={styles.nodeTextWrapper}>
                      <div className={styles.nodeTitle}>Behavioral Analytics</div>
                      <div className={styles.nodeSub}>Cognitive Model</div>
                    </div>
                  </div>
                </foreignObject>

                {/* 4. Agent Node */}
                <foreignObject x="360" y="180" width="180" height="100">
                  <div
                    className={`${styles.nodeCard} ${activeState.agent ? (activeState.gemini || activeState.supabase ? styles.nodeActive : styles.nodeCompleted) : ''}`}
                    onMouseEnter={() => setHoveredNode('agent')}
                    onMouseLeave={() => setHoveredNode(null)}
                  >
                    <div className={styles.nodeIconWrapper} style={{ backgroundColor: 'rgba(168, 85, 247, 0.12)', color: '#a855f7' }}>
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="10" rx="2" />
                        <circle cx="12" cy="5" r="2" />
                        <path d="M12 7v4" />
                        <line x1="8" y1="16" x2="8" y2="16" />
                        <line x1="16" y1="16" x2="16" y2="16" />
                      </svg>
                    </div>
                    <div className={styles.nodeTextWrapper}>
                      <div className={styles.nodeTitle}>EYES Audit Agent</div>
                      <div className={styles.nodeSub}>Forensic Brain</div>
                    </div>
                  </div>
                </foreignObject>

                {/* 5. Evaluator Node */}
                <foreignObject x="640" y="190" width="150" height="80">
                  <div
                    className={`${styles.nodeCard} ${activeState.evaluator ? (activeState.calendar ? styles.nodeActive : styles.nodeCompleted) : ''}`}
                    onMouseEnter={() => setHoveredNode('evaluator')}
                    onMouseLeave={() => setHoveredNode(null)}
                  >
                    <div className={styles.nodeIconWrapper} style={{ backgroundColor: 'rgba(234, 179, 8, 0.12)', color: '#eab308' }}>
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                    </div>
                    <div className={styles.nodeTextWrapper}>
                      <div className={styles.nodeTitle}>Risk Evaluator</div>
                      <div className={styles.nodeSub}>Behavioral Scorer</div>
                    </div>
                  </div>
                </foreignObject>

                {/* 6. Calendar Node */}
                <foreignObject x="820" y="100" width="160" height="70">
                  <div
                    className={`${styles.nodeCard} ${activeState.calendar ? styles.nodeActive : activeState.pdf ? styles.nodeCompleted : ''}`}
                    onMouseEnter={() => setHoveredNode('calendar')}
                    onMouseLeave={() => setHoveredNode(null)}
                  >
                    <div className={styles.nodeIconWrapper} style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#10b981' }}>
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    </div>
                    <div className={styles.nodeTextWrapper}>
                      <div className={styles.nodeTitle}>Calendar Matcher</div>
                      <div className={styles.nodeSub}>Verify Promises</div>
                    </div>
                  </div>
                </foreignObject>

                {/* 7. PDF Node */}
                <foreignObject x="820" y="290" width="160" height="70">
                  <div
                    className={`${styles.nodeCard} ${activeState.pdf ? styles.nodeActive : ''}`}
                    onMouseEnter={() => setHoveredNode('pdf')}
                    onMouseLeave={() => setHoveredNode(null)}
                  >
                    <div className={styles.nodeIconWrapper} style={{ backgroundColor: 'rgba(99, 102, 241, 0.12)', color: '#6366f1' }}>
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                      </svg>
                    </div>
                    <div className={styles.nodeTextWrapper}>
                      <div className={styles.nodeTitle}>PDF Compiler</div>
                      <div className={styles.nodeSub}>Report Compiler</div>
                    </div>
                  </div>
                </foreignObject>
              </svg>
            </div>

            <div className={styles.takeoverProgress}>
              <div className={styles.simulatedProgressText}>
                <span>Pipeline execution progress</span>
                <span>{simulatedProgress}%</span>
              </div>
              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: `${simulatedProgress}%` }} />
              </div>
              <p className={styles.progressSubtext}>
                {elapsedSeconds < 8 ? 'Ingesting data and running platform filters...' :
                  elapsedSeconds < 28 ? 'Running forensic AI pipeline using Behavioral Analytics...' :
                    elapsedSeconds < 35 ? 'Cross-referencing commitment records with calendar events...' :
                      'Synthesizing reputational findings and preparing PDF certificate...'}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 3. COMPLETED PREVIEW
  if (auditMode === 'completed' && activeAudit) {
    return (
      <div className={styles.auditContainer}>
        <header className={styles.auditHeader}>
          <div>
            <h1 className={styles.auditTitle}>Audit Certificate</h1>
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
        <div className={styles.metricsGrid}>
          <div className={styles.metricCard}>
            <div className={styles.metricHeader}>
              <span className={styles.metricLabel}>Total Footprint</span>
              <span className={styles.metricIcon}>🌐</span>
            </div>
            <div className={styles.metricValue}>{activeAudit.mentionsCount || 0}</div>
            <div className={styles.metricSubText}>Aggregated indexed mentions</div>
          </div>
          <div className={styles.metricCard}>
            <div className={styles.metricHeader}>
              <span className={styles.metricLabel}>Sentiment Balance</span>
              <span className={styles.metricIcon} style={{ color: '#06b6d4' }}>🎭</span>
            </div>
            <div className={styles.metricValue}>{((activeAudit.metadata?.sentimentBalance || 0) * 100).toFixed(0)}%</div>
            <div className={styles.metricSubText}>Positive linguistic alignment</div>
          </div>
          <div className={styles.metricCard}>
            <div className={styles.metricHeader}>
              <span className={styles.metricLabel}>Extracted Promises</span>
              <span className={styles.metricIcon} style={{ color: '#10b981' }}>🤝</span>
            </div>
            <div className={styles.metricValue}>{activeAudit.commitmentsCount || 0}</div>
            <div className={styles.metricSubText}>Identified active commitments</div>
          </div>
        </div>

        {/* 2. Main Two-Column Layout */}
        <div className={styles.grid}>
          <div className={styles.mainContent}>
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
                <div className={styles.obsCard}>
                  <div className={styles.obsLabel}>Compliance Rate</div>
                  <div className={styles.obsValue}>
                    {activeAudit.metadata?.complianceRate || `${(100 - activeAudit.riskScore * 6.5).toFixed(1)}%`}
                  </div>
                </div>
                <div className={styles.obsCard}>
                  <div className={styles.obsLabel}>Linguistic Trajectory</div>
                  <div className={styles.obsValue} style={{ textTransform: 'capitalize' }}>
                    {activeAudit.metadata?.trajectory || (activeAudit.riskScore > 6 ? 'attention required' : activeAudit.riskScore > 3 ? 'stable' : 'optimal')}
                  </div>
                </div>
                <div className={styles.obsCard}>
                  <div className={styles.obsLabel}>Tracked Signals</div>
                  <div className={styles.obsValue}>
                    {activeAudit.metadata?.riskFindings?.length || (activeAudit.riskScore > 0 ? activeAudit.riskScore * 2 + 1 : 0)} Identified
                  </div>
                </div>
                <div className={styles.obsCard}>
                  <div className={styles.obsLabel}>Behavioral Footprint</div>
                  <div className={styles.obsValue}>
                    {(activeAudit.mentionsCount || 0).toLocaleString()} Scanned
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

          <aside className={styles.sidebarCard}>
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
                  <svg width="90" height="90" viewBox="0 0 100 100" className={styles.dialSvg}>
                    <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255, 255, 255, 0.04)" strokeWidth="6" />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke={riskColor}
                      strokeWidth="7"
                      strokeDasharray="251.2"
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      transform="rotate(-90 50 50)"
                      className={styles.dialStroke}
                      style={{ filter: `drop-shadow(0 0 4px ${riskColor}80)` }}
                    />
                    <text x="50" y="44" textAnchor="middle" dominantBaseline="middle" className={styles.dialValue} fill="var(--text-primary)">
                      {activeAudit.riskScore}
                    </text>
                    <text x="50" y="65" textAnchor="middle" dominantBaseline="middle" className={styles.dialLabel} fill={riskColor}>
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
