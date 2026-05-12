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

export function HistoryView({ onBack, onLoadThread }: { onBack: () => void, onLoadThread: (msgs: ChatMessage[]) => void }) {
  const [history, setHistory] = useState<SavedThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchThreads = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/chat/threads');
      if (!res.ok) throw new Error(`Failed to load history (${res.status})`);
      const data = await res.json();
      setHistory(data.threads || []);
    } catch (e) {
      console.error('Failed to load threads:', e);
      setError('Unable to load chat history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchThreads();
  }, []);

  const handleDelete = async (threadId: string) => {
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

      <div className={styles.viewHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className={styles.soloTitle} style={{ margin: 0 }}>History</h1>
        <button
          onClick={fetchThreads}
          style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-primary)', color: 'var(--text-secondary)', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
        >
          Refresh
        </button>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.miniStatCard}>
          <span className={styles.statLabel}>CONVERSATIONS</span>
          <span className={styles.statValue}>{loading ? '—' : history.length}</span>
          <span className={styles.statDesc}>Total saved memory search threads.</span>
        </div>
        <div className={styles.miniStatCard}>
          <span className={styles.statLabel}>CHAT TURNS</span>
          <span className={styles.statValue}>{loading ? '—' : totalTurns}</span>
          <span className={styles.statDesc}>Total messages across all threads.</span>
        </div>
      </div>

      <div className={styles.historyPanel}>
        <h3 className={styles.subHeader}>SAVED CHATS</h3>
        <p className={styles.sectionDesc}>All questions and assistant responses from memory search.</p>

        <div className={styles.threadList}>
          {loading && (
            <p style={{ color: 'var(--text-secondary)' }}>Loading conversations...</p>
          )}

          {!loading && error && (
            <p style={{ color: 'var(--text-error, #ff6b6b)' }}>{error}</p>
          )}

          {!loading && !error && history.length === 0 && (
            <p style={{ color: 'var(--text-secondary)' }}>No chat history found. Start a conversation in the chat tab.</p>
          )}

          {!loading && history.map((thread) => {
            const userMsg = thread.chat_messages?.find(m => m.role === 'user');
            const assistantMsg = thread.chat_messages?.find(m => m.role === 'assistant');
            const turns = Math.floor((thread.chat_messages?.length ?? 0) / 2);
            const updatedAt = new Date(thread.updated_at).toLocaleString();
            const isDeleting = deletingId === thread.id;

            return (
              <div
                key={thread.id}
                className={styles.threadCard}
                onClick={() => onLoadThread(thread.chat_messages ?? [])}
                style={{ cursor: 'pointer', position: 'relative' }}
              >
                <div className={styles.threadHeader}>
                  <h4 className={styles.threadTitle}>{thread.title}</h4>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className={styles.turnBadge}>{turns} turns</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(thread.id); }}
                      disabled={isDeleting}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontSize: '11px',
                        padding: '2px 6px',
                        opacity: isDeleting ? 0.4 : 1
                      }}
                    >
                      {isDeleting ? '...' : '✕'}
                    </button>
                  </div>
                </div>
                <div className={styles.threadMeta}>Updated {updatedAt}</div>

                <div className={styles.threadPreview}>
                  {userMsg && (
                    <div className={styles.previewStep}>
                      <span className={styles.roleLabel}>YOU ASKED</span>
                      <p className={styles.previewText}>{userMsg.content.slice(0, 120)}</p>
                    </div>
                  )}
                  {assistantMsg && (
                    <div className={styles.previewStep}>
                      <span className={styles.roleLabel}>ASSISTANT REPLIED</span>
                      <p className={styles.previewText}>{assistantMsg.content.slice(0, 120)}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
