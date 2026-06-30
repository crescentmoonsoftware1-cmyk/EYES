'use client';

import { useEffect, useState } from 'react';
import { useConfirm } from '@/context/ConfirmContext';

type Tab = 'mindmap' | 'loops' | 'drift' | 'people';

type StateVectorDay = {
  date: string;
  cluster_id: string | null;
  dominant_topic: string | null;
  message_volume: number;
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
  const [correlations, setCorrelations] = useState<EntityCorrelation[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [inference, setInference] = useState<Inference | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const load = async () => {
      setLoading(true);
      const [vecRes, corrRes, clustersRes, inferenceRes] = await Promise.allSettled([
        fetch('/api/cognitive/state-vectors?days=90').then(r => r.json()),
        fetch('/api/cognitive/entity-correlations').then(r => r.json()),
        fetch('/api/topic-clusters').then(r => r.json()),
        fetch('/api/cognitive/next-state').then(r => r.json())
      ]);

      if (vecRes.status === 'fulfilled') {
        const vecs: StateVectorDay[] = vecRes.value.vectors ?? [];
        setVectors(vecs);
        const ids = [...new Set(vecs.map(v => v.cluster_id).filter(Boolean))] as string[];
        setClusterIds(ids);
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
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between'
      }}>
        <div style={{ maxWidth: '85%' }}>
          <h2 style={{ 
            color: '#fff', fontSize: '18px', fontWeight: 800, 
            letterSpacing: '-0.02em', margin: 0, display: 'flex', alignItems: 'center', gap: '8px'
          }}>
            Intelligence Layer
          </h2>
          <p style={{ color: '#6366f1', fontSize: '10px', fontWeight: 800, letterSpacing: '0.1em', marginTop: '6px', lineHeight: 1.4, textTransform: 'uppercase' }}>
            Intelligence Layer Active
          </p>
        </div>
        <button onClick={onClose} style={{
          background: 'rgba(255,255,255,0.05)', border: 'none', 
          color: '#fff', borderRadius: '50%', width: '28px', height: '28px',
          cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center',
          justifyContent: 'center', opacity: 0.6, transition: 'opacity 0.2s', marginTop: '2px'
        }}>✕</button>
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
        {!loading && activeTab === 'people' && <PeopleTab correlations={correlations} />}
      </div>
    </div>

  );
}

// ── Mind Map Tab (The Bi-Temporal Graph) ──────────────────────────────────────
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
  const { openConfirm } = useConfirm();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [graphData, setGraphData] = useState<{nodes: any[], edges: any[], merged_nodes_count: number} | null>(null);

  useEffect(() => {
    fetch('/api/cognitive/mindmap')
      .then(r => r.json())
      .then(data => {
        if (!data.error) setGraphData(data);
      })
      .catch(console.error);
  }, []);

  if (!graphData || (!graphData.nodes.length && !graphData.edges.length)) {
      return <EmptyState text="Graph is empty. Sync some data to extract relationships." />;
  }


  const SENTIMENT_COLOR: Record<string, string> = {
    positive: '#22c55e', neutral: '#a78bfa', negative: '#f87171',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      {/* True Mindmap UI: Rendering Nodes & Edges from chronic_edges */}
      <div style={{
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '12px', padding: '14px',
      }}>
        <div style={{ fontSize: '9px', fontWeight: 800, color: '#9ca3af', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
          <span>NEURAL KNOWLEDGE GRAPH</span>
          <span style={{ color: '#10b981' }}>{graphData.merged_nodes_count} duplicates merged by Splink</span>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
          {graphData.edges.map((edge, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px', background: 'rgba(0,0,0,0.2)',
              borderRadius: '8px', border: '1px solid rgba(99,102,241,0.2)'
            }}>
              <div style={{ flex: 1, textAlign: 'right', fontSize: '12px', color: '#e5e7eb', fontWeight: 600 }}>
                {edge.source.replace(/_/g, ' ')}
              </div>
              <div style={{
                background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)',
                color: '#818cf8', fontSize: '10px', padding: '2px 8px', borderRadius: '12px',
                fontWeight: 700, whiteSpace: 'nowrap'
              }}>
                {edge.label}
              </div>
              <div style={{ flex: 1, textAlign: 'left', fontSize: '12px', color: '#e5e7eb', fontWeight: 600 }}>
                {edge.target.replace(/_/g, ' ')}
              </div>
            </div>
          ))}
        </div>
      </div>


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
                  {(c.platforms ?? []).slice(0, 3).map((p: string) => (
                    <span key={p} style={{
                      fontSize: '9px', background: 'rgba(255,255,255,0.05)', color: '#9ca3af',
                      padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)',
                      fontWeight: 600, textTransform: 'uppercase',
                    }}>{p}</span>
                  ))}
                  <span style={{ fontSize: '9px', color: '#6b7280' }}>{c.totalEvents} mem</span>
                  
                  {/* Validation buttons */}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {renamingId === c.id ? (
                      <>
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter' && renameValue.trim()) {
                              await fetch(`/api/cognitive/clusters/${c.id}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ user_label: renameValue.trim(), status: 'confirm' }),
                              });
                              setClusters(prev => prev.map(cl => cl.id === c.id ? { ...cl, title: renameValue.trim() } : cl));
                              setRenamingId(null);
                            }
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          style={{
                            fontSize: '9px', padding: '3px 8px', borderRadius: '4px',
                            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)',
                            color: '#e5e7eb', fontWeight: 600, width: '100px', outline: 'none',
                          }}
                        />
                        <button onClick={() => setRenamingId(null)} style={{
                          fontSize: '9px', padding: '3px 6px', borderRadius: '4px', cursor: 'pointer',
                          background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: '#9ca3af',
                        }}>✕</button>
                      </>
                    ) : (
                      <button onClick={() => { setRenamingId(c.id); setRenameValue(c.title); }} style={{
                        fontSize: '9px', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer',
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                        color: '#e5e7eb', fontWeight: 600,
                      }}>✏️ Rename</button>
                    )}
                    
                    <button onClick={() => {
                      openConfirm({
                        title: 'Reject Cluster?',
                        description: `"${c.title}" will be hidden from your intelligence layer. This helps EYES learn your patterns better.`,
                        confirmLabel: 'Reject',
                        confirmVariant: 'danger',
                        onConfirm: async () => {
                          await fetch(`/api/cognitive/clusters/${c.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ is_current: false, status: 'reject' }),
                          });
                          setClusters(prev => prev.filter(cl => cl.id !== c.id));
                        },
                      });
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
          {(inference.next_states ?? []).slice(0, 3).map((ns, i) => (
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
