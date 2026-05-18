'use client';

import { useEffect, useState, Suspense, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import styles from './MainContent.module.css';
import type { AuditSummary, PlatformStatus, FeedItem, Message } from '@/types/dashboard';

// Modular View Components
import { DashboardHomeView } from './dashboard/DashboardHomeView';
import { SourceReadinessView } from './dashboard/SourceReadinessView';
import { MemoryFeedView } from './dashboard/MemoryFeedView';
import { TimelineView } from './dashboard/TimelineView';
import { AuditView } from './dashboard/AuditView';
import { SynthesisView } from './dashboard/SynthesisView';
import { HistoryView } from './dashboard/HistoryView';
import { ActionQueueView } from './dashboard/ActionQueueView';

type ViewMode = 'dashboard' | 'synthesis' | 'audit' | 'timeline' | 'feed' | 'readiness' | 'connectors' | 'history' | 'action-queue';

function MainContentInner({ onLoaded }: { onLoaded?: () => void }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const viewParam = searchParams.get('view') as ViewMode | null;
  const activeView = viewParam || 'dashboard';
  const newChatTrigger = searchParams.get('new');

  // Reset chat if 'new' trigger is present
  useEffect(() => {
    if (newChatTrigger) {
      setMessages([]);
      setThreadId(Math.random().toString(36).substring(7));
    }
  }, [newChatTrigger]);

  const [summary, setSummary] = useState<AuditSummary>({ 
    totalMemories: 0, 
    overallRisk: 'LIGHT', 
    riskCounts: { heavy: 0, direct: 0, light: 0 }, 
    flaggedItems: [], 
    comparisonData: [] 
  });
  const [platforms, setPlatforms] = useState<PlatformStatus[]>([]);
  const [feedEvents, setFeedEvents] = useState<FeedItem[]>([]);
  const [filterPlatform, setFilterPlatform] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadId, setThreadId] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [, setIsLoading] = useState(true);

  // Initialize thread ID on client
  useEffect(() => {
    setThreadId(Math.random().toString(36).substring(7));
  }, []);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeStreamRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch('/api/dashboard/bootstrap', { cache: 'no-store' });
        const payload = await response.json();

        if (payload?.summary) setSummary(payload.summary);
        if (payload?.platforms) setPlatforms(payload.platforms);
        if (payload?.feedEvents) setFeedEvents(payload.feedEvents);
      } catch (err) { 
        console.error('Core Dashboard Load Failure:', err); 
      } finally { 
        setIsLoading(false);
        if (onLoaded) {
           setTimeout(onLoaded, 100);
        }
      }
    };

    const triggerAutoSync = async () => {
      // Prevent rapid fire auto-syncs (throttle to once every 5 mins per session)
      const lastSync = sessionStorage.getItem('eyes-auto-sync-timestamp');
      const now = Date.now();
      if (lastSync && now - parseInt(lastSync) < 300000) return;

      try {
        console.log('[Automatic Sync] Initiating neural link update...');
        sessionStorage.setItem('eyes-auto-sync-timestamp', now.toString());
        await fetch('/api/sync/all?background=true', { method: 'POST' });
      } catch (e) {
        console.warn('[Automatic Sync] Pulse failed to dispatch:', e);
      }
    };

    load();
    triggerAutoSync();

    // ── Post-connect refresh ───────────────────────────────────────────────
    // When returning from an OAuth connect flow the connect page stores a flag.
    // We do: immediate re-fetch (show "connected") + delayed re-fetch (show data).
    try {
      const connectedPlatform = sessionStorage.getItem('eyes-post-connect');
      if (connectedPlatform) {
        sessionStorage.removeItem('eyes-post-connect');
        console.log(`[Dashboard] Detected fresh connect for ${connectedPlatform} — forcing refresh.`);
        // Small delay so DB write from OAuth callback is visible
        setTimeout(() => load(), 800);
        // Second delayed fetch to capture data from the background sync
        setTimeout(() => load(), 5000);
      }
    } catch (_) {
      // sessionStorage unavailable — not critical
    }

    // Real-time UI synchronization listener with pulse-damping (throttle)
    let lastRefresh = 0;
    const handleRefresh = () => {
      const now = Date.now();
      if (now - lastRefresh < 5000) return; // Only allow refresh every 5s
      
      console.log('[Dashboard] Real-time pulse detected. Refreshing neural state...');
      lastRefresh = now;
      load();
    };

    window.addEventListener('eyes-realtime-refresh', handleRefresh);
    return () => window.removeEventListener('eyes-realtime-refresh', handleRefresh);
  }, [onLoaded]);


  // Handle Scroll to Bottom for Chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!isStreaming && messages.length > 0 && threadId) {
      try {
        const saved = JSON.parse(localStorage.getItem('eyes_chat_history') || '[]');
        interface StoredThread { id: string; [key: string]: unknown; }
        const existingIndex = saved.findIndex((t: StoredThread) => t.id === threadId);
        const newThread = {
          id: threadId,
          title: messages[0].content.slice(0, 40) + '...',
          timestamp: new Date().toLocaleDateString() + ", " + new Date().toLocaleTimeString(),
          turns: Math.ceil(messages.length / 2),
          snippet: messages[0].content,
          assistantReplied: messages.length > 1 ? messages[1].content.slice(0, 100) : '',
          messages: messages
        };
        if (existingIndex >= 0) saved[existingIndex] = newThread;
        else saved.unshift(newThread);
        localStorage.setItem('eyes_chat_history', JSON.stringify(saved));
      } catch (e) {
        console.error("Failed to save chat", e);
      }
    }
  }, [messages, isStreaming, threadId]);

  const setView = (v: string) => {
    router.push(`?view=${v}`, { scroll: false });
  };

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
        interface Citation { id: string; platform?: string; title?: string; source_url?: string | null; }
        let citations: Citation[] = [];
        if (citationsHeader) {
          try {
            citations = JSON.parse(atob(citationsHeader.replace(/-/g, '+').replace(/_/g, '/'))) as Citation[];
          } catch (e) {
            console.warn('[Dashboard] Failed to parse citations header:', e);
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
          return [...prev.slice(0, -1), { 
            role: 'assistant', 
            content: streamedReply, 
            pending: false,
            citations: citations.length > 0 ? citations : undefined
          }];
        });
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Chat Stream Failed:', err);
      }
    } finally {
      setIsStreaming(false);
      activeStreamRef.current = null;
    }
  };

  return (
    <main className={styles.main}>
      {activeView === 'dashboard' && (
        <SynthesisView 
          query={query}
          setQuery={setQuery}
          messages={messages}
          isStreaming={isStreaming}

          onSubmit={handleSubmit}
          messagesEndRef={messagesEndRef}
          setView={setView}
          totalMemories={summary.totalMemories}
          platforms={platforms}
        />
      )}

      {activeView === 'feed' && (
        <MemoryFeedView 
          onBack={() => setView('dashboard')}
          feedEvents={feedEvents}
          platforms={platforms}
          filterPlatform={filterPlatform}
          setFilterPlatform={setFilterPlatform}
        />
      )}

      {activeView === 'timeline' && (
        <TimelineView onBack={() => setView('dashboard')} />
      )}

      {activeView === 'audit' && (
        <AuditView onBack={() => setView('dashboard')} summary={summary} />
      )}

      {activeView === 'history' && (
        <HistoryView 
          onBack={() => setView('dashboard')} 
          onLoadThread={(msgs) => {
            setMessages(msgs);
            setThreadId(Math.random().toString(36).substring(7)); // branch out a new thread if continued
            setView('dashboard');
          }}
        />
      )}

      {activeView === 'readiness' && (
        <SourceReadinessView platforms={platforms} />
      )}

      {activeView === 'connectors' && (
        <DashboardHomeView platforms={platforms} />
      )}
      {activeView === 'action-queue' && (
        <ActionQueueView 
          onBack={() => router.push('/?view=dashboard')}
        />
      )}
    </main>
  );
}

export default function MainContent(props: { onLoaded?: () => void }) { 
  return (
    <Suspense fallback={null}>
      <MainContentInner {...props} />
    </Suspense>
  ); 
}

