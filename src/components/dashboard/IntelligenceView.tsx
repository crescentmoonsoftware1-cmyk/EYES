'use client';

import React, { useState, useEffect } from 'react';
import styles from '../MainContent.module.css';

// ── Types ──────────────────────────────────────────────────────────────────
type StateCluster = {
  id: string;
  title: string;
  description: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  connectionCount: number;
  totalEvents: number;
  platforms: string[];
};

type DetectedLoop = {
  id: string;
  loop_description: string;
  occurrence_count: number;
  avg_duration_days: number;
  is_active: boolean;
  last_occurrence_at: string;
};

type DriftGap = {
  stated_claim: string;
  lived_evidence: string;
  gap_summary: string;
  stated?: string;
  lived?: string;
};

type EntityCorrelation = {
  entity_id: string;
  entity_name: string;
  entity_type: string;
  cluster_id: string;
  lift_score: number;
  sample_size: number;
};

type ForwardInference = {
  current_cluster_id: string;
  current_cluster_label: string;
  next_states: Array<{
    cluster_id: string;
    cluster_label: string;
    probability: number;
    count: number;
  }>;
  total_data_points: number;
  transition_confidence: number;
} | null;

type IntelligenceData = {
  clusters: StateCluster[];
  loops: DetectedLoop[];
  driftGaps: DriftGap[];
  correlations: EntityCorrelation[];
  inference: ForwardInference;
  lastAnalyzed: string | null;
  source: 'cache' | 'claude' | 'fallback' | null;
};

const SENTIMENT_COLOR: Record<string, string> = {
  positive: '#22c55e',
  neutral:  '#a78bfa',
  negative: '#f87171',
};

const SENTIMENT_BG: Record<string, string> = {
  positive: 'rgba(34,197,94,0.08)',
  neutral:  'rgba(167,139,250,0.08)',
  negative: 'rgba(248,113,113,0.08)',
};

type TabId = 'clusters' | 'loops' | 'drift' | 'entities' | 'forward';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'clusters', label: 'Mind Map',        icon: '🧠' },
  { id: 'loops',    label: 'Loops',           icon: '🔁' },
  { id: 'drift',    label: 'Drift',           icon: '📊' },
  { id: 'entities', label: 'People & Places', icon: '👥' },
  { id: 'forward',  label: 'Trajectory',      icon: '🔮' },
];

// ── Section wrapper ────────────────────────────────────────────────────────
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '48px' }}>
      <h3 className={styles.subHeader} style={{ marginBottom: '24px' }}>● {label}</h3>
      {children}
    </div>
  );
}

// ── Empty / loading state ──────────────────────────────────────────────────
function PendingCard({ title, detail }: { title: string; detail: string }) {
  return (
    <div style={{
      background: 'var(--bg-secondary)', border: '1px dashed var(--border-subtle)',
      borderRadius: '12px', padding: '28px 24px', display: 'flex',
      alignItems: 'center', gap: '16px',
    }}>
      <span style={{ fontSize: '24px', opacity: 0.4 }}>⏳</span>
      <div>
        <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '4px' }}>{title}</div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{detail}</div>
      </div>
    </div>
  );
}

// ── State Cluster card ─────────────────────────────────────────────────────
function ClusterCard({ cluster }: { cluster: StateCluster }) {
  const color = SENTIMENT_COLOR[cluster.sentiment] ?? '#a78bfa';
  const bg    = SENTIMENT_BG[cluster.sentiment]    ?? 'rgba(167,139,250,0.08)';
  return (
    <div style={{
      background: bg, border: `1px solid ${color}30`,
      borderRadius: '14px', padding: '20px 20px 16px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
        <span style={{ fontWeight: 700, fontSize: '14px', color }}>{cluster.title}</span>
        <span style={{
          fontSize: '10px', fontWeight: 800, textTransform: 'uppercase',
          letterSpacing: '1px', color, background: `${color}15`,
          padding: '3px 8px', borderRadius: '6px',
        }}>{cluster.sentiment}</span>
      </div>
      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '12px' }}>
        {cluster.description}
      </p>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {cluster.platforms.slice(0, 4).map(p => (
          <span key={p} style={{
            fontSize: '10px', background: 'var(--bg-primary)', color: 'var(--text-secondary)',
            padding: '3px 8px', borderRadius: '6px', border: '1px solid var(--border-subtle)',
            fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px',
          }}>{p}</span>
        ))}
        <span style={{ fontSize: '10px', color: 'var(--text-secondary)', alignSelf: 'center' }}>
          {cluster.totalEvents} memories
        </span>
      </div>
    </div>
  );
}

// ── Loop card ──────────────────────────────────────────────────────────────
function LoopCard({ loop }: { loop: DetectedLoop }) {
  return (
    <div style={{
      background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)',
      borderRadius: '12px', padding: '18px 20px',
      display: 'flex', gap: '16px', alignItems: 'flex-start',
    }}>
      <span style={{ fontSize: '20px', marginTop: '2px' }}>🔁</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '6px', color: '#fbbf24' }}>
          {loop.loop_description}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          Occurred <strong>{loop.occurrence_count}×</strong>
          {loop.avg_duration_days > 0 && ` · avg ${Math.round(loop.avg_duration_days)} days`}
          {loop.last_occurrence_at && ` · last ${new Date(loop.last_occurrence_at).toLocaleDateString()}`}
        </div>
      </div>
      {loop.is_active && (
        <span style={{
          fontSize: '10px', fontWeight: 800, background: 'rgba(251,191,36,0.15)',
          color: '#fbbf24', padding: '3px 8px', borderRadius: '6px',
          textTransform: 'uppercase', letterSpacing: '1px', whiteSpace: 'nowrap',
        }}>ACTIVE</span>
      )}
    </div>
  );
}

// ── Drift gap card ─────────────────────────────────────────────────────────
function DriftCard({ gap }: { gap: DriftGap }) {
  return (
    <div style={{
      background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)',
      borderRadius: '12px', padding: '18px 20px',
    }}>
      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>Gap Detected</div>
      <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>{gap.gap_summary}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
        <div style={{ background: 'rgba(99,102,241,0.08)', borderRadius: '8px', padding: '10px 12px' }}>
          <div style={{ fontSize: '10px', fontWeight: 800, color: '#818cf8', marginBottom: '4px', textTransform: 'uppercase' }}>Stated</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{gap.stated_claim || gap.stated}</div>
        </div>
        <div style={{ background: 'rgba(248,113,113,0.06)', borderRadius: '8px', padding: '10px 12px' }}>
          <div style={{ fontSize: '10px', fontWeight: 800, color: '#f87171', marginBottom: '4px', textTransform: 'uppercase' }}>Lived</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{gap.lived_evidence || gap.lived}</div>
        </div>
      </div>
    </div>
  );
}

// ── Entity Correlation card ────────────────────────────────────────────────
function EntityCard({ corr, clusterLabels }: { corr: EntityCorrelation; clusterLabels: Record<string, string> }) {
  const liftColor = corr.lift_score > 2 ? '#22c55e' : corr.lift_score > 1.5 ? '#a78bfa' : '#94a3b8';
  const typeIcon: Record<string, string> = { person: '👤', organization: '🏢', tool: '🔧', topic: '📋', place: '📍' };
  return (
    <div style={{
      background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.15)',
      borderRadius: '12px', padding: '16px 18px',
      display: 'flex', gap: '14px', alignItems: 'center',
    }}>
      <span style={{ fontSize: '20px' }}>{typeIcon[corr.entity_type] ?? '🔹'}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '4px' }}>{corr.entity_name}</div>
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
          {corr.entity_type} · Cluster: <strong>{clusterLabels[corr.cluster_id] ?? 'Unknown'}</strong>
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontWeight: 800, fontSize: '16px', color: liftColor }}>{corr.lift_score.toFixed(1)}×</div>
        <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>lift score</div>
      </div>
    </div>
  );
}

// ── Forward Inference panel ────────────────────────────────────────────────
function ForwardInferencePanel({ inference }: { inference: ForwardInference }) {
  if (!inference) {
    return <PendingCard title="Forward inference pending" detail="Requires enough cluster transition data (≥10 state vectors with cluster assignments)." />;
  }
  return (
    <div style={{
      background: 'rgba(147,51,234,0.04)', border: '1px solid rgba(147,51,234,0.15)',
      borderRadius: '14px', padding: '24px',
    }}>
      <div style={{ fontSize: '11px', fontWeight: 800, color: '#9333ea', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '16px' }}>
        🔮 TRAJECTORY FORECAST
      </div>
      <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>
        Current State: <span style={{ color: '#a78bfa' }}>{inference.current_cluster_label}</span>
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
        Based on your past behavioral transitions, the most likely next states are:
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {inference.next_states.map((ns, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            background: 'var(--bg-secondary)', borderRadius: '10px', padding: '12px 16px',
          }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '50%',
              background: `conic-gradient(#9333ea ${ns.probability * 3.6}deg, rgba(147,51,234,0.1) 0deg)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '10px', fontWeight: 800, color: '#9333ea',
            }}>
              {ns.probability}%
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '13px' }}>{ns.cluster_label}</div>
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
              {ns.count} prior transitions
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '16px', opacity: 0.6 }}>
        Confidence: {Math.round(inference.transition_confidence * 100)}% · Based on {inference.total_data_points} data points.
        This is probabilistic, not predictive. Always cited against your own history.
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
interface IntelligenceViewProps {
  onBack: () => void;
}

export function IntelligenceView({ onBack }: IntelligenceViewProps) {
  const [data, setData] = useState<IntelligenceData>({
    clusters: [], loops: [], driftGaps: [], correlations: [],
    inference: null, lastAnalyzed: null, source: null,
  });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('clusters');

  const fetchData = async () => {
    try {
      // Parallel fetch all intelligence data
      const [clustersRes, cogRes, corrRes, inferenceRes] = await Promise.all([
        fetch('/api/topic-clusters'),
        fetch('/api/cognitive/status'),
        fetch('/api/cognitive/entity-correlations'),
        fetch('/api/cognitive/next-state'),
      ]);

      const clustersJson = await clustersRes.json();
      const cogJson = cogRes.ok ? await cogRes.json() : { loops: [], driftGaps: [] };
      const corrJson = corrRes.ok ? await corrRes.json() : { correlations: [] };
      const inferenceJson = inferenceRes.ok ? await inferenceRes.json() : { inference: null };

      setData({
        clusters: clustersJson.clusters || [],
        loops: cogJson.loops || [],
        driftGaps: cogJson.driftGaps || [],
        correlations: corrJson.correlations || [],
        inference: inferenceJson.inference || null,
        lastAnalyzed: clustersJson.generatedAt || null,
        source: clustersJson.source || null,
      });
    } catch (err) {
      console.error('[IntelligenceView] fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const runAnalysis = async () => {
    setAnalyzing(true);
    try {
      // Force fresh Claude analysis by calling topic-clusters with cache-bust
      await fetch('/api/topic-clusters?refresh=1');
      await fetchData();
    } finally {
      setAnalyzing(false);
    }
  };

  // Build cluster label lookup for entity correlations
  const clusterLabels: Record<string, string> = {};
  for (const c of data.clusters) {
    clusterLabels[c.id] = c.title;
  }

  return (
    <div className={styles.readinessContainer}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '32px', paddingBottom: '24px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div>
          <h1 className={styles.pageHeroTitle} style={{ textAlign: 'left', marginBottom: '8px' }}>Intelligence Layer</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
            Behavioral patterns, loops, drift, and entity correlations
            {data.lastAnalyzed && (
              <span style={{ marginLeft: '12px', opacity: 0.5 }}>
                · Last analyzed {new Date(data.lastAnalyzed).toLocaleString()}
                {data.source === 'cache' ? ' (cached)' : data.source === 'claude' ? ' (fresh)' : ''}
              </span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={runAnalysis}
            disabled={analyzing}
            style={{
              padding: '10px 20px', background: analyzing ? 'var(--bg-secondary)' : 'var(--accent-primary)',
              color: analyzing ? 'var(--text-secondary)' : 'var(--bg-primary)',
              border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '13px',
              cursor: analyzing ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
            }}
          >
            {analyzing ? '⏳ Analyzing...' : '⚡ Re-Analyze'}
          </button>
          <button
            onClick={onBack}
            style={{
              padding: '10px 20px', background: 'var(--bg-secondary)',
              color: 'var(--text-primary)', border: '1px solid var(--border-subtle)',
              borderRadius: '10px', fontWeight: 600, fontSize: '13px', cursor: 'pointer',
            }}
          >
            ← Back
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{
        display: 'flex', gap: '4px', marginBottom: '32px',
        borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0',
      }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 18px', border: 'none',
              background: activeTab === tab.id ? 'var(--accent-primary)' : 'transparent',
              color: activeTab === tab.id ? 'var(--bg-primary)' : 'var(--text-secondary)',
              borderRadius: '10px 10px 0 0', fontWeight: activeTab === tab.id ? 700 : 500,
              fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s',
              display: 'flex', gap: '6px', alignItems: 'center',
            }}
          >
            <span>{tab.icon}</span> {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-secondary)' }}>
          <div className={styles.typingCursor} style={{ display: 'inline-block', marginRight: '8px' }} />
          Loading behavioral intelligence...
        </div>
      ) : (
        <>
          {/* ── CLUSTERS / MIND MAP ──────────────────────────────────── */}
          {activeTab === 'clusters' && (
            <Section label="BEHAVIORAL STATE PATTERNS">
              {data.clusters.length === 0 ? (
                <PendingCard
                  title="No patterns detected yet"
                  detail="Connect more platforms and sync data, then click Re-Analyze to detect your cognitive patterns."
                />
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                  {data.clusters.map(c => <ClusterCard key={c.id} cluster={c} />)}
                </div>
              )}
            </Section>
          )}

          {/* ── LOOPS ──────────────────────────────────────────────── */}
          {activeTab === 'loops' && (
            <Section label="DETECTED BEHAVIORAL LOOPS">
              {data.loops.length === 0 ? (
                <PendingCard
                  title="Loop detection pending"
                  detail="Loops are detected after enough historical data is indexed. Runs automatically as your archive grows."
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {data.loops.map(l => <LoopCard key={l.id} loop={l} />)}
                </div>
              )}
            </Section>
          )}

          {/* ── DRIFT ──────────────────────────────────────────────── */}
          {activeTab === 'drift' && (
            <Section label="STATED VS. LIVED DRIFT">
              {data.driftGaps.length === 0 ? (
                <PendingCard
                  title="Drift analysis pending"
                  detail="Drift is detected by comparing what you write in Notion/emails (stated values) against your calendar and output (lived behavior)."
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {data.driftGaps.map((g, i) => <DriftCard key={i} gap={g} />)}
                </div>
              )}
            </Section>
          )}

          {/* ── ENTITY CORRELATIONS ─────────────────────────────────── */}
          {activeTab === 'entities' && (
            <Section label="PEOPLE & PLACES — WHO SHIFTS YOUR STATE">
              {data.correlations.length === 0 ? (
                <PendingCard
                  title="Entity correlation mapping pending"
                  detail="Identifies which people, apps, and contexts shift you into specific cognitive states. Requires state cluster data to be established first."
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {data.correlations.map((c, i) => (
                    <EntityCard key={i} corr={c} clusterLabels={clusterLabels} />
                  ))}
                </div>
              )}
            </Section>
          )}

          {/* ── FORWARD INFERENCE ───────────────────────────────────── */}
          {activeTab === 'forward' && (
            <Section label="FORWARD INFERENCE — WHERE ARE YOU HEADED?">
              <ForwardInferencePanel inference={data.inference} />
            </Section>
          )}
        </>
      )}
    </div>
  );
}
