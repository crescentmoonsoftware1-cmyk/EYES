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
import type { Message } from '@/types/dashboard';
import { AlertsBanner } from '@/components/chat/AlertsBanner';
import { ClusterValidationModal } from '@/components/chat/ClusterValidationModal';
import { CognitiveRightPanel } from '@/components/chat/CognitiveRightPanel';

/**
 * Converts AI markdown output to rendered HTML.
 * Handles bold, italic, bullet lists, numbered lists, and line breaks.
 */
function renderMarkdown(text: string): string {
  // Process line by line to wrap <li> groups in <ul> without needing the `s` flag
  const lines = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.*?)__/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/^[-\*•]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')
    .split('\n');

  const result: string[] = [];
  let inList = false;
  for (const line of lines) {
    if (line.startsWith('<li>')) {
      if (!inList) { result.push('<ul>'); inList = true; }
      result.push(line);
    } else {
      if (inList) { result.push('</ul>'); inList = false; }
      result.push(line);
    }
  }
  if (inList) result.push('</ul>');

  return '<p>' + result.join('\n').replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br />') + '</p>';
}

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
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ 
          message: prompt,
          history: messages.map(m => ({ role: m.role, content: m.content })) 
        }),
      });

      if (response.ok && response.body) {
        const citationsHeader = response.headers.get('X-Citations');
        interface Citation { id?: string; memoryId?: string; platform?: string; title?: string; source_url?: string | null; }
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
          { role: 'assistant', content: '⚠️ The neural service returned an error. Please try again.', pending: false }
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
                <h1 className={styles.brandTitle}>The EYES</h1>
                <p className={styles.brandSubtitle}>How can the neural index assist you today?</p>
              </div>
            ) : (
              <div className={styles.messageList}>
                {messages.map((m, i) => (
                  <div key={i} className={`${styles.messageRow} ${m.role === 'user' ? styles.userRow : styles.aiRow}`}>
                    <div className={styles.messageBubble}>
                      {/* Metadata line — only shown when platforms are actually connected */}

                      <div className={styles.msgBody}>
                        {m.role === 'assistant' && m.content ? (
                          <div
                            className={styles.markdownContent}
                            dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
                          />
                        ) : (
                          m.content
                        )}
                        {m.pending && <span className={styles.typingCursor}>▊</span>}
                      </div>
                      {/* Cited memory exclusion buttons */}
                      {m.role === 'assistant' && !m.pending && m.citations && m.citations.length > 0 && (
                        <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
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
                                  background: isExcluded ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.04)',
                                  border: `1px solid ${isExcluded ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.1)'}`,
                                  color: isExcluded ? '#10b981' : '#6b7280',
                                  borderRadius: '6px', padding: '3px 8px',
                                  fontSize: '11px', cursor: isExcluded ? 'default' : 'pointer',
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
                      )}
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
                  placeholder="Continue the investigation..."
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
                  title="Cognitive Layer"
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
