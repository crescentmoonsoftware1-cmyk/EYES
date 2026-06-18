'use client';

import { useEffect, useState } from 'react';

type Tab = 'mindmap' | 'loops' | 'drift' | 'people';

type StateVectorDay = {
  date: string;
  cluster_id: string | null;
  dominant_topic: string | null;
  message_volume: number;
};

type Loop = {
  id: string;
  loop_description: string;
  occurrence_count: number;
  avg_duration_days: number;
  is_active: boolean;
};

type DriftGap = {
  stated: string;
  lived: string;
  gap_summary: string;
};

type EntityCorrelation = {
  entity_name: string;
  entity_type: string;
  cluster_id: string;
  lift_score: number;
  sample_size: number;
};

type Cluster = {
  id: string;
  title: string;
  description: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  totalEvents: number;
  platforms: string[];
};

type NextState = {
  cluster_label: string;
  probability: number;
};

type Inference = {
  current_cluster_label: string;
  next_states: NextState[];
  total_data_points: number;
  transition_confidence: number;
};

// Stable colour palette for clusters
const CLUSTER_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16',
];

function getClusterColor(clusterId: string | null, clusterIds: string[]): string {
  if (!clusterId) return '#374151';
  const idx = clusterIds.indexOf(clusterId);
  return CLUSTER_COLORS[idx % CLUSTER_COLORS.length] ?? '#6b7280';
}

export function CognitiveRightPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>('mindmap');
  const [vectors, setVectors] = useState<StateVectorDay[]>([]);
  const [clusterIds, setClusterIds] = useState<string[]>([]);
  const [loops, setLoops] = useState<Loop[]>([]);
  const [driftGaps, setDriftGaps] = useState<DriftGap[]>([]);
  const [correlations, setCorrelations] = useState<EntityCorrelation[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [inference, setInference] = useState<Inference | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const load = async () => {
      setLoading(true);
      const [vecRes, statusRes, corrRes, clustersRes, inferenceRes] = await Promise.allSettled([
        fetch('/api/cognitive/state-vectors?days=90').then(r => r.json()),
        fetch('/api/cognitive/status').then(r => r.json()),
        fetch('/api/cognitive/entity-correlations').then(r => r.json()),
        fetch('/api/topic-clusters').then(r => r.json()),
        fetch('/api/cognitive/next-state').then(r => r.json()),
      ]);

      if (vecRes.status === 'fulfilled') {
        const vecs: StateVectorDay[] = vecRes.value.vectors ?? [];
        setVectors(vecs);
        const ids = [...new Set(vecs.map(v => v.cluster_id).filter(Boolean))] as string[];
        setClusterIds(ids);
      }
      if (statusRes.status === 'fulfilled') {
        setLoops(statusRes.value.loops ?? []);
        setDriftGaps(statusRes.value.driftGaps ?? []);
      }
      if (corrRes.status === 'fulfilled') {
        setCorrelations(corrRes.value.correlations ?? []);
      }
      if (clustersRes.status === 'fulfilled') {
        setClusters(clustersRes.value.clusters ?? []);
      }
      if (inferenceRes.status === 'fulfilled') {
        setInference(inferenceRes.value ?? null);
      }
      setLoading(false);
    };

    void load();
  }, [isOpen]);

  if (!isOpen) return null;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'mindmap', label: 'Mind Map' },
    { id: 'loops',   label: 'Loops' },
    { id: 'drift',   label: 'Drift' },
    { id: 'people',  label: 'People' },
  ];

  return (
    <div style={{
      position: 'absolute',
      right: '24px', top: '80px', bottom: '24px',
      width: '420px', 
      background: 'rgba(10, 10, 10, 0.75)',
      backdropFilter: 'blur(30px) saturate(180%)',
      border: '1px solid rgba(99, 102, 241, 0.15)',
      borderRadius: '24px',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      boxShadow: '0 20px 50px rgba(0,0,0,0.8), 0 0 20px rgba(99, 102, 241, 0.05)',
      zIndex: 100,
      animation: 'hologramFadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
    }}>
      {/* Holographic Header */}
      <div style={{
        padding: '24px 28px', 
        background: 'linear-gradient(to bottom, rgba(99, 102, 241, 0.05), transparent)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <div>
          <h2 style={{ 
            color: '#fff', fontSize: '16px', fontWeight: 700, 
            letterSpacing: '-0.02em', margin: 0 
          }}>Intelligence Layer</h2>
          <p style={{ color: '#6366f1', fontSize: '10px', fontWeight: 800, letterSpacing: '0.1em', marginTop: '4px', textTransform: 'uppercase' }}>
            Intelligence Layer Active
          </p>
        </div>
        <button onClick={onClose} style={{
          background: 'rgba(255,255,255,0.05)', border: 'none', 
          color: '#fff', borderRadius: '50%', width: '32px', height: '32px',
          cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center',
          justifyContent: 'center', opacity: 0.6, transition: 'opacity 0.2s'
        }}>×</button>
      </div>

      {/* Futuristic Tabs */}
      <div style={{ 
        display: 'flex', gap: '8px', padding: '0 28px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.05)'
      }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '6px 12px', background: activeTab === t.id ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
              border: '1px solid',
              borderColor: activeTab === t.id ? 'rgba(99, 102, 241, 0.4)' : 'transparent',
              borderRadius: '20px',
              color: activeTab === t.id ? '#a78bfa' : '#4b5563',
              cursor: 'pointer', fontSize: '11px', fontWeight: 700, 
              transition: 'all 0.3s'
            }}
          >{t.label}</button>
        ))}
      </div>

      {/* Content Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '60px', gap: '16px' }}>
            <div className="neural-spinner" />
            <p style={{ color: '#4b5563', fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em' }}>MAPPING SYNAPSES...</p>
          </div>
        )}

        {!loading && activeTab === 'mindmap' && (
          <MindMapTab 
            vectors={vectors} 
            clusterIds={clusterIds} 
            getColor={getClusterColor} 
            clusters={clusters}
            setClusters={setClusters}
            inference={inference}
          />
        )}
        {!loading && activeTab === 'loops' && <LoopsTab loops={loops} />}
        {!loading && activeTab === 'drift' && <DriftTab gaps={driftGaps} />}
        {!loading && activeTab === 'people' && <PeopleTab correlations={correlations} />}
      </div>
    </div>

  );
}

// ── Mind Map Tab ──────────────────────────────────────────────────────────────
function MindMapTab({ 
  vectors, 
  clusterIds, 
  getColor,
  clusters,
  setClusters,
  inference
}: {
  vectors: StateVectorDay[];
  clusterIds: string[];
  getColor: (id: string | null, ids: string[]) => string;
  clusters: Cluster[];
  setClusters: React.Dispatch<React.SetStateAction<Cluster[]>>;
  inference: Inference | null;
}) {
  if (!vectors.length && !clusters.length) return <EmptyState text="Need 21+ days of data to show cluster timeline." />;

  const SENTIMENT_COLOR: Record<string, string> = {
    positive: '#22c55e', neutral: '#a78bfa', negative: '#f87171',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      {/* Proportional Horizontal cluster timeline */}
      {clusters.length > 0 && (
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px', padding: '14px',
        }}>
          <div style={{ fontSize: '9px', fontWeight: 800, color: '#9ca3af', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '10px' }}>
            STATE PATTERNS TIMELINE
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
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '8px', color: '#9ca3af' }}>
            <span>Oldest</span><span>Current</span>
          </div>
        </div>
      )}

      {/* 90-day Daily grid */}
      {vectors.length > 0 && (
        <div style={{
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: '12px', padding: '14px',
        }}>
          <div style={{ fontSize: '9px', fontWeight: 800, color: '#9ca3af', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '10px' }}>
            90-DAY BEHAVIORAL GRID
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
            {vectors.map(v => (
              <div
                key={v.date}
                title={`${v.date}: ${v.dominant_topic ?? 'no topic'} (vol: ${v.message_volume})`}
                style={{
                  width: '12px', height: '28px', borderRadius: '2px',
                  background: getColor(v.cluster_id, clusterIds),
                  opacity: v.message_volume > 0 ? 1 : 0.2,
                  cursor: 'default',
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
            {clusterIds.map((id, i) => (
              <div key={id} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: '#9ca3af' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: CLUSTER_COLORS[i % CLUSTER_COLORS.length] }} />
                Cluster {i + 1}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Validation cards */}
      {clusters.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '9px', fontWeight: 800, color: '#9ca3af', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '2px' }}>
            PATTERN VALIDATION
          </div>
          {clusters.map(c => {
            const color = SENTIMENT_COLOR[c.sentiment] ?? '#a78bfa';
            return (
              <div key={c.id} style={{
                background: `${color}06`, border: `1px solid ${color}1e`,
                borderRadius: '10px', padding: '12px 14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />
                  <span style={{ fontWeight: 700, fontSize: '13px', color: '#fff' }}>{c.title}</span>
                </div>
                <p style={{ margin: 0, fontSize: '11px', color: '#9ca3af', lineHeight: 1.5 }}>
                  {c.description}
                </p>
                <div style={{ display: 'flex', gap: '4px', marginTop: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {c.platforms.slice(0, 3).map((p: string) => (
                    <span key={p} style={{
                      fontSize: '9px', background: 'rgba(255,255,255,0.05)', color: '#9ca3af',
                      padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)',
                      fontWeight: 600, textTransform: 'uppercase',
                    }}>{p}</span>
                  ))}
                  <span style={{ fontSize: '9px', color: '#6b7280' }}>{c.totalEvents} mem</span>
                  
                  {/* Validation buttons */}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
                    <button onClick={async () => {
                      const newLabel = window.prompt('Rename this cluster:', c.title);
                      if (newLabel && newLabel.trim()) {
                        await fetch(`/api/cognitive/clusters/${c.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ user_label: newLabel.trim(), status: 'confirm' }),
                        });
                        setClusters(prev => prev.map(cl => cl.id === c.id ? { ...cl, title: newLabel.trim() } : cl));
                      }
                    }} style={{
                      fontSize: '9px', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer',
                      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                      color: '#e5e7eb', fontWeight: 600,
                    }}>✏️ Rename</button>
                    
                    <button onClick={async () => {
                      if (window.confirm('Reject this cluster? It will be hidden.')) {
                        await fetch(`/api/cognitive/clusters/${c.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ is_current: false, status: 'reject' }),
                        });
                        setClusters(prev => prev.filter(cl => cl.id !== c.id));
                      }
                    }} style={{
                      fontSize: '9px', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer',
                      background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                      color: '#f87171', fontWeight: 600,
                    }}>✕ Reject</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Forward state inference predictor */}
      {inference && (
        <div style={{
          padding: '14px', borderRadius: '12px',
          background: 'rgba(147,51,234,0.08)', border: '1px solid rgba(147,51,234,0.2)',
        }}>
          <div style={{ fontSize: '9px', fontWeight: 800, color: '#c084fc', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>
            🔮 WHERE AM I HEADED?
          </div>
          <div style={{ fontSize: '12px', marginBottom: '8px', color: '#e5e7eb' }}>
            Current: <strong style={{ color: '#a78bfa' }}>{inference.current_cluster_label}</strong>
          </div>
          {inference.next_states.slice(0, 3).map((ns, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '6px 0', fontSize: '12px', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none',
              color: '#9ca3af'
            }}>
              <span>{ns.cluster_label}</span>
              <span style={{ fontWeight: 800, color: '#c084fc' }}>{ns.probability}%</span>
            </div>
          ))}
          <div style={{ fontSize: '9px', color: '#6b7280', marginTop: '8px' }}>
            Based on {inference.total_data_points} data points · {Math.round(inference.transition_confidence * 100)}% confidence
          </div>
        </div>
      )}

    </div>
  );
}

// ── Loops Tab ─────────────────────────────────────────────────────────────────
function LoopsTab({ loops }: { loops: Loop[] }) {
  if (!loops.length) return <EmptyState text="No recurring loops detected yet. Needs 3+ occurrences of the same state." />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {loops.map(l => (
        <div key={l.id} style={{
          background: 'rgba(255,255,255,0.03)', border: `1px solid ${l.is_active ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.07)'}`,
          borderRadius: '10px', padding: '12px',
        }}>
          {l.is_active && (
            <span style={{ fontSize: '10px', color: '#ef4444', fontWeight: 700, letterSpacing: '0.1em' }}>● ACTIVE</span>
          )}
          <p style={{ margin: '4px 0 6px', color: '#e5e7eb', fontSize: '13px' }}>{l.loop_description}</p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <span style={{ color: '#6b7280', fontSize: '12px' }}>{l.occurrence_count}× · avg {Math.round(l.avg_duration_days)}d each</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Drift Tab ─────────────────────────────────────────────────────────────────
function DriftTab({ gaps }: { gaps: DriftGap[] }) {
  if (!gaps.length) return <EmptyState text="No drift detected in the last 14 days. Need both stated and lived content." />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {gaps.map((g, i) => (
        <div key={i} style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(245,158,11,0.2)',
          borderRadius: '10px', padding: '12px',
        }}>
          <p style={{ margin: '0 0 8px', color: '#fbbf24', fontSize: '12px', fontWeight: 600 }}>
            ⚡ {g.gap_summary}
          </p>
          <div style={{ fontSize: '11px', color: '#9ca3af', lineHeight: 1.5 }}>
            <div><strong style={{ color: '#6b7280' }}>STATED:</strong> {g.stated}</div>
            <div><strong style={{ color: '#6b7280' }}>LIVED:</strong> {g.lived}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── People Tab ────────────────────────────────────────────────────────────────
function PeopleTab({ correlations }: { correlations: EntityCorrelation[] }) {
  const [sort, setSort] = useState<'lift' | 'name'>('lift');

  if (!correlations.length) return <EmptyState text="Entity correlations appear after clustering runs with enough entity data." />;

  const sorted = [...correlations].sort((a, b) =>
    sort === 'lift' ? b.lift_score - a.lift_score : a.entity_name.localeCompare(b.entity_name)
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        {(['lift', 'name'] as const).map(s => (
          <button key={s} onClick={() => setSort(s)} style={{
            background: sort === s ? 'rgba(99,102,241,0.2)' : 'none',
            border: '1px solid rgba(99,102,241,0.3)', color: sort === s ? '#818cf8' : '#6b7280',
            borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '11px',
          }}>Sort by {s}</button>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {sorted.map((c, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 10px', background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)', borderRadius: '8px',
          }}>
            <div>
              <span style={{ color: '#e5e7eb', fontSize: '13px', fontWeight: 600 }}>{c.entity_name}</span>
              <span style={{ color: '#4b5563', fontSize: '11px', marginLeft: '6px' }}>{c.entity_type}</span>
            </div>
            <span style={{
              color: c.lift_score >= 2 ? '#10b981' : c.lift_score >= 1.5 ? '#f59e0b' : '#6b7280',
              fontSize: '12px', fontWeight: 700,
            }}>+{c.lift_score.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '60px', gap: '24px' }}>
      <div style={{ 
        position: 'relative', width: '80px', height: '80px', 
        borderRadius: '50%', border: '1px solid rgba(99, 102, 241, 0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(99, 102, 241, 0.02)',
        overflow: 'hidden'
      }}>
        {/* Radar Center Dot */}
        <div style={{ width: '4px', height: '4px', background: '#6366f1', borderRadius: '50%', zIndex: 2 }} />
        {/* Radar Sweep Animation (Inline CSS) */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%', width: '40px', height: '40px',
          background: 'conic-gradient(from 0deg, transparent 70%, rgba(99, 102, 241, 0.4) 100%)',
          transformOrigin: '0 0',
          animation: 'neuralPulseRotate 2s linear infinite',
          zIndex: 1
        }} />
        {/* Grid Lines */}
        <div style={{ position: 'absolute', inset: 0, border: '1px dashed rgba(255,255,255,0.05)', borderRadius: '50%' }} />
      </div>
      <p style={{ color: '#6b7280', fontSize: '11px', textAlign: 'center', maxWidth: '200px', lineHeight: 1.6, fontWeight: 500 }}>
        {text}
      </p>
    </div>
  );
}
