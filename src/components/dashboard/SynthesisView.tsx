'use client';

import React from 'react';
import styles from '../MainContent.module.css';
import {
  SearchIcon,
  ArrowRightIcon,
  ShieldIcon,
  GmailIconOfficial,
  GitHubIconOfficial,
  SlackIconOfficial,
  DiscordIconOfficial,
  NotionIconOfficial,
  CalendarIconOfficial,
  LinearIconOfficial,
  TrelloIconOfficial,
  DropboxIconOfficial,
  VercelIconOfficial
} from '../common/icons/PlatformIcons';
import type { Message } from '@/types/dashboard';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';



type ViewMode = 'dashboard' | 'synthesis' | 'audit' | 'timeline' | 'feed' | 'readiness' | 'connectors' | 'history' | 'action-queue' | 'intelligence';

// ── Types ───────────────────────────────────────────────────────────────────
type Alert = {
  id: string;
  alert_type: string;
  title: string;
  body: string;
  created_at: string;
};

type RightPanelTab = 'mind-map' | 'loops' | 'drift' | 'people';

type StateCluster = {
  id: string; title: string; description: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  platforms: string[]; totalEvents: number;
};
type DetectedLoop = {
  id: string; loop_description: string; occurrence_count: number;
  avg_duration_days: number; is_active: boolean; last_occurrence_at: string;
};
type DriftGap = {
  stated_claim?: string; lived_evidence?: string; gap_summary: string;
  stated?: string; lived?: string;
};
type EntityCorrelation = {
  entity_name: string; entity_type: string;
  cluster_id: string; lift_score: number; sample_size: number;
};
type ForwardInference = {
  current_cluster_label: string;
  next_states: Array<{ cluster_label: string; probability: number; count: number }>;
  total_data_points: number; transition_confidence: number;
} | null;

// ── Props ───────────────────────────────────────────────────────────────────
interface SynthesisViewProps {
  query: string;
  setQuery: (q: string) => void;
  messages: Message[];
  isStreaming: boolean;
  onSubmit: (text: string) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  setView: (v: ViewMode) => void;
  totalMemories: number;
}

const ALERT_ICON: Record<string, string> = {
  ask: '📩', commitment: '📌', deadline: '⏰', reference: '🔗',
};

const SENTIMENT_COLOR: Record<string, string> = {
  positive: '#22c55e', neutral: '#a78bfa', negative: '#f87171',
};

const PLATFORM_ICONS: Record<string, React.ReactElement> = {
  gmail: <GmailIconOfficial size={16} />,
  'google-calendar': <CalendarIconOfficial size={16} />,
  github: <GitHubIconOfficial size={16} />,
  linear: <LinearIconOfficial size={16} />,
  trello: <TrelloIconOfficial size={16} />,
  slack: <SlackIconOfficial size={16} />,
  notion: <NotionIconOfficial size={16} />,
  discord: <DiscordIconOfficial size={16} />,
  dropbox: <DropboxIconOfficial size={16} />,
  vercel: <VercelIconOfficial size={16} />,
};

// ═════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═════════════════════════════════════════════════════════════════════════════

function NeuralLoader() {
  const [step, setStep] = React.useState(0);
  const steps = [
    'Generating neural embedding...',
    'Scanning vector database for semantic matches...',
    'Fetching cognitive behavior clusters...',
    'Synthesizing neural response...'
  ];

  React.useEffect(() => {
    const intervals = [400, 1100, 1800, 2500];
    const timers = intervals.map((time, index) =>
      setTimeout(() => setStep(index), time)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className={styles.neuralLoader}>
      <div className={styles.neuralOrb} />
      <div className={styles.neuralTextContainer}>
        <span className={styles.neuralStatusText}>{steps[step]}</span>
        <span className={styles.neuralSubText}>Cognitive OS · 70B</span>
      </div>
    </div>
  );
}

export function SynthesisView({
  query, setQuery, messages, isStreaming, onSubmit, messagesEndRef, setView, totalMemories,
}: SynthesisViewProps) {
  // ── Alerts state ──────────────────────────────────────────────────────────
  const [alerts, setAlerts] = React.useState<Alert[]>([]);
  React.useEffect(() => {
    fetch('/api/alerts').then(r => r.json()).then(d => setAlerts(d.alerts ?? [])).catch(() => { });
  }, []);
  const dismissAlert = async (id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
    fetch('/api/alerts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => { });
  };

  // ── Right panel state ─────────────────────────────────────────────────────
  const [rightPanelOpen, setRightPanelOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<RightPanelTab>('mind-map');

  // ── Cognitive data ────────────────────────────────────────────────────────
  const [clusters, setClusters] = React.useState<StateCluster[]>([]);
  const [loops, setLoops] = React.useState<DetectedLoop[]>([]);
  const [driftGaps, setDriftGaps] = React.useState<DriftGap[]>([]);
  const [correlations, setCorrelations] = React.useState<EntityCorrelation[]>([]);
  const [inference, setInference] = React.useState<ForwardInference>(null);
  const [cogLoading, setCogLoading] = React.useState(false);

  // Fetch cognitive data when panel opens
  React.useEffect(() => {
    if (!rightPanelOpen) return;
    setCogLoading(true);
    Promise.all([
      fetch('/api/topic-clusters').then(r => r.json()).catch(() => ({ clusters: [] })),
      fetch('/api/cognitive/status').then(r => r.json()).catch(() => ({ loops: [], driftGaps: [] })),
      fetch('/api/cognitive/entity-correlations').then(r => r.json()).catch(() => ({ correlations: [] })),
      fetch('/api/cognitive/next-state').then(r => r.json()).catch(() => ({ inference: null })),
    ]).then(([clusterData, cogData, corrData, inferData]) => {
      setClusters(clusterData.clusters ?? []);
      setLoops(cogData.loops ?? []);
      setDriftGaps(cogData.driftGaps ?? []);
      setCorrelations(corrData.correlations ?? []);
      setInference(inferData.inference ?? null);
    }).finally(() => setCogLoading(false));
  }, [rightPanelOpen]);

  // ── Tab definitions (spec: Mind Map, Loops, Drift, People & Places) ─────
  const TABS: { id: RightPanelTab; label: string; icon: string }[] = [
    { id: 'mind-map', label: 'Mind Map', icon: '🧠' },
    { id: 'loops', label: 'Loops', icon: '🔁' },
    { id: 'drift', label: 'Drift', icon: '📊' },
    { id: 'people', label: 'People & Places', icon: '👥' },
  ];

  return (
    <div className={styles.synthesisLayout} style={{ display: 'flex', flex: 1, minHeight: 0, width: '100%' }}>
      {/* ═══════════ CENTER PANE — CHAT ═══════════ */}
      <div
        className={styles.centerPane}
        style={{
          justifyContent: messages.length > 0 ? 'flex-start' : 'center',
          paddingTop: messages.length > 0 ? '20px' : '0',
          alignItems: 'center',
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
          width: '100%',
        }}
      >
        {/* Hero (no messages) */}
        {messages.length === 0 && (
          <div style={{ width: '100%', maxWidth: '800px', textAlign: 'center' }}>
            <h1 className={styles.brandDisplayTitle}>The EYES</h1>
            <div className={styles.heroSummary} style={{ justifyContent: 'center' }}>
              <div className={styles.shieldIcon}><ShieldIcon size={18} /></div>
              <span>Indexed <strong>{totalMemories.toLocaleString()}</strong> records across your connected sources.</span>
            </div>

            {/* Alerts banner */}
            {alerts.length > 0 && (
              <div style={{ maxWidth: '680px', margin: '0 auto 20px', display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'left' }}>
                {alerts.slice(0, 3).map(alert => (
                  <div key={alert.id} style={{
                    background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)',
                    borderRadius: '12px', padding: '12px 16px',
                    display: 'flex', gap: '10px', alignItems: 'flex-start',
                  }}>
                    <span style={{ fontSize: '18px' }}>{ALERT_ICON[alert.alert_type] ?? '🔔'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '12px', color: '#fbbf24', marginBottom: '3px' }}>{alert.title}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{alert.body}</div>
                    </div>
                    <button onClick={() => dismissAlert(alert.id)} style={{
                      background: 'none', border: 'none', color: 'var(--text-secondary)',
                      cursor: 'pointer', fontSize: '14px', padding: '2px', opacity: 0.4,
                    }}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* Search input */}
            <div className={styles.commandContainer}>
              <div className={styles.commandInputBox}>
                <div className={styles.searchIcon}><SearchIcon /></div>
                <input id="memory-search" name="query" type="text" className={styles.commandInput}
                  placeholder="Search digital memories..."
                  value={query} onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && query.trim()) onSubmit(query.trim()); }}
                  disabled={isStreaming}
                />
                <button className={styles.commandSendBtn}
                  onClick={() => { if (query.trim()) onSubmit(query.trim()); }}
                  disabled={!query.trim() || isStreaming} aria-label="Send query"
                ><ArrowRightIcon /></button>
              </div>
            </div>

            {/* Quick actions */}
            <div className={styles.quickActions}>
              <div className={styles.actionCard} onClick={() => setView('feed')}><span>Memory Feed</span></div>
              <div className={styles.actionCard} onClick={() => setView('timeline')}><span>Time Line</span></div>
              <div className={styles.actionCard} onClick={() => setView('audit')}><span>Audit</span></div>
              <div className={styles.actionCard} onClick={() => setRightPanelOpen(true)}><span>🧠 Mind Map</span></div>
            </div>
          </div>
        )}

        {/* Chat messages */}
        {messages.length > 0 && (
          <div className={styles.chatOutput}>
            {messages.map((m, i) => (
              <div key={i} className={`${styles.chatMessage} ${m.role === 'user' ? styles.userMsg : styles.aiMsg}`}>
                <div className={styles.msgBody}>
                  {m.role === 'assistant' && m.content ? (
                    <div className={styles.markdownContent}>
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ node, ...props }) => <p style={{ margin: '0 0 10px 0', lineHeight: 1.6 }} {...props} />,
                          ul: ({ node, ...props }) => <ul style={{ margin: '0 0 10px 20px', padding: 0, listStyle: 'disc' }} {...props} />,
                          ol: ({ node, ...props }) => <ol style={{ margin: '0 0 10px 20px', padding: 0, listStyle: 'decimal' }} {...props} />,
                          li: ({ node, ...props }) => <li style={{ margin: '4px 0', lineHeight: 1.5 }} {...props} />,
                          table: ({ node, ...props }) => <div style={{ overflowX: 'auto', margin: '16px 0', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }} {...props} /></div>,
                          th: ({ node, ...props }) => <th style={{ borderBottom: '1px solid var(--border-subtle)', padding: '10px 14px', textAlign: 'left', background: 'var(--bg-secondary)', fontWeight: 600, color: 'var(--text-primary)' }} {...props} />,
                          td: ({ node, ...props }) => <td style={{ borderBottom: '1px solid var(--border-subtle)', padding: '10px 14px', color: 'var(--text-secondary)' }} {...props} />,
                          code: ({ node, inline, ...props }: any) =>
                            inline
                              ? <code style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', padding: '2px 6px', borderRadius: '4px', fontSize: '12px', fontFamily: 'monospace' }} {...props} />
                              : <div style={{ background: '#1A1B26', color: '#a9b1d6', padding: '14px', borderRadius: '8px', overflowX: 'auto', margin: '16px 0', fontSize: '12px', fontFamily: 'monospace', border: '1px solid rgba(255,255,255,0.1)' }}><code {...props} /></div>,
                          pre: ({ node, ...props }) => <pre style={{ margin: 0, padding: 0, background: 'transparent' }} {...props} />,
                          strong: ({ node, ...props }) => <strong style={{ fontWeight: 700, color: 'var(--text-primary)' }} {...props} />,
                          h1: ({ node, ...props }) => <h1 style={{ fontSize: '18px', fontWeight: 700, margin: '20px 0 10px', color: 'var(--text-primary)' }} {...props} />,
                          h2: ({ node, ...props }) => <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '18px 0 10px', color: 'var(--text-primary)' }} {...props} />,
                          h3: ({ node, ...props }) => <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '16px 0 8px', color: 'var(--text-primary)' }} {...props} />,
                          a: ({ node, ...props }) => <a style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 500 }} {...props} />,
                          blockquote: ({ node, ...props }) => <blockquote style={{ margin: '12px 0', paddingLeft: '12px', borderLeft: '3px solid var(--border-subtle)', color: 'var(--text-secondary)', fontStyle: 'italic' }} {...props} />
                        }}
                      >{m.content}</ReactMarkdown>
                    </div>
                  ) : m.content}
                  {m.pending && (!m.content ? <NeuralLoader /> : <span className={styles.typingCursor}>▊</span>)}
                </div>
                {/* Citation deep-links — replaced with expanding dock */}
                {m.role === 'assistant' && !m.pending && m.citations && m.citations.length > 0 && (
                  <CitationDock citations={m.citations.slice(0, 4)} setView={setView} />
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Floating chat input */}
        {messages.length > 0 && (
          <div className={styles.chatCommandWrapper}>
            <div className={styles.commandContainer} style={{ maxWidth: '800px', margin: '0 auto', background: 'var(--bg-primary)' }}>
              <div className={styles.commandInputBox} style={{ border: '1px solid var(--border-primary)', boxShadow: 'var(--shadow-lg)' }}>
                <div className={styles.searchIcon}><SearchIcon /></div>
                <input type="text" className={styles.commandInput}
                  placeholder="Ask a follow up..."
                  value={query} onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && query.trim()) onSubmit(query.trim()); }}
                  disabled={isStreaming}
                />
                <button className={styles.commandSendBtn}
                  onClick={() => { if (query.trim()) onSubmit(query.trim()); }}
                  disabled={!query.trim() || isStreaming}
                ><ArrowRightIcon /></button>
              </div>
            </div>
          </div>
        )}


      </div>

      {/* ═══════════ RIGHT PANE — COLLAPSIBLE TABS ═══════════ */}
      {rightPanelOpen && (
        <div className={styles.rightPane}>
          {/* Panel header */}
          <div style={{
            padding: '20px 20px 0', display: 'flex', justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span style={{ fontWeight: 800, fontSize: '14px', letterSpacing: '-0.5px' }}>Intelligence</span>
            <button onClick={() => setRightPanelOpen(false)} style={{
              background: 'none', border: 'none', color: 'var(--text-secondary)',
              cursor: 'pointer', fontSize: '16px', padding: '4px',
            }}>✕</button>
          </div>

          {/* Tab navigation */}
          <div style={{
            display: 'flex', gap: '2px', padding: '12px 16px 0',
            borderBottom: '1px solid var(--border-subtle)',
            overflowX: 'auto', scrollbarWidth: 'none',
          }}>
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                padding: '8px 12px', border: 'none', fontSize: '11px', fontWeight: 700,
                background: activeTab === tab.id ? 'var(--accent-primary)' : 'transparent',
                color: activeTab === tab.id ? 'var(--bg-primary)' : 'var(--text-secondary)',
                borderRadius: '8px 8px 0 0', cursor: 'pointer',
                whiteSpace: 'nowrap', transition: 'all 0.2s',
              }}>
                <span style={{ marginRight: '4px' }}>{tab.icon}</span>{tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
            {cogLoading ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)', fontSize: '12px' }}>
                Loading...
              </div>
            ) : (
              <>
                {/* ── MIND MAP TAB ─────────────────────────────────────── */}
                {activeTab === 'mind-map' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {clusters.length === 0 ? (
                      <PendingMsg text="No patterns detected yet. Connect platforms and sync data." />
                    ) : (
                      <>
                        {/* Horizontal timeline — spec §2.10 */}
                        <div style={{
                          background: 'var(--bg-secondary)', borderRadius: '10px',
                          padding: '14px', marginBottom: '6px',
                        }}>
                          <div style={{ fontSize: '9px', fontWeight: 800, color: 'var(--text-secondary)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '10px' }}>
                            STATE TIMELINE
                          </div>
                          <div style={{ display: 'flex', gap: '2px', height: '28px', borderRadius: '6px', overflow: 'hidden' }}>
                            {clusters.map((c, i) => {
                              const color = SENTIMENT_COLOR[c.sentiment] ?? '#a78bfa';
                              const weight = c.totalEvents || 1;
                              return (
                                <div key={c.id} title={`${c.title} (${c.totalEvents} memories)`} style={{
                                  flex: weight, background: color, opacity: 0.7 + (i === 0 ? 0.3 : 0),
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: '8px', fontWeight: 800, color: '#000',
                                  cursor: 'pointer', transition: 'opacity 0.2s',
                                  minWidth: '20px',
                                }}
                                  onMouseEnter={e => { (e.target as HTMLDivElement).style.opacity = '1'; }}
                                  onMouseLeave={e => { (e.target as HTMLDivElement).style.opacity = '0.7'; }}
                                >
                                  {c.title.length <= 8 ? c.title : ''}
                                </div>
                              );
                            })}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '8px', color: 'var(--text-secondary)' }}>
                            <span>Oldest</span><span>Current</span>
                          </div>
                        </div>

                        {/* Cluster cards with validation — spec §2.2 */}
                        {clusters.map(c => (
                          <MiniClusterCard key={c.id} cluster={c} onRename={async (newLabel) => {
                            await fetch(`/api/cognitive/clusters/${c.id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ user_label: newLabel }),
                            });
                            setClusters(prev => prev.map(cl => cl.id === c.id ? { ...cl, title: newLabel } : cl));
                          }} onReject={async () => {
                            await fetch(`/api/cognitive/clusters/${c.id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ is_current: false }),
                            });
                            setClusters(prev => prev.filter(cl => cl.id !== c.id));
                          }} />
                        ))}

                        {/* Forward inference button — spec §2.9 */}
                        {inference && (
                          <div style={{
                            marginTop: '16px', padding: '14px', borderRadius: '10px',
                            background: 'rgba(147,51,234,0.06)', border: '1px solid rgba(147,51,234,0.15)',
                          }}>
                            <div style={{ fontSize: '10px', fontWeight: 800, color: '#9333ea', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>
                              🔮 WHERE AM I HEADED?
                            </div>
                            <div style={{ fontSize: '12px', marginBottom: '8px' }}>
                              Current: <strong style={{ color: '#a78bfa' }}>{inference.current_cluster_label}</strong>
                            </div>
                            {inference.next_states.slice(0, 3).map((ns, i) => (
                              <div key={i} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '6px 0', fontSize: '12px', borderTop: i > 0 ? '1px solid var(--border-subtle)' : 'none',
                              }}>
                                <span>{ns.cluster_label}</span>
                                <span style={{ fontWeight: 800, color: '#9333ea' }}>{ns.probability}%</span>
                              </div>
                            ))}
                            <div style={{ fontSize: '9px', color: 'var(--text-secondary)', marginTop: '8px', opacity: 0.5 }}>
                              Based on {inference.total_data_points} data points · {Math.round(inference.transition_confidence * 100)}% confidence
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* ── LOOPS TAB ────────────────────────────────────────── */}
                {activeTab === 'loops' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {loops.length === 0 ? (
                      <PendingMsg text="Loop detection pending. Runs automatically as your archive grows." />
                    ) : loops.map(l => (
                      <div key={l.id} style={{
                        background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)',
                        borderRadius: '10px', padding: '12px 14px',
                      }}>
                        <div style={{ fontWeight: 700, fontSize: '12px', color: '#fbbf24', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                          <span>🔁 {l.loop_description}</span>
                          {l.is_active && <span style={{ fontSize: '9px', fontWeight: 800, background: 'rgba(251,191,36,0.15)', padding: '2px 6px', borderRadius: '4px' }}>ACTIVE</span>}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          {l.occurrence_count}× · avg {Math.round(l.avg_duration_days)}d
                          {l.last_occurrence_at && ` · last ${new Date(l.last_occurrence_at).toLocaleDateString()}`}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── DRIFT TAB ────────────────────────────────────────── */}
                {activeTab === 'drift' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {driftGaps.length === 0 ? (
                      <PendingMsg text="Drift analysis pending. Compares stated intentions vs lived behavior." />
                    ) : driftGaps.map((g, i) => (
                      <div key={i} style={{
                        background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)',
                        borderRadius: '10px', padding: '12px 14px',
                      }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>{g.gap_summary}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <div style={{ background: 'rgba(99,102,241,0.08)', borderRadius: '6px', padding: '8px 10px' }}>
                            <div style={{ fontSize: '9px', fontWeight: 800, color: '#818cf8', marginBottom: '2px', textTransform: 'uppercase' }}>Stated</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{g.stated_claim || g.stated}</div>
                          </div>
                          <div style={{ background: 'rgba(248,113,113,0.06)', borderRadius: '6px', padding: '8px 10px' }}>
                            <div style={{ fontSize: '9px', fontWeight: 800, color: '#f87171', marginBottom: '2px', textTransform: 'uppercase' }}>Lived</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{g.lived_evidence || g.lived}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── PEOPLE & PLACES TAB ──────────────────────────────── */}
                {activeTab === 'people' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {correlations.length === 0 ? (
                      <PendingMsg text="Entity correlation mapping pending. Requires state clusters to be established." />
                    ) : correlations.map((c, i) => {
                      const typeIcon: Record<string, string> = { person: '👤', organization: '🏢', tool: '🔧', topic: '📋', place: '📍' };
                      const liftColor = c.lift_score > 2 ? '#22c55e' : c.lift_score > 1.5 ? '#a78bfa' : '#94a3b8';
                      return (
                        <div key={i} style={{
                          background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.1)',
                          borderRadius: '10px', padding: '10px 14px',
                          display: 'flex', gap: '10px', alignItems: 'center',
                        }}>
                          <span style={{ fontSize: '16px' }}>{typeIcon[c.entity_type] ?? '🔹'}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: '12px' }}>{c.entity_name}</div>
                            <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{c.entity_type} · {c.sample_size} mentions</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 800, fontSize: '14px', color: liftColor }}>{c.lift_score.toFixed(1)}×</div>
                            <div style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>lift</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Inject animation keyframe */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ── Mini components for right panel ─────────────────────────────────────────

function PendingMsg({ text }: { text: string }) {
  return (
    <div style={{
      background: 'var(--bg-secondary)', border: '1px dashed var(--border-subtle)',
      borderRadius: '10px', padding: '20px 16px', textAlign: 'center',
    }}>
      <span style={{ fontSize: '20px', display: 'block', marginBottom: '8px', opacity: 0.4 }}>⏳</span>
      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{text}</div>
    </div>
  );
}

function MiniClusterCard({ cluster, onRename, onReject }: { cluster: StateCluster; onRename?: (label: string) => void; onReject?: () => void }) {
  const color = SENTIMENT_COLOR[cluster.sentiment] ?? '#a78bfa';
  return (
    <div style={{
      background: `${color}08`, border: `1px solid ${color}20`,
      borderRadius: '10px', padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ fontWeight: 700, fontSize: '12px', color }}>{cluster.title}</span>
        <span style={{ fontSize: '9px', fontWeight: 800, color, textTransform: 'uppercase' }}>{cluster.sentiment}</span>
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        {cluster.description.slice(0, 120)}{cluster.description.length > 120 ? '...' : ''}
      </div>
      <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
        {cluster.platforms.slice(0, 3).map(p => (
          <span key={p} style={{
            fontSize: '9px', background: 'var(--bg-primary)', color: 'var(--text-secondary)',
            padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-subtle)',
            fontWeight: 600, textTransform: 'uppercase',
          }}>{p}</span>
        ))}
        <span style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>{cluster.totalEvents} mem</span>
        {/* Cluster validation buttons — spec §2.2 */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
          {onRename && (
            <button onClick={() => {
              const newLabel = window.prompt('Rename this cluster:', cluster.title);
              if (newLabel && newLabel.trim()) onRename(newLabel.trim());
            }} style={{
              fontSize: '9px', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer',
              background: 'transparent', border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)', fontWeight: 600,
            }}>✏️</button>
          )}
          {onReject && (
            <button onClick={() => {
              if (window.confirm('Reject this cluster? It will be hidden.')) onReject();
            }} style={{
              fontSize: '9px', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer',
              background: 'transparent', border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)', fontWeight: 600,
            }}>✕</button>
          )}
        </div>
      </div>
    </div>
  );
}

function CitationDock({ citations, setView }: { citations: any[], setView: (v: ViewMode) => void }) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '28px', height: '28px', borderRadius: '14px',
          background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)',
          color: 'var(--text-secondary)', fontSize: '12px',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.3s ease', zIndex: 2
        }}
        title={`${citations.length} Sources`}
      >
        🔗
      </button>

      <div style={{
        display: 'flex', alignItems: 'center',
        background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)',
        borderLeft: 'none',
        borderRadius: '0 14px 14px 0', padding: '0', height: '28px',
        marginLeft: '-14px', paddingLeft: '18px', // Tuck behind the button
        width: expanded ? `${(citations.length * 28) + 20}px` : '0px',
        opacity: expanded ? 1 : 0,
        overflow: 'hidden',
        transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        zIndex: 1,
        whiteSpace: 'nowrap'
      }}>
        {citations.map((c, i) => (
          <div
            key={i}
            title={`${c.title || c.snippet?.slice(0, 40)}...`}
            onClick={() => {
              if (c.sourceUrl) {
                window.open(c.sourceUrl, '_blank');
              } else {
                setView('feed');
                setTimeout(() => document.getElementById('memory-' + c.memoryId)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
              }
            }}
            style={{
              width: '24px', height: '24px', borderRadius: '12px',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontSize: '14px', marginLeft: '2px',
              transition: 'transform 0.2s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.2)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)'; }}
          >
            {PLATFORM_ICONS[c.platform.toLowerCase()] ?? '🔗'}
          </div>
        ))}
      </div>
    </div>
  );
}
