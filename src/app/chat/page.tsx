'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import styles from './ChatPage.module.css';
import { 
  SearchIcon, 
  ArrowRightIcon,
  GmailIconOfficial,
  GitHubIconOfficial,
  SlackIconOfficial,
  DiscordIconOfficial,
  NotionIconOfficial,
  CalendarIconOfficial,
  LinearIconOfficial,
  TrelloIconOfficial,
  DropboxIconOfficial
} from '@/components/common/icons/PlatformIcons';
import type { Message, Citation } from '@/types/dashboard';
import { AlertsBanner } from '@/components/chat/AlertsBanner';
import { ClusterValidationModal } from '@/components/chat/ClusterValidationModal';
import { CognitiveRightPanel } from '@/components/chat/CognitiveRightPanel';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const PLATFORM_ICONS: Record<string, React.ReactElement> = {
  gmail: <GmailIconOfficial size={16} />,
  'google-calendar': <CalendarIconOfficial size={16} />,
  github: <GitHubIconOfficial size={16} />,
  linear: <LinearIconOfficial size={16} />,
  trello: <TrelloIconOfficial size={16} />,
  slack: <SlackIconOfficial size={16} />,
  notion: <NotionIconOfficial size={16} />,
  discord: <DiscordIconOfficial size={16} />,
  dropbox: <DropboxIconOfficial size={16} />,
};

function CitationDockChat({ 
  citations, 
  excludedMemories, 
  setExcludedMemories 
}: { 
  citations: Citation[]; 
  excludedMemories: Set<string>; 
  setExcludedMemories: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
  const [expanded, setExpanded] = useState(false);

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
    <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '28px', height: '28px', borderRadius: '14px',
          background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)',
          color: 'var(--text-secondary)', fontSize: '12px',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.3s ease', zIndex: 2
        }}
        title={`${citations.length} Sources`}
      >
        🔗
      </button>

      <div style={{
        display: 'flex', alignItems: 'center',
        background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)',
        borderLeft: 'none',
        borderRadius: '0 14px 14px 0', padding: '0', height: '28px',
        marginLeft: '-14px', paddingLeft: '18px', // Tuck behind the button
        width: expanded ? `${(citations.length * 44) + 20}px` : '0px',
        opacity: expanded ? 1 : 0,
        overflow: 'hidden',
        transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        zIndex: 1,
        whiteSpace: 'nowrap'
      }}>
        {citations.map((c, i) => {
          const url = resolveSourceUrl(c);
          const isExcluded = c.memoryId ? excludedMemories.has(c.memoryId) : false;
          return (
            <div key={i} style={{ 
              display: 'inline-flex', alignItems: 'center', gap: '2px', 
              marginRight: '8px', position: 'relative' 
            }}>
              <div
                title={`${c.title || c.snippet?.slice(0, 40) || ''} (Click to open)`}
                onClick={() => {
                  if (url) window.open(url, '_blank');
                }}
                style={{
                  width: '24px', height: '24px', borderRadius: '12px',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', fontSize: '14px',
                  transition: 'transform 0.2s',
                  background: isExcluded ? 'rgba(239,68,68,0.2)' : 'var(--bg-secondary)',
                  opacity: isExcluded ? 0.4 : 1,
                  border: '1px solid var(--border-subtle)'
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.2)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
              >
                {PLATFORM_ICONS[c.platform.toLowerCase()] ?? '🔗'}
              </div>
              {c.memoryId && (
                <button
                  disabled={isExcluded}
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!c.memoryId) return;
                    await fetch(`/api/memories/${c.memoryId}/exclude`, { method: 'PATCH' });
                    setExcludedMemories(prev => {
                      const next = new Set(prev);
                      next.add(c.memoryId!);
                      return next;
                    });
                  }}
                  title={isExcluded ? 'Excluded' : 'Exclude from patterns'}
                  style={{
                    border: 'none', background: 'none', color: isExcluded ? '#10b981' : '#ef4444',
                    cursor: isExcluded ? 'default' : 'pointer', fontSize: '10px', padding: '0 2px',
                    lineHeight: 1, display: 'flex', alignItems: 'center',
                  }}
                >
                  {isExcluded ? '✓' : '⊘'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChatPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const { user, isLoading } = useAuth();
  
  const [query, setQuery] = useState(initialQuery);
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesRef = useRef<Message[]>([]); // Always-fresh snapshot
  const [isStreaming, setIsStreaming] = useState(false);
  const [dbThreadId, setDbThreadId] = useState<string | null>(null); // Supabase UUID
  const dbThreadIdRef = useRef<string | null>(null); // Always-fresh ref
  const [brainPanelOpen, setBrainPanelOpen] = useState(false);
  const [excludedMemories, setExcludedMemories] = useState<Set<string>>(new Set());
  const rollingSummaryRef = useRef('');  // Section 04 — rolling conversation summary
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeStreamRef = useRef<AbortController | null>(null);
  const hasSubmittedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep refs in sync
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { dbThreadIdRef.current = dbThreadId; }, [dbThreadId]);

  /** Persist current messages to Supabase (immediate — no debounce) */
  const saveThread = async (msgs: Message[], existingDbId: string | null, firstUserMsg: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
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
        if (data.summary !== undefined) {
          rollingSummaryRef.current = data.summary || '';
        }
        if (!existingDbId && data.threadId) {
          setDbThreadId(data.threadId);
          dbThreadIdRef.current = data.threadId;
        }
        window.dispatchEvent(new CustomEvent('eyes-chat-saved'));
      }
    } catch (err) {
      console.warn('[Chat] Failed to persist thread:', err);
    }
  };

  const handleSubmit = async (text: string) => {
    const prompt = text.trim();
    if (!prompt) return;

    // Snapshot prior messages before any async state updates (avoids stale closure)
    const priorMessages = messagesRef.current.filter(m => !m.pending);
    const currentDbThreadId = dbThreadIdRef.current;
    
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
          history: priorMessages.map(m => ({ role: m.role, content: m.content })),
          threadId: currentDbThreadId,
          summary: rollingSummaryRef.current,
        }),
      });

      if (response.ok && response.body) {
        const citationsHeader = response.headers.get('X-Citations');
        let citations: Citation[] = [];
        if (citationsHeader) {
          try {
            let base64 = citationsHeader.replace(/-/g, '+').replace(/_/g, '/');
            while (base64.length % 4) {
              base64 += '=';
            }
            citations = JSON.parse(decodeURIComponent(escape(atob(base64)))) as Citation[];
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
        
        const finalContent = streamedReply.trim()
            ? streamedReply
            : '⚠️ All AI providers are currently unavailable (quota or rate limits). Please try again in a few minutes.';

          // Build final state OUTSIDE the setState callback
          const finalMessages = [
            ...priorMessages,
            { role: 'user' as const, content: prompt },
            {
              role: 'assistant' as const,
              content: finalContent,
              pending: false,
              citations: citations.length > 0 ? citations : undefined
            }
          ];

          // 1. Update UI
          messagesRef.current = finalMessages;
          setMessages(finalMessages);

          // 2. Persist to Supabase (outside setState — safe async call)
          const firstUser = priorMessages.find(m => m.role === 'user')?.content || prompt;
          void saveThread(finalMessages, dbThreadIdRef.current, firstUser);
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

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  // Load thread from URL query param if present
  const threadIdParam = searchParams.get('threadId');
  const newChatTrigger = searchParams.get('new');

  useEffect(() => {
    if (threadIdParam) {
      const loadSelectedThread = async () => {
        try {
          const res = await fetch(`/api/chat/threads?threadId=${threadIdParam}`);
          if (res.ok) {
            const data = await res.json();
            if (data.thread) {
              const msgs = (data.thread.chat_messages || []).map((m: any) => ({
                role: m.role,
                content: m.content
              }));
              setMessages(msgs);
              setDbThreadId(data.thread.id);
              rollingSummaryRef.current = data.thread.summary || '';
            }
          }
        } catch (e) {
          console.error('Failed to load thread from URL param:', e);
        }
      };
      loadSelectedThread();
    }
  }, [threadIdParam]);

  useEffect(() => {
    if (newChatTrigger) {
      setMessages([]);
      setDbThreadId(null);
      rollingSummaryRef.current = '';
    }
  }, [newChatTrigger]);

  // Initialize
  useEffect(() => {
    // If there's an initial query, trigger it (once)
    if (initialQuery && !hasSubmittedRef.current) {
      hasSubmittedRef.current = true;
      handleSubmit(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll to bottom (using 'auto' behavior to prevent animation stutter during streaming)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages]);

  // Show a premium black screen while loading auth session to prevent flashes
  if (isLoading) {
    return (
      <div style={{
        background: '#080808',
        height: '100vh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          color: '#E06A3B',
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: '12px',
          letterSpacing: '0.15em',
          marginBottom: '16px',
        }}>
          Connecting…
        </div>
        <div style={{
          width: '120px',
          height: '1px',
          background: 'rgba(255,255,255,0.06)',
          position: 'relative',
          overflow: 'hidden',
          borderRadius: '2px',
        }}>
          <div style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            width: '40%',
            background: '#E06A3B',
            animation: 'loadingSweep 1.2s infinite ease-in-out',
          }} />
        </div>
        <style>{`
          @keyframes loadingSweep {
            0% { left: -40%; }
            50% { left: 100%; }
            100% { left: 100%; }
          }
        `}</style>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const chatInputEl = (
    <div className={styles.inputBox} style={{ width: '100%', maxWidth: '680px', alignItems: 'flex-end' }}>
      <div style={{ paddingBottom: '10px' }}><SearchIcon /></div>
      <textarea 
        className={styles.input}
        placeholder="Ask me anything about your life…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          e.target.style.height = 'auto';
          e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
        }}
        onKeyDown={(e) => { 
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (query.trim()) {
              handleSubmit(query.trim());
              e.currentTarget.style.height = 'auto';
            }
          } 
        }}
        disabled={isStreaming}
        rows={1}
        style={{ resize: 'none', overflowY: 'auto', minHeight: '44px', maxHeight: '200px', paddingTop: '11px', paddingBottom: '11px' }}
      />
      <button 
        className={styles.sendBtn}
        onClick={() => { if (query.trim()) handleSubmit(query.trim()); }}
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
  );



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
          <div className={`${styles.chatColumn} ${brainPanelOpen ? styles.chatColumnWithPanel : ''}`}>
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
                    <div
                      className={styles.messageBubble}
                      data-role={m.role}
                    >
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
                                code: ({node, inline, ...props}: React.HTMLAttributes<HTMLElement> & { node?: unknown; inline?: boolean }) => 
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
                            {m.pending && <span className={styles.typingCursor}>▊</span>}
                          </div>
                        ) : (
                          <>
                            {m.content}
                            {m.pending && <span className={styles.typingCursor}>▊</span>}
                          </>
                        )}
                      </div>
                      {/* C9: Animated expanding Citation Dock — unified with SynthesisView */}
                      {m.role === 'assistant' && !m.pending && m.citations && m.citations.length > 0 && (
                        <CitationDockChat 
                          citations={m.citations} 
                          excludedMemories={excludedMemories}
                          setExcludedMemories={setExcludedMemories}
                        />
                      )}

                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}

            {/* Floating Input Area - Always visible for bottom placement */}
            <div className={styles.inputStickyContainer} style={{ display: 'flex', justifyContent: 'center' }}>
              {chatInputEl}
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
