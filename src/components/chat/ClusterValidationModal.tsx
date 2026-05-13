'use client';

import { useEffect, useState } from 'react';

type Cluster = {
  id: string;
  cluster_id: string;
  cluster_label: string;
  cluster_description: string;
  characteristics: string[];
  occurrence_count: number;
  status?: string;
};

export function ClusterValidationModal() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [visible, setVisible] = useState(false);
  const [labels, setLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/api/cognitive/clusters?status=draft')
      .then(r => r.json())
      .then(d => {
        const drafts = d.clusters ?? [];
        if (drafts.length > 0) { setClusters(drafts); setVisible(true); }
      })
      .catch(() => {});
  }, []);

  const confirm = async (cluster: Cluster, action: 'confirm' | 'reject') => {
    const label = labels[cluster.id] || cluster.cluster_label;
    await fetch(`/api/cognitive/clusters/${cluster.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: action, user_label: action === 'confirm' ? label : null }),
    }).catch(() => {});
    setClusters(prev => prev.filter(c => c.id !== cluster.id));
    if (clusters.length <= 1) setVisible(false);
  };

  if (!visible || !clusters.length) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '20px',
    }}>
      <div style={{
        background: '#111827', border: '1px solid rgba(99,102,241,0.3)',
        borderRadius: '16px', padding: '28px', maxWidth: '640px', width: '100%',
        maxHeight: '80vh', overflowY: 'auto',
      }}>
        <h2 style={{ margin: '0 0 6px', color: '#e5e7eb', fontSize: '18px', fontWeight: 700 }}>
          🧠 I&apos;ve detected recurring behavioral states
        </h2>
        <p style={{ margin: '0 0 20px', color: '#6b7280', fontSize: '13px' }}>
          Name or reject each pattern — only confirmed states get used in analysis.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {clusters.map(c => (
            <div key={c.id} style={{
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '12px', padding: '16px',
            }}>
              <div style={{ color: '#a78bfa', fontSize: '11px', letterSpacing: '0.1em', marginBottom: '6px' }}>
                DETECTED PATTERN · {c.occurrence_count} occurrences
              </div>
              <input
                type="text"
                defaultValue={c.cluster_label}
                onChange={e => setLabels(prev => ({ ...prev, [c.id]: e.target.value }))}
                style={{
                  width: '100%', background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
                  padding: '8px 12px', color: '#e5e7eb', fontSize: '15px',
                  fontWeight: 600, marginBottom: '8px', boxSizing: 'border-box',
                }}
              />
              <p style={{ margin: '0 0 10px', color: '#9ca3af', fontSize: '13px', lineHeight: 1.5 }}>
                {c.cluster_description}
              </p>
              {c.characteristics?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                  {c.characteristics.map((ch, i) => (
                    <span key={i} style={{
                      background: 'rgba(99,102,241,0.15)', color: '#818cf8',
                      borderRadius: '20px', padding: '2px 10px', fontSize: '11px',
                    }}>{ch}</span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => confirm(c, 'confirm')}
                  style={{
                    flex: 1, background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)',
                    color: '#a78bfa', borderRadius: '8px', padding: '8px',
                    cursor: 'pointer', fontSize: '13px', fontWeight: 600,
                  }}
                >✓ Confirm</button>
                <button
                  onClick={() => confirm(c, 'reject')}
                  style={{
                    flex: 1, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                    color: '#f87171', borderRadius: '8px', padding: '8px',
                    cursor: 'pointer', fontSize: '13px',
                  }}
                >✗ Not a real pattern</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
