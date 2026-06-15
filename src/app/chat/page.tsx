'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import styles from './ChatPage.module.css';
import { 
  SearchIcon, 
  ArrowRightIcon
} from '@/components/common/icons/PlatformIcons';
import type { Message, Citation } from '@/types/dashboard';
import { AlertsBanner } from '@/components/chat/AlertsBanner';
import { ClusterValidationModal } from '@/components/chat/ClusterValidationModal';
import { CognitiveRightPanel } from '@/components/chat/CognitiveRightPanel';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';



function ChatPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  
  const [query, setQuery] = useState(initialQuery);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [threadId, setThreadId] = useState('');       // local key
  const [dbThreadId, setDbThreadId] = useState<string | null>(null); // Supabase UUID
  const [brainPanelOpen, setBrainPanelOpen] = useState(false);
  const [excludedMemories, setExcludedMemories] = useState<Set<string>>(new Set());
  const rollingSummaryRef = useRef('');  // Section 04 — rolling conversation summary
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeStreamRef = useRef<AbortController | null>(null);
  const hasSubmittedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Persist current messages to Supabase (debounced) */
  const saveThread = (msgs: Message[], existingDbId: string | null, firstUserMsg: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const payload = {
          threadId: existingDbId,
          title: firstUserMsg.slice(0, 60) || 'New Chat',
          messages: msgs
            .filter(m => m.content && !m.pending)
            .map(m => ({ role: m.role, content: m.content })),
        };
        const res = await fetch('/api/chat/threads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const data = await res.json();
          if (!existingDbId && data.threadId) {
            setDbThreadId(data.threadId);
          }
        }
      } catch (err) {
        console.warn('[Chat] Failed to persist thread:', err);
      }
    }, 1000);
  };


  // Initialize
  useEffect(() => {
    setThreadId(Math.random().toString(36).substring(7));

    // If there's an initial query, trigger it (once)
    if (initialQuery && !hasSubmittedRef.current) {
      hasSubmittedRef.current = true;
      handleSubmit(initialQuery);
    }
  }, []);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (text: string) => {
    const prompt = text.trim();
    if (!prompt) return;
    
    activeStreamRef.current?.abort();
    const controller = new AbortController();
    activeStreamRef.current = controller;
    
    setMessages((prev) => [...prev, { role: 'user', content: prompt }, { role: 'assistant', content: '', pending: true }]);
    setQuery('');
    setIsStreaming(true);

    try {
      const response = await fetch('/api/chat?stream=1', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-timezone-offset': String(new Date().getTimezoneOffset()),
        },
        signal: controller.signal,
        body: JSON.stringify({ 
          message: prompt,
          history: messages.map(m => ({ role: m.role, content: m.content })),
          threadId: dbThreadId,
          summary: rollingSummaryRef.current,
        }),
      });

      if (response.ok && response.body) {
        const citationsHeader = response.headers.get('X-Citations');
        let citations: Citation[] = [];
        if (citationsHeader) {
          try {
            citations = JSON.parse(atob(citationsHeader.replace(/-/g, '+').replace(/_/g, '/'))) as Citation[];
          } catch (e) {
            console.warn('[Chat] Failed to parse citations header:', e);
          }
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let streamedReply = '';
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          streamedReply += chunk;
          
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last.role === 'assistant') {
              return [...prev.slice(0, -1), { 
                role: 'assistant', 
                content: streamedReply, 
                pending: true,
                citations: citations.length > 0 ? citations : undefined
              }];
            }
            return prev;
          });
        }
        
        setMessages((prev) => {
          const finalContent = streamedReply.trim() 
            ? streamedReply 
            : '⚠️ All AI providers are currently unavailable (quota or rate limits). Please try again in a few minutes.';
          const finalMessages = [...prev.slice(0, -1), { 
            role: 'assistant' as const, 
            content: finalContent, 
            pending: false,
            citations: citations.length > 0 ? citations : undefined
          }];
          // Auto-persist to Supabase after reply completes
          const firstUser = finalMessages.find(m => m.role === 'user')?.content || 'New Chat';
          saveThread(finalMessages, dbThreadId, firstUser);
          return finalMessages;
        });
      } else {
        // Non-200 response
        setMessages((prev) => [  
          ...prev.slice(0, -1),
          { role: 'assistant', content: '⚠️ The service returned an error. Please try again.', pending: false }
        ]);
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Chat Stream Failed:', err);
        setMessages((prev) => [
          ...prev.slice(0, -1),
          { role: 'assistant', content: '⚠️ Connection failed. Please check your network and try again.', pending: false }
        ]);
      } else {
        // AbortError — user cancelled, just remove the pending bubble
        setMessages((prev) => prev.filter((_, i) => i !== prev.length - 1));
      }
    } finally {
      setIsStreaming(false);
      activeStreamRef.current = null;
    }
  };

  return (
    <div className={styles.chatRoot}>
      <ClusterValidationModal />
      <div className={styles.sidebarWrapper}>
        <Sidebar />
      </div>
      <div className={styles.mainWrapper}>
        <div className={styles.headerWrapper}>
          <Header />
        </div>
        <AlertsBanner />
        
        <div className={styles.chatContentContainer}>
          <div className={styles.chatColumn}>
            {messages.length === 0 ? (
              <div className={styles.emptyState}>
                <h1 className={styles.brandTitle} style={{ fontSize: 'clamp(24px, 5vw, 32px)', lineHeight: 1.2 }}>
                  Everything You Ever Said
                </h1>
                <p className={styles.brandSubtitle}>Ask me anything about your life.</p>
              </div>
            ) : (
              <div className={styles.messageList}>
                {messages.map((m, i) => (
                  <div key={i} className={`${styles.messageRow} ${m.role === 'user' ? styles.userRow : styles.aiRow}`}>
                    <div className={styles.messageBubble}>
                      {/* Metadata line — only shown when platforms are actually connected */}

                      <div className={styles.msgBody}>
                        {m.role === 'assistant' && m.content ? (
                          <div className={styles.markdownContent}>
                            <ReactMarkdown 
                              remarkPlugins={[remarkGfm]}
                              components={{
                                p: ({node, ...props}) => <p style={{margin: '0 0 10px 0', lineHeight: 1.6}} {...props} />,
                                ul: ({node, ...props}) => <ul style={{margin: '0 0 10px 20px', padding: 0, listStyle: 'disc'}} {...props} />,
                                ol: ({node, ...props}) => <ol style={{margin: '0 0 10px 20px', padding: 0, listStyle: 'decimal'}} {...props} />,
                                li: ({node, ...props}) => <li style={{margin: '4px 0', lineHeight: 1.5}} {...props} />,
                                table: ({node, ...props}) => <div style={{overflowX: 'auto', margin: '16px 0', borderRadius: '8px', border: '1px solid var(--border-subtle)'}}><table style={{width: '100%', borderCollapse: 'collapse', fontSize: '13px'}} {...props} /></div>,
                                th: ({node, ...props}) => <th style={{borderBottom: '1px solid var(--border-subtle)', padding: '10px 14px', textAlign: 'left', background: 'var(--bg-secondary)', fontWeight: 600, color: 'var(--text-primary)'}} {...props} />,
                                td: ({node, ...props}) => <td style={{borderBottom: '1px solid var(--border-subtle)', padding: '10px 14px', color: 'var(--text-secondary)'}} {...props} />,
                                code: ({node, inline, ...props}: any) => 
                                  inline 
                                    ? <code style={{background: 'var(--bg-secondary)', color: 'var(--text-primary)', padding: '2px 6px', borderRadius: '4px', fontSize: '12px', fontFamily: 'monospace'}} {...props} />
                                    : <span style={{display: 'block', background: '#1A1B26', color: '#a9b1d6', padding: '14px', borderRadius: '8px', overflowX: 'auto', margin: '16px 0', fontSize: '12px', fontFamily: 'monospace', border: '1px solid rgba(255,255,255,0.1)'}}><code {...props} /></span>,
                                pre: ({node, ...props}) => <pre style={{margin: 0, padding: 0, background: 'transparent'}} {...props} />,
                                strong: ({node, ...props}) => <strong style={{fontWeight: 700, color: 'var(--text-primary)'}} {...props} />,
                                h1: ({node, ...props}) => <h1 style={{fontSize: '18px', fontWeight: 700, margin: '20px 0 10px', color: 'var(--text-primary)'}} {...props} />,
                                h2: ({node, ...props}) => <h2 style={{fontSize: '16px', fontWeight: 700, margin: '18px 0 10px', color: 'var(--text-primary)'}} {...props} />,
                                h3: ({node, ...props}) => <h3 style={{fontSize: '14px', fontWeight: 700, margin: '16px 0 8px', color: 'var(--text-primary)'}} {...props} />,
                                a: ({node, ...props}) => <a style={{color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 500}} {...props} />,
                                blockquote: ({node, ...props}) => <blockquote style={{margin: '12px 0', paddingLeft: '12px', borderLeft: '3px solid var(--border-subtle)', color: 'var(--text-secondary)', fontStyle: 'italic'}} {...props} />
                              }}
                            >{m.content}</ReactMarkdown>
                          </div>
                        ) : (
                          m.content
                        )}
                        {m.pending && <span className={styles.typingCursor}>▊</span>}
                      </div>
                      {/* C9: Citation chips — open real source */}
                      {m.role === 'assistant' && !m.pending && m.citations && m.citations.length > 0 && (() => {
                        /** Build the best real URL for a citation */
                        const resolveSourceUrl = (c: Citation): string | null => {
                          if (c.sourceUrl) return c.sourceUrl;
                          const platform = (c.platform || '').toLowerCase();
                          const id = c.sourceId;
                          if (!id) return null;
                          if (platform === 'gmail')            return `https://mail.google.com/mail/u/0/#all/${id}`;
                          if (platform === 'github')           return `https://github.com/${id}`;
                          if (platform === 'slack')            return `https://slack.com/app_redirect?channel=${id}`;
                          if (platform === 'notion')           return `https://notion.so/${id.replace(/-/g, '')}`;
                          if (platform === 'linear')           return `https://linear.app/issue/${id}`;
                          if (platform === 'google-calendar')  return `https://calendar.google.com/calendar/r/eventedit?eid=${id}`;
                          if (platform === 'discord')          return `https://discord.com/channels/${id}`;
                          if (platform === 'reddit')           return `https://reddit.com/${id}`;
                          if (platform === 'twitter')          return `https://x.com/i/web/status/${id}`;
                          return null;
                        };

                        return (
                          <div style={{ marginTop: '10px' }}>
                            {/* Source chips row */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
                              {m.citations.map((c, idx) => {
                                const url = resolveSourceUrl(c);
                                const label = c.title
                                  ? (c.title.length > 40 ? c.title.slice(0, 40) + '…' : c.title)
                                  : c.platform;
                                const chip = (
                                  <span style={{
                                    background: url ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '6px', padding: '3px 8px',
                                    fontSize: '11px', color: url ? '#a3b3cc' : '#4b5563',
                                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                                    cursor: url ? 'pointer' : 'default',
                                    textDecoration: 'none',
                                    transition: 'background 0.15s',
                                    maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  }}>
                                    <span style={{ opacity: 0.7, fontSize: '10px' }}>↗</span>
                                    {label}
                                  </span>
                                );
                                return url ? (
                                  <a
                                    key={idx}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={`Open in ${c.platform}`}
                                    style={{ textDecoration: 'none' }}
                                  >
                                    {chip}
                                  </a>
                                ) : (
                                  <span key={idx} title="Source no longer available">{chip}</span>
                                );
                              })}
                            </div>
                            {/* Secondary: memory exclude buttons */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              {m.citations.filter(c => c.memoryId).map(c => {
                                const isExcluded = excludedMemories.has(c.memoryId!);
                                return (
                                  <button
                                    key={c.memoryId}
                                    title={isExcluded ? 'Memory excluded from patterns' : `Don't use "${c.platform}" memory in clustering`}
                                    onClick={async () => {
                                      if (isExcluded) return;
                                      await fetch(`/api/memories/${c.memoryId}/exclude`, { method: 'PATCH' });
                                      setExcludedMemories(prev => new Set([...prev, c.memoryId!]));
                                    }}
                                    style={{
                                      background: isExcluded ? 'rgba(16,185,129,0.1)' : 'transparent',
                                      border: `1px solid ${isExcluded ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.06)'}`,
                                      color: isExcluded ? '#10b981' : '#4b5563',
                                      borderRadius: '6px', padding: '2px 7px',
                                      fontSize: '10px', cursor: isExcluded ? 'default' : 'pointer',
                                      display: 'flex', alignItems: 'center', gap: '4px',
                                    }}
                                  >
                                    {isExcluded ? '✓ Excluded' : `⊘ ${c.platform}`}
                                  </button>
                                );
                              })}
                              {m.citations.some(c => c.memoryId && !excludedMemories.has(c.memoryId)) && (
                                <span style={{ fontSize: '10px', color: '#374151', alignSelf: 'center', marginLeft: '2px' }}>
                                  exclude from patterns
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}

            {/* Floating Input Area */}
            <div className={styles.inputStickyContainer}>
              <div className={styles.inputBox}>
                <SearchIcon />
                <input 
                  type="text" 
                  className={styles.input}
                  placeholder="Ask me anything about your life…"

                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit(query)}
                  disabled={isStreaming}
                />
                <button 
                  className={styles.sendBtn}
                  onClick={() => handleSubmit(query)}
                  disabled={!query.trim() || isStreaming}
                >
                  <ArrowRightIcon />
                </button>
                {/* Brain Panel Toggle */}
                <button
                  onClick={() => setBrainPanelOpen(p => !p)}
                  title="Intelligence Layer"
                  style={{
                    background: brainPanelOpen ? 'rgba(99,102,241,0.2)' : 'none',
                    border: '1px solid rgba(99,102,241,0.3)',
                    borderRadius: '8px', padding: '6px 10px',
                    color: '#818cf8', cursor: 'pointer', fontSize: '16px',
                    marginLeft: '4px', flexShrink: 0,
                  }}
                >🧠</button>
              </div>
            </div>
          </div>
          <CognitiveRightPanel isOpen={brainPanelOpen} onClose={() => setBrainPanelOpen(false)} />
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="loading-screen">INITIALIZING LINK...</div>}>
      <ChatPageInner />
    </Suspense>
  );
}
