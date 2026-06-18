'use client';

import { useEffect, useState, Suspense, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import styles from './MainContent.module.css';
import type { AuditSummary, Citation, PlatformStatus, FeedItem, Message } from '@/types/dashboard';

// Modular View Components
import { DashboardHomeView } from './dashboard/DashboardHomeView';
import { SourceReadinessView } from './dashboard/SourceReadinessView';
import { MemoryFeedView } from './dashboard/MemoryFeedView';
import { TimelineView } from './dashboard/TimelineView';
import { AuditView } from './dashboard/AuditView';
import { SynthesisView } from './dashboard/SynthesisView';
import { ActionQueueView } from './dashboard/ActionQueueView';
import { AIIntegrationView } from './dashboard/AIIntegrationView';

type ViewMode = 'dashboard' | 'synthesis' | 'audit' | 'timeline' | 'feed' | 'readiness' | 'connectors' | 'action-queue' | 'integrations';

function MainContentInner({ onLoaded }: { onLoaded?: () => void }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const viewParam = searchParams.get('view') as ViewMode | null;
  const activeView = viewParam || 'dashboard';
  const newChatTrigger = searchParams.get('new');

  const rollingSummaryRef = useRef('');



  const [summary, setSummary] = useState<AuditSummary>({ 
    totalMemories: 0, 
    overallRisk: 'LIGHT', 
    riskCounts: { heavy: 0, direct: 0, light: 0 }, 
    flaggedItems: [], 
    comparisonData: [] 
  });
  const [platforms, setPlatforms] = useState<PlatformStatus[]>([]);
  const [feedEvents, setFeedEvents] = useState<FeedItem[]>([]);
  const [syncStatus, setSyncStatus] = useState<{ memoriesIndexed: number; isSyncing: boolean; activeSyncs: string[] } | null>(null);
  const [filterPlatform, setFilterPlatform] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesRef = useRef<Message[]>([]); // Always-fresh snapshot of messages
  const [threadId, setThreadId] = useState<string>('');
  const threadIdRef = useRef<string>(''); // Always-fresh ref to avoid stale closure in saveThread
  const [isStreaming, setIsStreaming] = useState(false);
  const [, setIsLoading] = useState(true);

  const threadIdParam = searchParams.get('threadId');

  // Keep threadIdRef in sync with state
  useEffect(() => {
    threadIdRef.current = threadId;
  }, [threadId]);

  // Keep messagesRef in sync with state (for stale-closure-free access)
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Load thread from URL query param if present, or initialize/reset if empty or on new chat trigger
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
              messagesRef.current = msgs;
              setThreadId(data.thread.id);
              threadIdRef.current = data.thread.id;
              rollingSummaryRef.current = data.thread.summary || '';
            }
          }
        } catch (e) {
          console.error('Failed to load thread from URL param:', e);
        }
      };
      loadSelectedThread();
    } else {
      setMessages([]);
      setThreadId(Math.random().toString(36).substring(7));
      rollingSummaryRef.current = '';
    }
  }, [threadIdParam, newChatTrigger]);
  
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
        if (payload?.syncStatus) setSyncStatus(payload.syncStatus);
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
        console.log('[Automatic Sync] Initiating background sync...');
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
      
      console.log('[Dashboard] Real-time event detected. Refreshing data...');
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

  const saveThread = async (msgs: Message[], currentThreadId: string | null) => {
    try {
      const firstUserMsg = msgs.find(m => m.role === 'user')?.content || 'New Chat';
      const payload = {
        threadId: currentThreadId,
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
        if (!currentThreadId && data.threadId) {
          setThreadId(data.threadId);
          threadIdRef.current = data.threadId;
          router.replace(`/?view=dashboard&threadId=${data.threadId}`, { scroll: false });
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

    // Snapshot current messages before any async state updates
    const priorMessages = messagesRef.current.filter(m => !m.pending);
    
    activeStreamRef.current?.abort();
    const controller = new AbortController();
    activeStreamRef.current = controller;
    
    setMessages((prev) => [...prev, { role: 'user' as const, content: prompt }, { role: 'assistant' as const, content: '', pending: true }]);
    setQuery('');
    setIsStreaming(true);
 
    try {
      const currentThreadId = threadIdRef.current;
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(currentThreadId);
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
          threadId: isUUID ? currentThreadId : null,
          summary: rollingSummaryRef.current,
        }),
      });

      if (!response.ok) {
        const errText = response.status === 401
          ? 'Session expired — please refresh the page and log in again.'
          : `Chat failed (${response.status}). Please try again.`;
        setMessages(prev => [...prev.slice(0, -1), { role: 'assistant' as const, content: errText, pending: false }]);
        return;
      }

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
                role: 'assistant' as const, 
                content: streamedReply, 
                pending: true,
                citations: citations.length > 0 ? citations : undefined
              }];
            }
            return prev;
          });
        }
        
        const finalMessages = [
          ...priorMessages,
          { role: 'user' as const, content: prompt },
          { 
            role: 'assistant' as const, 
            content: streamedReply, 
            pending: false,
            citations: citations.length > 0 ? citations : undefined
          }
        ];
        setMessages(finalMessages);
        messagesRef.current = finalMessages;
        // Use ref for threadId to avoid stale closure
        const savedThreadId = threadIdRef.current;
        const isCurrentlyUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(savedThreadId);
        void saveThread(finalMessages, isCurrentlyUUID ? savedThreadId : null);
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
    <main className={`${styles.main}${activeView === 'audit' ? ` ${styles.auditMain}` : ''}`}>
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


      {activeView === 'readiness' && (
        <SourceReadinessView platforms={platforms} totalMemories={syncStatus?.memoriesIndexed ?? summary.totalMemories ?? 0} />
      )}

      {activeView === 'connectors' && (
      <DashboardHomeView platforms={platforms} syncStatus={syncStatus} />
      )}
      {activeView === 'action-queue' && (
        <ActionQueueView 
          onBack={() => router.push('/?view=dashboard')}
        />
      )}
      {activeView === 'integrations' && (
        <AIIntegrationView 
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

