'use client';

import React, { useEffect, useRef, useState } from 'react';
import styles from './ThinkingVeil.module.css';

// Section 06 — The Thinking Veil
// Status lines emitted by real backend stages via polling.
// No "agent", "neural", or "pipeline" vocabulary — Section 06 rule.

export type VeilStage =
  | 'pending'
  | 'aggregate'
  | 'filter'
  | 'extract'
  | 'cross-ref'
  | 'score'
  | 'synth'
  | 'render'
  | 'completed'
  | 'failed';

const STAGE_LINES: Record<VeilStage, string> = {
  pending:    'Preparing your analysis…',
  aggregate:  'Reading records from your connected sources…',
  filter:     'Separating signal from noise…',
  extract:    'Finding every mention of you…',
  'cross-ref':'Checking your commitments against your calendar…',
  score:      'Weighing sentiment and follow-through…',
  synth:      'Writing your report…',
  render:     'Typesetting the PDF…',
  completed:  'Done.',
  failed:     'Something went wrong.',
};

const STAGE_ORDER: VeilStage[] = [
  'pending', 'aggregate', 'filter', 'extract', 'cross-ref', 'score', 'synth', 'render',
];

interface GhostedCard {
  id: number;
  text: string;
  x: number;
  y: number;
  speed: number;
  opacity: number;
}

interface ThinkingVeilProps {
  auditId: string;
  recordCount?: number;           // real COUNT from the audit, passed by AuditView
  onComplete: () => void;
  onError: (msg: string) => void;
  onReturnToDashboard: () => void;
}

export function ThinkingVeil({
  auditId,
  recordCount = 0,
  onComplete,
  onError,
  onReturnToDashboard,
}: ThinkingVeilProps) {
  const [stage, setStage]             = useState<VeilStage>('pending');
  const [error, setError]             = useState<string | null>(null);
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [emailOffered, setEmailOffered] = useState(false);
  const [cards, setCards]             = useState<GhostedCard[]>([]);
  const [displayedLine, setDisplayedLine] = useState('');
  const [typedChars, setTypedChars]   = useState(0);

  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const completedRef = useRef(false);

  // ── Generate ghosted record cards (fake blur layer behind glass) ──────────
  useEffect(() => {
    const platforms = ['Gmail', 'GitHub', 'Calendar', 'Notion', 'Slack', 'Twitter'];
    const verbs = ['sent email', 'committed to', 'scheduled', 'wrote about', 'mentioned', 'replied to'];
    const nouns = ['the project', 'the meeting', 'the deadline', 'the proposal', 'the handover', 'the launch'];

    const generated: GhostedCard[] = Array.from({ length: 18 }, (_, i) => ({
      id: i,
      text: `${platforms[i % platforms.length]}: ${verbs[i % verbs.length]} ${nouns[i % nouns.length]}`,
      x: Math.random() * 85 + 5,      // 5–90% horizontal
      y: Math.random() * 80 + 10,      // 10–90% vertical
      speed: 18 + Math.random() * 24,  // 18–42s animation
      opacity: 0.04 + Math.random() * 0.07, // 4–11% opacity
    }));
    setCards(generated);
  }, []);

  // ── Elapsed timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    timerRef.current = setInterval(() => setElapsedSecs(s => s + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // ── Offer email handoff after 60 seconds ──────────────────────────────────
  useEffect(() => {
    if (elapsedSecs >= 60 && !emailOffered && stage !== 'completed' && stage !== 'failed') {
      setEmailOffered(true);
    }
  }, [elapsedSecs, emailOffered, stage]);

  // ── Poll audit stage from backend ─────────────────────────────────────────
  useEffect(() => {
    if (!auditId) return;

    const poll = async () => {
      if (completedRef.current) return;
      try {
        const res = await fetch(`/api/audit/${auditId}/stage`);
        if (!res.ok) return;
        const data = await res.json() as { stage: VeilStage; status: string; error?: string };

        setStage(data.stage as VeilStage);

        if (data.status === 'completed') {
          completedRef.current = true;
          if (pollRef.current) clearInterval(pollRef.current);
          // Brief pause so user sees the "Done" line before veil clears
          setTimeout(() => onComplete(), 1200);
        }
        if (data.status === 'failed') {
          completedRef.current = true;
          if (pollRef.current) clearInterval(pollRef.current);
          const msg = data.error || 'The analysis encountered an error. Please try again.';
          setError(msg);
          onError(msg);
        }
      } catch {
        // Network blip — keep polling
      }
    };

    poll(); // immediate
    pollRef.current = setInterval(poll, 2500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [auditId, onComplete, onError]);

  // ── Typewriter effect for the current status line ─────────────────────────
  const targetLine = stage === 'aggregate' && recordCount > 0
    ? `Reading ${recordCount.toLocaleString()} records from your connected sources…`
    : STAGE_LINES[stage];

  useEffect(() => {
    setTypedChars(0);
  }, [targetLine]);

  useEffect(() => {
    if (typedChars >= targetLine.length) {
      setDisplayedLine(targetLine);
      return;
    }
    const t = setTimeout(() => {
      setTypedChars(c => Math.min(c + 3, targetLine.length));
    }, 18);
    return () => clearTimeout(t);
  }, [typedChars, targetLine]);

  useEffect(() => {
    setDisplayedLine(targetLine.slice(0, typedChars));
  }, [typedChars, targetLine]);

  const stageIndex = STAGE_ORDER.indexOf(stage);
  const progress   = stage === 'completed' ? 100
    : stageIndex < 0 ? 2
    : Math.round(((stageIndex + 1) / STAGE_ORDER.length) * 94);

  const elapsed = `${String(Math.floor(elapsedSecs / 60)).padStart(2, '0')}:${String(elapsedSecs % 60).padStart(2, '0')}`;

  // ── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className={styles.veilRoot}>
        <div className={styles.glass}>
          <div className={styles.errorBox}>
            <p className={styles.errorTitle}>Analysis failed</p>
            <p className={styles.errorMsg}>{error}</p>
            <button className={styles.returnBtn} onClick={onReturnToDashboard}>
              Return to control centre
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.veilRoot}>
      {/* Ghosted record cards drifting behind the glass */}
      <div className={styles.ghostLayer} aria-hidden="true">
        {cards.map(card => (
          <div
            key={card.id}
            className={styles.ghostCard}
            style={{
              left: `${card.x}%`,
              top:  `${card.y}%`,
              opacity: card.opacity,
              animationDuration: `${card.speed}s`,
              animationDelay: `${-card.id * 1.3}s`,
            }}
          >
            {card.text}
          </div>
        ))}
      </div>

      {/* Frosted glass panel */}
      <div className={styles.glass}>
        <div className={styles.glassInner}>

          {/* Timer */}
          <div className={styles.timerRow}>
            <span className={styles.pulseDot} />
            <span className={styles.timerLabel}>{elapsed}</span>
          </div>

          {/* Status line — typewriter */}
          <div className={styles.statusLine}>
            {displayedLine}
            {typedChars < targetLine.length && (
              <span className={styles.cursor}>▋</span>
            )}
          </div>

          {/* Progress bar */}
          <div className={styles.progressWrap}>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className={styles.progressPct}>{progress}%</span>
          </div>

          {/* Stage breadcrumb */}
          <div className={styles.stageCrumbs}>
            {STAGE_ORDER.map((s, i) => (
              <span
                key={s}
                className={`${styles.stageDot} ${
                  i < stageIndex ? styles.stageDotDone :
                  i === stageIndex ? styles.stageDotActive : ''
                }`}
                title={STAGE_LINES[s]}
              />
            ))}
          </div>

          {/* 60-second email handoff */}
          {emailOffered && (
            <div className={styles.emailOffer}>
              <p>This is taking a while — we'll email it the moment it's ready.</p>
              <button
                className={styles.emailBtn}
                onClick={onReturnToDashboard}
              >
                Send me an email when done
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
