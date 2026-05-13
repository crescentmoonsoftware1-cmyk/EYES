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
};

type IntelligenceData = {
  clusters: StateCluster[];
  loops: DetectedLoop[];
  driftGaps: DriftGap[];
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
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{gap.stated_claim}</div>
        </div>
        <div style={{ background: 'rgba(248,113,113,0.06)', borderRadius: '8px', padding: '10px 12px' }}>
          <div style={{ fontSize: '10px', fontWeight: 800, color: '#f87171', marginBottom: '4px', textTransform: 'uppercase' }}>Lived</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{gap.lived_evidence}</div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
interface IntelligenceViewProps {
  onBack: () => void;
}

export function IntelligenceView({ onBack }: IntelligenceViewProps) {
  const [data, setData] = useState<IntelligenceData>({ clusters: [], loops: [], driftGaps: [], lastAnalyzed: null, source: null });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  const fetchData = async () => {
    try {
      // Fetch state clusters (from upgraded topic-clusters API)
      const clustersRes = await fetch('/api/topic-clusters');
      const clustersJson = await clustersRes.json();

      // Fetch cognitive data (loops + drift) from DB directly
      const cogRes = await fetch('/api/cognitive/status');
      const cogJson = cogRes.ok ? await cogRes.json() : { loops: [], driftGaps: [] };

      setData({
        clusters: clustersJson.clusters || [],
        loops: cogJson.loops || [],
        driftGaps: cogJson.driftGaps || [],
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

  return (
    <div className={styles.readinessContainer}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '48px', paddingBottom: '32px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div>
          <h1 className={styles.pageHeroTitle} style={{ textAlign: 'left', marginBottom: '8px' }}>Intelligence Layer</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
            Behavioral patterns, loops, and drift detected across your archive
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

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-secondary)' }}>
          <div className={styles.typingCursor} style={{ display: 'inline-block', marginRight: '8px' }} />
          Loading behavioral intelligence...
        </div>
      ) : (
        <>
          {/* ── STATE PATTERNS ───────────────────────────────────────────── */}
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

          {/* ── LOOP DETECTION ───────────────────────────────────────────── */}
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

          {/* ── DRIFT ANALYSIS ───────────────────────────────────────────── */}
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

          {/* ── ENTITY CORRELATIONS ──────────────────────────────────────── */}
          <Section label="ENTITY CORRELATIONS">
            <PendingCard
              title="Entity correlation mapping pending"
              detail="Identifies which people, apps, and contexts shift you into specific cognitive states. Requires state cluster data to be established first."
            />
          </Section>
        </>
      )}
    </div>
  );
}
