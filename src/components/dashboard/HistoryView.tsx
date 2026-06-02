'use client';

import React, { useState, useEffect } from 'react';
import styles from '../MainContent.module.css';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}

interface SavedThread {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  chat_messages: ChatMessage[];
}

interface AuditRecord {
  id: string;
  status: string;
  riskScore: number;
  mentionsCount: number;
  commitmentsCount: number;
  summaryNarrative: string | null;
  createdAt: string;
}

interface SyncRun {
  runId: string;
  createdAt: string;
  status: 'success' | 'error' | 'skipped';
  platformCount: number;
  failedPlatforms: string[];
  durationMs: number;
}

type TabType = 'chats' | 'audits' | 'activity';

export function HistoryView({ onBack, onLoadThread }: { onBack: () => void, onLoadThread: (msgs: ChatMessage[]) => void }) {
  const [activeTab, setActiveTab] = useState<TabType>('chats');
  const [history, setHistory] = useState<SavedThread[]>([]);
  const [audits, setAudits] = useState<AuditRecord[]>([]);
  const [syncs, setSyncs] = useState<SyncRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [auditFilter, setAuditFilter] = useState<'all' | 'critical' | 'moderate' | 'optimal'>('all');

  const fetchChats = async () => {
    try {
      const res = await fetch('/api/chat/threads');
      if (res.ok) {
        const data = await res.json();
        setHistory(data.threads || []);
      }
    } catch (e) {
      console.error('Failed to load chats:', e);
    }
  };

  const fetchAudits = async () => {
    try {
      const res = await fetch('/api/audit/history');
      if (res.ok) {
        const data = await res.json();
        setAudits(data.audits || []);
      }
    } catch (e) {
      console.error('Failed to load audits:', e);
    }
  };

  const fetchSyncs = async () => {
    try {
      const res = await fetch('/api/sync/history');
      if (res.ok) {
        const data = await res.json();
        setSyncs(data.runs || []);
      }
    } catch (e) {
      console.error('Failed to load syncs:', e);
    }
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'chats') await fetchChats();
      else if (activeTab === 'audits') await fetchAudits();
      else if (activeTab === 'activity') await fetchSyncs();
    } catch (e) {
      setError('Unable to load history data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const handleDeleteChat = async (threadId: string) => {
    if (!window.confirm('Delete this conversation?')) return;
    setDeletingId(threadId);
    try {
      const res = await fetch(`/api/chat/threads?threadId=${threadId}`, { method: 'DELETE' });
      if (res.ok) {
        setHistory(prev => prev.filter(t => t.id !== threadId));
      }
    } catch (e) {
      console.error('Failed to delete thread:', e);
    } finally {
      setDeletingId(null);
    }
  };

  const totalTurns = history.reduce((sum, t) => sum + (t.chat_messages?.length ?? 0), 0);

  return (
    <div className={styles.soloView}>
      <div className={styles.viewHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <h1 className={styles.soloTitle}>Neural History</h1>
        </div>
        <button
          onClick={loadData}
          style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-primary)', color: 'var(--text-secondary)', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
        >
          Refresh Pulse
        </button>
      </div>

      <div className={styles.tabsContainer} style={{ display: 'flex', gap: '8px', marginBottom: '32px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '16px' }}>
        <button 
          className={`${styles.filterChip} ${activeTab === 'chats' ? styles.filterChipActive : ''}`}
          onClick={() => setActiveTab('chats')}
        >
          Conversations
        </button>
        <button 
          className={`${styles.filterChip} ${activeTab === 'audits' ? styles.filterChipActive : ''}`}
          onClick={() => setActiveTab('audits')}
        >
          Audit Certificates
        </button>
        <button 
          className={`${styles.filterChip} ${activeTab === 'activity' ? styles.filterChipActive : ''}`}
          onClick={() => setActiveTab('activity')}
        >
          Neural Activity
        </button>
      </div>

      {activeTab === 'chats' && (
        <>
          <div className={styles.statsGrid}>
            <div className={styles.miniStatCard}>
              <span className={styles.statLabel}>THREADS</span>
              <span className={styles.statValue}>{loading ? '—' : history.length}</span>
              <span className={styles.statDesc}>Saved memory search sessions.</span>
            </div>
            <div className={styles.miniStatCard}>
              <span className={styles.statLabel}>TOTAL TURNS</span>
              <span className={styles.statValue}>{loading ? '—' : totalTurns}</span>
              <span className={styles.statDesc}>Messages across all history.</span>
            </div>
          </div>

          <div className={styles.threadList}>
            {loading && <p className={styles.loadingText}>Accessing memory banks...</p>}
            {!loading && history.length === 0 && (
              <div className={styles.emptyState}>
                <p>No chat history found. Start a conversation in the chat tab.</p>
              </div>
            )}
            {!loading && history.map((thread) => {
              const userMsg = thread.chat_messages?.find(m => m.role === 'user');
              const assistantMsg = thread.chat_messages?.find(m => m.role === 'assistant');
              const turns = Math.floor((thread.chat_messages?.length ?? 0) / 2);
              const isDeleting = deletingId === thread.id;

              return (
                <div key={thread.id} className={styles.threadCard} onClick={() => onLoadThread(thread.chat_messages ?? [])}>
                  <div className={styles.threadHeader}>
                    <h4 className={styles.threadTitle}>{thread.title}</h4>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className={styles.turnBadge}>{turns} turns</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteChat(thread.id); }}
                        disabled={isDeleting}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', opacity: isDeleting ? 0.4 : 1 }}
                      >
                        {isDeleting ? '...' : '✕'}
                      </button>
                    </div>
                  </div>
                  <div className={styles.threadMeta}>Updated {new Date(thread.updated_at).toLocaleString()}</div>
                  <div className={styles.threadPreview}>
                    {userMsg && (
                      <div className={styles.previewStep}>
                        <span className={styles.roleLabel}>QUERY</span>
                        <p className={styles.previewText}>{userMsg.content}</p>
                      </div>
                    )}
                    {assistantMsg && (
                      <div className={styles.previewStep}>
                        <span className={styles.roleLabel}>SYNTHESIS</span>
                        <p className={styles.previewText}>{assistantMsg.content}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {activeTab === 'audits' && (
        <>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <button
              className={`${styles.filterChip} ${auditFilter === 'all' ? styles.filterChipActive : ''}`}
              onClick={() => setAuditFilter('all')}
              style={{ fontSize: '11px', padding: '6px 12px' }}
            >
              All Audits ({audits.length})
            </button>
            <button
              className={`${styles.filterChip} ${auditFilter === 'critical' ? styles.filterChipActive : ''}`}
              onClick={() => setAuditFilter('critical')}
              style={{ fontSize: '11px', padding: '6px 12px' }}
            >
              Critical Risk ({audits.filter(a => a.riskScore > 7).length})
            </button>
            <button
              className={`${styles.filterChip} ${auditFilter === 'moderate' ? styles.filterChipActive : ''}`}
              onClick={() => setAuditFilter('moderate')}
              style={{ fontSize: '11px', padding: '6px 12px' }}
            >
              Moderate Risk ({audits.filter(a => a.riskScore > 4 && a.riskScore <= 7).length})
            </button>
            <button
              className={`${styles.filterChip} ${auditFilter === 'optimal' ? styles.filterChipActive : ''}`}
              onClick={() => setAuditFilter('optimal')}
              style={{ fontSize: '11px', padding: '6px 12px' }}
            >
              Optimal ({audits.filter(a => a.riskScore <= 4).length})
            </button>
          </div>

          <div className={styles.threadList}>
            {loading && <p className={styles.loadingText}>Retrieving audit logs...</p>}
            {!loading && audits.length === 0 && (
              <div className={styles.emptyState}>
                <p>No audits performed yet. Run an audit from the Audit tab.</p>
              </div>
            )}
            {!loading && audits
              .filter((audit) => {
                if (auditFilter === 'critical') return audit.riskScore > 7;
                if (auditFilter === 'moderate') return audit.riskScore > 4 && audit.riskScore <= 7;
                if (auditFilter === 'optimal') return audit.riskScore <= 4;
                return true;
              })
              .map((audit) => (
                <div key={audit.id} className={styles.threadCard} style={{ cursor: 'default' }}>
                  <div className={styles.threadHeader}>
                    <h4 className={styles.threadTitle}>Certificate {audit.id.slice(0, 8).toUpperCase()}</h4>
                    <span className={`${styles.turnBadge} ${audit.status === 'completed' ? styles.statusSuccess : ''}`} style={{ background: audit.status === 'completed' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', color: audit.status === 'completed' ? '#10b981' : '#f59e0b' }}>
                      {audit.status.toUpperCase()}
                    </span>
                  </div>
                  <div className={styles.threadMeta}>Generated {new Date(audit.createdAt).toLocaleString()}</div>
                  
                  <div className={styles.statsGrid} style={{ marginTop: '16px', marginBottom: '0', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                    <div className={styles.miniStatCard} style={{ padding: '12px', gap: '4px' }}>
                      <span className={styles.statLabel} style={{ fontSize: '9px' }}>RISK</span>
                      <span className={styles.statValue} style={{ fontSize: '20px' }}>{audit.riskScore}/10</span>
                    </div>
                    <div className={styles.miniStatCard} style={{ padding: '12px', gap: '4px' }}>
                      <span className={styles.statLabel} style={{ fontSize: '9px' }}>MENTIONS</span>
                      <span className={styles.statValue} style={{ fontSize: '20px' }}>{audit.mentionsCount}</span>
                    </div>
                    <div className={styles.miniStatCard} style={{ padding: '12px', gap: '4px' }}>
                      <span className={styles.statLabel} style={{ fontSize: '9px' }}>TASKS</span>
                      <span className={styles.statValue} style={{ fontSize: '20px' }}>{audit.commitmentsCount}</span>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </>
      )}

      {activeTab === 'activity' && (
        <div className={styles.threadList}>
          {loading && <p className={styles.loadingText}>Syncing neural pulse history...</p>}
          {!loading && syncs.length === 0 && (
            <div className={styles.emptyState}>
              <p>No neural activity recorded. Connect platforms to begin indexing.</p>
            </div>
          )}
          {!loading && syncs.map((sync) => (
            <div key={sync.runId} className={styles.threadCard} style={{ cursor: 'default', padding: '16px 24px' }}>
              <div className={styles.threadHeader} style={{ marginBottom: '4px' }}>
                <h4 className={styles.threadTitle} style={{ fontSize: '15px' }}>Neural Link Update</h4>
                <span style={{ fontSize: '11px', fontWeight: 800, color: sync.status === 'success' ? '#10b981' : '#ef4444' }}>
                  {sync.status.toUpperCase()}
                </span>
              </div>
              <div className={styles.threadMeta} style={{ marginBottom: '12px' }}>
                {new Date(sync.createdAt).toLocaleString()} • {sync.durationMs > 1000 ? `${(sync.durationMs / 1000).toFixed(1)}s` : `${sync.durationMs}ms`}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span className={styles.turnBadge}>{sync.platformCount} Platforms</span>
                {sync.failedPlatforms.length > 0 && (
                  <span className={styles.turnBadge} style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                    {sync.failedPlatforms.length} Failed
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
