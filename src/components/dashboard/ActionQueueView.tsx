'use client';

import React, { useState, useEffect, useCallback } from 'react';
import styles from './ActionQueue.module.css';
import { ALL_POSSIBLE_PLATFORMS } from '@/config/platforms';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { BoltIcon } from '../common/icons/PlatformIcons';
import { createClient } from '@/utils/supabase/client';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

interface ActionItem {
  id: string;
  memory_id: string | null;
  source_id?: string | null;
  platform_link?: string | null;
  platform: string;
  title: string;
  description: string;
  suggested_action: string;
  action_type: string;
  method?: 'POST' | 'PATCH' | 'DELETE';
  confidence: number;
  status: string;
  extracted_at: string;
  startTime?: string;
  endTime?: string;
}

interface RecentlyHandledItem {
  id: string;
  platform: string;
  title: string;
  status: string;
  executed_at: string | null;
  extracted_at: string;
}

interface ActionQueueViewProps {
  onBack: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const PLATFORM_ICONS: Record<string, string> = {
  gmail: '📧', 'google-calendar': '📅', github: '🐙',
  linear: '🔷', trello: '📋', slack: '💬', notion: '📄', discord: '🎮',
};

function useCountdown(lastRunAt: string | null, intervalMs = 30 * 60 * 1000) {
  const [remaining, setRemaining] = useState('');
  useEffect(() => {
    if (!lastRunAt) { setRemaining(''); return; }
    const tick = () => {
      const nextRun = new Date(lastRunAt).getTime() + intervalMs;
      const diff = nextRun - Date.now();
      if (diff <= 0) { setRemaining('any moment'); return; }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${m}m ${s.toString().padStart(2, '0')}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastRunAt, intervalMs]);
  return remaining;
}

function getConversationalSummary(action: ActionItem) {
  const platformName = action.platform.toLowerCase() === 'gmail' ? 'an email' : `a ${action.platform} message`;
  let sender = 'Someone';
  
  const match = action.description?.match(/^([a-zA-Z0-9\s\-_]+)\s+asked:/i);
  if (match) {
    sender = match[1];
  } else if (action.description?.includes('asked:')) {
    sender = action.description.split('asked:')[0].trim();
  } else {
    const firstWord = action.title.split(' ')[0] || '';
    const actionVerbs = ['review', 'send', 'create', 'reply', 'submit', 'schedule', 'update', 'approve', 'dismiss', 'check', 'verify', 'vote', 'invite', 'trade', 'resolve', 'attend'];
    if (firstWord && !actionVerbs.includes(firstWord.toLowerCase())) {
      sender = firstWord;
    } else {
      sender = 'Someone';
    }
  }

  let cleanDesc = action.description || '';
  if (cleanDesc.includes('Citations:')) {
    cleanDesc = cleanDesc.split('Citations:')[0].trim();
  }
  cleanDesc = cleanDesc.replace(/^.*asked:\s*/i, '').replace(/^"|"$/g, '').trim();
  if (!cleanDesc) {
    cleanDesc = action.title;
  }

  return { sender, platformName, cleanDesc };
}

function parseCitations(desc: string) {
  const citations: string[] = [];
  const lines = desc.split('\n');
  let inCitations = false;
  for (const line of lines) {
    if (line.toLowerCase().includes('citations:')) {
      inCitations = true;
      continue;
    }
    if (inCitations && line.trim().startsWith('-')) {
      citations.push(line.trim().slice(1).trim());
    }
  }
  return citations;
}

function getNativePlatformLink(action: ActionItem) {
  if (action.platform_link) return action.platform_link;

  const platform = action.platform.toLowerCase();
  const sourceId = action.source_id;
  
  if (platform === 'gmail') {
    if (sourceId) {
      return `https://mail.google.com/mail/u/0/#all/${sourceId}`;
    }
    return `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(action.title)}`;
  }
  
  if (platform === 'slack') {
    if (sourceId && !sourceId.startsWith('test_')) {
      return `https://slack.com/app_redirect?channel=${sourceId}`;
    }
    return 'https://slack.com';
  }
  
  if (platform === 'github') {
    if (sourceId) return `https://github.com/${sourceId}`;
    return 'https://github.com';
  }

  if (platform === 'linear') {
    if (sourceId) return `https://linear.app/issue/${sourceId}`;
    return 'https://linear.app';
  }
  
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ActionQueueView({ onBack }: ActionQueueViewProps) {
  const [actions, setActions] = useState<ActionItem[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [recentlyHandled, setRecentlyHandled] = useState<RecentlyHandledItem[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [scanStats, setScanStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'priority' | 'meetings' | 'communications' | 'tasks'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedAction, setEditedAction] = useState<ActionItem | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [refiningId, setRefiningId] = useState<string | null>(null);
  // undoToast: holds the dismissed item + its removal timer so Undo can cancel it
  const [undoToast, setUndoToast] = useState<{ action: ActionItem; timerId: ReturnType<typeof setTimeout> } | null>(null);
  const countdown = useCountdown(lastRunAt);

  // ── Step 1: Load instantly from DB ───────────────────────────────────────────
  const loadFromDB = useCallback(async () => {
    try {
      const res = await fetch('/api/actions/queue', { method: 'GET' });
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!res.ok) throw new Error(`Queue load error: ${res.status}`);
      const data = await res.json();

      setActions(data.actions ?? []);
      setLastRunAt(data.meta?.lastRunAt ?? null);
      setScanStats(data.meta?.scanStats ?? {});
      setRecentlyHandled(data.recentlyHandled ?? []);

      // ── Step 2: If stale, trigger background extraction (non-blocking) ─────
      if (data.meta?.isStale) {
        console.log('[ActionQueue] Stale — triggering background extraction...');
        triggerBackgroundExtraction();
      }
    } catch (e) {
      console.error('[ActionQueue] Load failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Trigger extraction in background — UI doesn't wait for this
  const triggerBackgroundExtraction = async () => {
    setRefreshing(true);
    try {
      await fetch('/api/actions/extract', { method: 'POST' });
      // Real-time subscription will push new actions — no need to re-fetch
    } catch (e) {
      console.warn('[ActionQueue] Background extraction failed:', e);
    } finally {
      setRefreshing(false);
    }
  };

  // Manual re-scan button
  const handleRescan = async () => {
    setRefreshing(true);
    try {
      await fetch('/api/actions/extract', { method: 'POST' });
    } catch (e) {
      console.warn('[ActionQueue] Re-scan failed:', e);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadFromDB();
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const actionId = params.get('id');
      if (actionId) {
        setExpandedId(actionId);
      }
    }
  }, [loadFromDB]);

  useEffect(() => {
    if (expandedId && actions.length > 0) {
      setTimeout(() => {
        const el = document.getElementById(expandedId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
    }
  }, [expandedId, actions]);

  // ── Step 3: Real-time subscription — replaces 30s polling ────────────────────
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel('action_queue_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'action_queue' },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          if (payload.eventType === 'INSERT') {
            const newAction = payload.new as unknown as ActionItem;
            if (newAction.status === 'pending') {
              setActions(prev => {
                if (prev.find(a => a.id === newAction.id)) return prev;
                return [newAction, ...prev];
              });
            }
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as unknown as ActionItem;
            if (updated.status !== 'pending') {
              // Remove from UI if no longer pending
              setActions(prev => prev.filter(a => a.id !== updated.id));
            } else {
              setActions(prev => prev.map(a => a.id === updated.id ? updated : a));
            }
          } else if (payload.eventType === 'DELETE') {
            setActions(prev => prev.filter(a => a.id !== (payload.old as unknown as ActionItem).id));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── Action handlers ──────────────────────────────────────────────────────────

  // Single atomic call: approved → execute → executed|failed
  const handleApprove = async (action: ActionItem) => {
    // C5 fix: explicit null guard — editedAction || action would silently discard
    // user edits if editedAction happened to be null due to a state race.
    const finalAction = (editingId === action.id && editedAction != null)
      ? editedAction
      : action;
    setProcessingId(action.id);
    try {
      const res = await fetch('/api/actions/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: finalAction.id,
          title: finalAction.title,
          suggested_action: finalAction.suggested_action,
          startTime: finalAction.startTime,
          endTime: finalAction.endTime,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('[ActionQueue] Approve failed:', data.error);
      }
      // Realtime subscription will remove the card; do it optimistically too
      setActions(prev => prev.filter(a => a.id !== action.id));
      setEditingId(null);
      setEditedAction(null);
    } catch (e) {
      console.error('[ActionQueue] Approve network error:', e);
    } finally {
      setProcessingId(null);
    }
  };

  // Dismiss with 3-second undo window before committing to DB
  const handleDismiss = (action: ActionItem) => {
    if (editingId === action.id) { setEditingId(null); setEditedAction(null); }

    // Cancel any previous pending toast first
    if (undoToast) {
      clearTimeout(undoToast.timerId);
      // Commit the previous one immediately before showing new toast
      fetch('/api/actions/queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: undoToast.action.id, status: 'dismissed' }),
      }).catch(e => console.warn('[ActionQueue] Dismiss persist failed:', e));
    }

    // Optimistically remove from list
    setActions(prev => prev.filter(a => a.id !== action.id));

    // Schedule DB write after 3 seconds (cancellable)
    const timerId = setTimeout(() => {
      fetch('/api/actions/queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: action.id, status: 'dismissed' }),
      }).catch(e => console.warn('[ActionQueue] Dismiss persist failed:', e));
      setUndoToast(null);
    }, 3000);

    setUndoToast({ action, timerId });
  };

  const handleUndoDismiss = () => {
    if (!undoToast) return;
    clearTimeout(undoToast.timerId);
    // Restore the action to the top of the list
    setActions(prev => [undoToast.action, ...prev]);
    setUndoToast(null);
  };

  const startEditing = (action: ActionItem) => {
    setEditingId(action.id);
    setEditedAction({ ...action });
  };

  const handleEditChange = (action: ActionItem, field: keyof ActionItem, value: string) => {
    if (editingId !== action.id) {
      setEditingId(action.id);
      setEditedAction({ ...action, [field]: value });
    } else if (editedAction) {
      setEditedAction({ ...editedAction, [field]: value });
    }
  };

  const applyQuickRefine = async (action: ActionItem, type: 'shorter' | 'formal' | 'calendar') => {
    const currentText = editingId === action.id ? editedAction?.suggested_action || action.suggested_action : action.suggested_action;

    // Enter edit mode immediately with the current text so user sees the field
    if (editingId !== action.id) {
      setEditingId(action.id);
      setEditedAction({ ...action });
    }
    setRefiningId(action.id);

    try {
      const res = await fetch('/api/actions/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: currentText, type }),
      });
      const data = await res.json();
      if (res.ok && data.refined) {
        setEditedAction(prev => prev ? { ...prev, suggested_action: data.refined } : { ...action, suggested_action: data.refined });
      }
    } catch (e) {
      console.warn('[ActionQueue] Refine failed:', e);
    } finally {
      setRefiningId(null);
    }
  };

  const filtered = actions.filter(a => {
    if (activeFilter === 'priority') return a.confidence >= 80;
    if (activeFilter === 'meetings') return a.action_type === 'CALENDAR';
    if (activeFilter === 'communications') return ['gmail', 'slack', 'discord'].includes(a.platform.toLowerCase());
    if (activeFilter === 'tasks') return ['github', 'linear', 'trello'].includes(a.platform.toLowerCase());
    return true;
  });

  const lastRunDisplay = lastRunAt
    ? `Last scan: ${new Date(lastRunAt).toLocaleTimeString()}`
    : 'Never scanned';

  return (
    <div className={styles.queueRoot}>
      <header className={styles.queueHeader}>
        <div className={styles.headerTitleGroup}>
          <h1 className={styles.mainTitle}>Action Command Bridge</h1>
          <p className={styles.subtitle}>
            Review and approve actions discovered across your connected sources.
            {' '}<span style={{ opacity: 0.5, fontSize: '0.75rem' }}>{lastRunDisplay}</span>
          </p>
        </div>
        <button
          className={styles.refreshBtn}
          onClick={handleRescan}
          disabled={refreshing}
          style={{ alignSelf: 'flex-start' }}
        >
          {refreshing ? 'SCANNING...' : 'RE-SCAN NOW'}
        </button>
      </header>

      <div className={styles.contentGrid}>
        <main className={styles.actionListContainer}>
          <div className={styles.listHeader}>
            <span className={styles.countBadge}>
              {filtered.length} PENDING ACTIONS
              {refreshing && <span style={{ marginLeft: 8, opacity: 0.6 }}>● scanning</span>}
            </span>
            <div className={styles.filterChips}>
              <button className={activeFilter === 'all' ? styles.chipActive : styles.chip} onClick={() => setActiveFilter('all')}>All</button>
              <button className={activeFilter === 'priority' ? styles.chipActive : styles.chip} onClick={() => setActiveFilter('priority')}>Priority</button>
              <button className={activeFilter === 'communications' ? styles.chipActive : styles.chip} onClick={() => setActiveFilter('communications')}>Communications</button>
              <button className={activeFilter === 'meetings' ? styles.chipActive : styles.chip} onClick={() => setActiveFilter('meetings')}>Meetings</button>
              <button className={activeFilter === 'tasks' ? styles.chipActive : styles.chip} onClick={() => setActiveFilter('tasks')}>Tasks</button>
            </div>
          </div>

          {loading ? (
            <div className={styles.loadingBox}>
              {/* Commented out loading animation:
              <div className={styles.neuralPulseRing}>
                <div className={styles.pulseInner} />
              </div>
              */}
              <span className={styles.loadingTitle}>LOADING ACTION QUEUE...</span>
              <p className={styles.loadingDetail}>Reading your connected sources…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className={styles.emptyCard}>
              {/* Commented out scanning ring UI:
              <div className={styles.scanRingWrap}>
                <div className={styles.scanRing}>
                  <div className={styles.scanRingInner} />
                  <div className={styles.scanRingPulse} />
                </div>
                <span className={styles.scanRingIcon}>⚡</span>
              </div>
              */}
              <h3 className={styles.emptyTitle}>System Active — Queue Clear</h3>

              {/* Countdown */}
              {countdown && (
                <p className={styles.countdownText}>
                  Next scan in <strong>{countdown}</strong>
                </p>
              )}



              {/* Recently handled section removed as requested */}
            </div>
          ) : (
            <div className={`${styles.cardList} stagger-1`}>
              {filtered.map(action => {
                const platformObj = ALL_POSSIBLE_PLATFORMS.find(p => p.id === action.platform.toLowerCase());
                const isProcessing = processingId === action.id;
                const isEditing = editingId === action.id;
                const current = isEditing ? editedAction! : action;
                const isExpanded = expandedId === action.id;

                return (
                  <div 
                    key={action.id} 
                    id={action.id}
                    className={`${styles.actionCard} magnetic-card stagger-2 ${isExpanded ? styles.expanded : ''}`}
                    onClick={(e) => {
                      // Prevent toggling if they are interacting with buttons or inputs
                      if ((e.target as HTMLElement).closest('button, input, textarea')) return;
                      setExpandedId(isExpanded ? null : action.id);
                    }}
                  >
                    <div className={styles.cardMain}>
                      <div className={styles.platformIcon}>
                        {platformObj?.icon
                          ? React.cloneElement(platformObj.icon as React.ReactElement, { size: 20 } as React.HTMLAttributes<SVGElement>)
                          : <span>{action.platform[0].toUpperCase()}</span>
                        }
                      </div>
                      <div className={styles.cardContent}>
                        <div className={styles.cardHead}>
                          {isEditing ? (
                              <input
                                className={styles.editTitleInput}
                                value={current.title}
                                onChange={(e) => handleEditChange(action, 'title', e.target.value)}
                              />
                          ) : (
                            <h4 className={styles.actionTitle}>
                              {action.method === 'PATCH' && <span className={styles.crudBadge} style={{ color: 'var(--accent-green)' }}>[UPDATE]</span>}
                              {action.method === 'DELETE' && <span className={styles.crudBadge} style={{ color: 'var(--accent-vital)' }}>[DELETE]</span>}
                              {action.title}
                            </h4>
                          )}
                          <span className={styles.confidence}>{action.confidence}% CONFIDENCE</span>
                        </div>
                        
                        {isExpanded && (
                          <div className={styles.expandedDetails}>
                            {/* 1. Conversational Assistant Banner */}
                            {(() => {
                              const { sender, platformName, cleanDesc } = getConversationalSummary(action);
                              return (
                                <div style={{
                                  background: 'rgba(0, 194, 255, 0.04)',
                                  border: '1px solid rgba(0, 194, 255, 0.15)',
                                  borderRadius: '12px',
                                  padding: '16px',
                                  marginBottom: '16px'
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                    <strong style={{ fontSize: '0.8rem', letterSpacing: '0.05em', color: 'var(--accent-blue, #3b82f6)' }}>EYES ASSISTANT</strong>
                                  </div>
                                  <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)', lineHeight: '1.5', fontWeight: '500' }}>
                                    Hey! <strong style={{ color: 'var(--text-primary)' }}>{sender}</strong> sent {platformName}: <em style={{ color: 'var(--accent-blue, #2563eb)', fontStyle: 'normal', fontWeight: 'bold' }}>&quot;{cleanDesc}&quot;</em>. What do you want to say?
                                  </p>
                                </div>
                              );
                            })()}

                            {/* 2. Interactive Mind-Map/Timeline Citation Chain */}
                            {(() => {
                              const citations = parseCitations(action.description || '');
                              if (citations.length === 0) {
                                return (
                                  <div className={styles.citationBox} style={{ margin: '8px 0 16px', padding: '12px', borderLeft: '3px solid var(--accent-blue, #3b82f6)', background: 'var(--bg-secondary)', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                                    <span className={styles.suggestionLabel} style={{ display: 'block', fontSize: '0.65rem', letterSpacing: '0.1em', color: 'var(--accent-blue, #3b82f6)', marginBottom: '4px', fontWeight: 'bold' }}>🧠 SOURCE CITATION / CONTEXT</span>
                                    <p className={styles.actionDesc} style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{action.description || 'No matching history context found.'}</p>
                                  </div>
                                );
                              }
                              return (
                                <div style={{ marginBottom: '20px', padding: '12px', borderLeft: '3px solid var(--accent-blue, #3b82f6)', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                                  <span style={{ display: 'block', fontSize: '0.65rem', letterSpacing: '0.1em', color: 'var(--accent-blue, #3b82f6)', marginBottom: '10px', fontWeight: 'bold' }}>🧠 PRIOR CONTEXT CHAIN</span>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                                    {citations.map((cit, idx) => {
                                      let icon = '📎';
                                      if (cit.toLowerCase().includes('slack')) icon = '💬';
                                      if (cit.toLowerCase().includes('email') || cit.toLowerCase().includes('gmail')) icon = '📧';
                                      if (cit.toLowerCase().includes('github')) icon = '🐙';
                                      if (cit.toLowerCase().includes('linear')) icon = '🔷';
                                      
                                      return (
                                        <React.Fragment key={idx}>
                                          <div style={{
                                            background: 'var(--bg-primary)',
                                            border: '1px solid var(--border-primary)',
                                            borderRadius: '20px',
                                            padding: '6px 14px',
                                            fontSize: '0.75rem',
                                            color: 'var(--text-primary)',
                                            fontWeight: '600',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                                          }}>
                                            <span>{icon}</span>
                                            <span>{cit}</span>
                                          </div>
                                          {idx < citations.length - 1 && (
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 'bold' }}>──►</span>
                                          )}
                                        </React.Fragment>
                                      );
                                    })}
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 'bold' }}>──►</span>
                                    <div style={{
                                      background: 'rgba(16, 185, 129, 0.08)',
                                      border: '1px solid rgba(16, 185, 129, 0.3)',
                                      borderRadius: '20px',
                                      padding: '6px 14px',
                                      fontSize: '0.75rem',
                                      color: 'var(--accent-green, #10b981)',
                                      fontWeight: '700',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px'
                                    }}>
                                      <span>⚡</span>
                                      <span>Current Draft</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                            
                            {/* AI Suggestion Box */}
                            <div className={styles.suggestionBox}>
                              <span className={styles.suggestionLabel}>
                                {action.action_type === 'EMAIL_REPLY' || action.action_type === 'SLACK_REPLY' ? 'AI DRAFT REPLY' : 'PROPOSED COMMAND'}
                              </span>
                              {isEditing ? (
                                <textarea
                                  className={styles.editSuggestionInput}
                                  value={current.suggested_action}
                                  onChange={(e) => handleEditChange(action, 'suggested_action', e.target.value)}
                                />
                              ) : (
                                <span className={styles.suggestionText}>{action.suggested_action}</span>
                              )}
                            </div>

                            {/* 3. Quick Refine Chips — powered by /api/actions/refine */}
                            {(action.action_type === 'EMAIL_REPLY' || action.action_type === 'SLACK_REPLY') && (
                              <div style={{ display: 'flex', gap: '8px', marginTop: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                                {refiningId === action.id && (
                                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>✦ refining…</span>
                                )}
                                {refiningId !== action.id && (
                                  <>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); applyQuickRefine(action, 'shorter'); }}
                                      style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '16px', padding: '6px 14px', fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: '700', cursor: 'pointer' }}
                                    >
                                      📝 Make Shorter
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); applyQuickRefine(action, 'formal'); }}
                                      style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '16px', padding: '6px 14px', fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: '700', cursor: 'pointer' }}
                                    >
                                      👔 More Formal
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); applyQuickRefine(action, 'calendar'); }}
                                      style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '16px', padding: '6px 14px', fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: '700', cursor: 'pointer' }}
                                    >
                                      📅 Add Calendar Link
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                            {(action.action_type === 'CALENDAR' || action.action_type === 'REMINDER') && (
                              <div className={styles.timeControls} style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <label style={{ fontSize: '0.7rem', opacity: 0.7, marginBottom: '4px' }}>START TIME</label>
                                  <input 
                                    type="datetime-local" 
                                    value={current.startTime || ''} 
                                    onChange={(e) => handleEditChange(action, 'startTime', e.target.value)}
                                    style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '4px 8px', borderRadius: '4px' }}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <label style={{ fontSize: '0.7rem', opacity: 0.7, marginBottom: '4px' }}>END TIME</label>
                                  <input 
                                    type="datetime-local" 
                                    value={current.endTime || ''} 
                                    onChange={(e) => handleEditChange(action, 'endTime', e.target.value)}
                                    style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '4px 8px', borderRadius: '4px' }}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {isExpanded && (
                      <div className={styles.cardFooter}>
                        <button className={styles.approveBtn} onClick={(e) => { e.stopPropagation(); handleApprove(current); }} disabled={isProcessing}>
                          {isProcessing ? 'EXECUTING...' : isEditing ? 'SAVE & EXECUTE' : 'EXECUTE'}
                        </button>
                        {!isEditing && (
                          <button
                            className={styles.editBtn}
                            style={{ color: 'var(--accent-blue)', borderColor: 'var(--accent-blue)' }}
                            disabled={isProcessing}
                            onClick={(e) => { e.stopPropagation(); handleApprove(current); }}
                          >
                            AUTO-APPROVE
                          </button>
                        )}
                        {!isEditing && (
                          <button className={styles.editBtn} onClick={(e) => { e.stopPropagation(); startEditing(action); }}>REFINE</button>
                        )}
                        {!isEditing && (() => {
                          const link = getNativePlatformLink(action);
                          if (!link) return null;
                          return (
                            <a 
                              href={link} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className={styles.editBtn} 
                              style={{ 
                                textDecoration: 'none', 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: '6px',
                                color: 'var(--accent-green)',
                                borderColor: 'var(--accent-green)'
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span>🔗</span>
                              <span>OPEN IN {action.platform.toUpperCase()}</span>
                            </a>
                          );
                        })()}
                        <button className={styles.dismissBtn} style={{ padding: '8px 12px', minWidth: 'auto', fontSize: '1rem', marginLeft: 'auto' }} title="Dismiss" onClick={(e) => { e.stopPropagation(); handleDismiss(action); }}>✕</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* Undo-dismiss toast */}
      {undoToast && (
        <div style={{
          position: 'fixed', bottom: '28px', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-card, var(--bg-primary))',
          border: '1px solid var(--border-primary)',
          borderRadius: '12px', padding: '12px 20px',
          display: 'flex', alignItems: 'center', gap: '16px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          zIndex: 9999, animation: 'fadeInUp 0.25s ease-out',
          fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-primary)',
          whiteSpace: 'nowrap',
        }}>
          <span>Action dismissed</span>
          <button
            onClick={handleUndoDismiss}
            style={{
              background: 'var(--text-primary)', color: 'var(--bg-primary)',
              border: 'none', borderRadius: '8px', padding: '6px 14px',
              fontSize: '0.75rem', fontWeight: '800', cursor: 'pointer',
              letterSpacing: '0.5px', textTransform: 'uppercase',
            }}
          >
            UNDO
          </button>
        </div>
      )}
    </div>
  );
}
