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
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);

    Promise.allSettled([
      fetch('/api/cognitive/state-vectors?days=90').then(r => r.json()),
      fetch('/api/cognitive/status').then(r => r.json()),
      fetch('/api/cognitive/entity-correlations').then(r => r.json()),
    ]).then(([vecRes, statusRes, corrRes]) => {
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
      setLoading(false);
    });
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
      width: '380px', flexShrink: 0,
      background: 'rgba(13, 17, 23, 0.7)',
      backdropFilter: 'blur(20px)',
      borderLeft: '1px solid rgba(99, 102, 241, 0.2)',
      display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
      boxShadow: '-10px 0 30px rgba(0,0,0,0.5)',
      animation: 'panelSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
    }}>
      {/* Neural Glow Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 24px', 
        background: 'linear-gradient(to right, rgba(99, 102, 241, 0.05), transparent)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ 
            width: '8px', height: '8px', borderRadius: '50%', 
            background: '#818cf8', boxShadow: '0 0 10px #6366f1' 
          }} />
          <span style={{ 
            color: '#a78bfa', fontSize: '12px', fontWeight: 800, 
            letterSpacing: '0.15em', textTransform: 'uppercase' 
          }}>
            Cognitive Intelligence
          </span>
        </div>
        <button onClick={onClose} style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', 
          color: '#9ca3af', borderRadius: '50%', width: '28px', height: '28px',
          cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center',
          justifyContent: 'center', transition: 'all 0.2s'
        }}>×</button>
      </div>

      {/* Modern Tabs */}
      <div style={{ 
        display: 'flex', padding: '4px', background: 'rgba(0,0,0,0.2)',
        margin: '12px 16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)'
      }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              flex: 1, padding: '8px 4px', background: activeTab === t.id ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
              border: 'none', borderRadius: '8px',
              color: activeTab === t.id ? '#c084fc' : '#6b7280',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              cursor: 'pointer', fontSize: '11px', fontWeight: 700, 
              letterSpacing: '0.02em',
            }}
          >{t.label}</button>
        ))}
      </div>

      {/* Content Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px' }}>
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '60px', gap: '12px' }}>
            <div className="neural-spinner" />
            <p style={{ color: '#4b5563', fontSize: '12px', fontWeight: 500 }}>Synchronizing Patterns...</p>
          </div>
        )}

        {!loading && activeTab === 'mindmap' && (
          <MindMapTab vectors={vectors} clusterIds={clusterIds} getColor={getClusterColor} />
        )}
        {!loading && activeTab === 'loops' && <LoopsTab loops={loops} />}
        {!loading && activeTab === 'drift' && <DriftTab gaps={driftGaps} />}
        {!loading && activeTab === 'people' && <PeopleTab correlations={correlations} />}
      </div>
    </div>
  );
}

// ── Mind Map Tab ──────────────────────────────────────────────────────────────
function MindMapTab({ vectors, clusterIds, getColor }: {
  vectors: StateVectorDay[];
  clusterIds: string[];
  getColor: (id: string | null, ids: string[]) => string;
}) {
  if (!vectors.length) return <EmptyState text="Need 21+ days of data to show cluster timeline." />;

  return (
    <div>
      <p style={{ color: '#6b7280', fontSize: '11px', marginBottom: '12px' }}>
        Last {vectors.length} days — each bar = one day, colored by behavioral cluster
      </p>
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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '16px' }}>
        {clusterIds.map((id, i) => (
          <div key={id} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#9ca3af' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: CLUSTER_COLORS[i % CLUSTER_COLORS.length] }} />
            Cluster {i + 1}
          </div>
        ))}
      </div>
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
    <p style={{ color: '#4b5563', fontSize: '12px', textAlign: 'center', marginTop: '40px', lineHeight: 1.6 }}>
      {text}
    </p>
  );
}
