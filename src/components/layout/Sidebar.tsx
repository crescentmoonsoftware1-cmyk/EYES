'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  ConnectorsIcon,
  PlusIcon,
  AIIntegrationIcon,
  AuditIcon,
  GraphIcon,
  FeedIcon,
  ActionIcon
} from '../common/icons/SidebarIcons';
import styles from './Sidebar.module.css';
import EyesLogo from '../common/EyesLogo';

interface Platform {
  id: string;
  connected: boolean;
  status: string;
}

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeView = searchParams.get('view') || 'dashboard';
  const activeThreadId = searchParams.get('threadId');
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [threads, setThreads] = useState<any[]>([]);
  const [starredIds, setStarredIds] = useState<string[]>([]);
  const { user } = useAuth();

  const adminEmailsEnv = process.env.NEXT_PUBLIC_ADMIN_EMAILS || '';
  const adminEmails = adminEmailsEnv.split(',')
    .map(email => email.trim().toLowerCase())
    .filter(email => email !== '');
  const isAdmin = user && user.email && adminEmails.length > 0 && adminEmails.includes(user.email.toLowerCase());

  // Load readiness status
  useEffect(() => {
    const loadReadiness = async () => {
      try {
        const response = await fetch('/api/platform-readiness', { cache: 'no-store' });
        if (response.ok) {
          const data = await response.json();
          setPlatforms(data.platforms || []);
        }
      } catch (e) { }
    };
    loadReadiness();
    const interval = setInterval(loadReadiness, 120000); // Every 2 min
    return () => clearInterval(interval);
  }, []);

  // Fetch threads — filter out ghost threads (0 messages) from the broken save period
  const fetchThreads = async () => {
    try {
      const res = await fetch('/api/chat/threads');
      if (res.ok) {
        const data = await res.json();
        const allThreads: any[] = data.threads || [];
        
        // Only show threads that have at least 1 saved message
        const validThreads = allThreads.filter(t => (t.chat_messages?.length ?? 0) > 0);
        
        // Silently delete ghost threads (threads with 0 messages) to keep DB clean
        const ghostThreads = allThreads.filter(t => (t.chat_messages?.length ?? 0) === 0);
        for (const ghost of ghostThreads) {
          fetch(`/api/chat/threads?threadId=${ghost.id}`, { method: 'DELETE' }).catch(() => {});
        }
        
        setThreads(validThreads);
      }
    } catch (e) {
      console.error('[Sidebar] Failed to load threads:', e);
    }
  };

  // Load starred threads from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('eyes_starred_threads');
        if (raw) setStarredIds(JSON.parse(raw));
      } catch (e) {
        console.error(e);
      }
    }
    fetchThreads();

    // Listen to chat saves and general refreshes
    const handleSaved = () => fetchThreads();
    window.addEventListener('eyes-chat-saved', handleSaved);
    window.addEventListener('eyes-realtime-refresh', handleSaved);
    return () => {
      window.removeEventListener('eyes-chat-saved', handleSaved);
      window.removeEventListener('eyes-realtime-refresh', handleSaved);
    };
  }, []);

  const toggleStar = (threadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setStarredIds((prev) => {
      const next = prev.includes(threadId)
        ? prev.filter(id => id !== threadId)
        : [...prev, threadId];
      if (typeof window !== 'undefined') {
        localStorage.setItem('eyes_starred_threads', JSON.stringify(next));
      }
      return next;
    });
  };

  const handleDeleteThread = async (threadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Delete this conversation?')) return;
    try {
      const res = await fetch(`/api/chat/threads?threadId=${threadId}`, { method: 'DELETE' });
      if (res.ok) {
        setThreads(prev => prev.filter(t => t.id !== threadId));
        setStarredIds(prev => {
          const next = prev.filter(id => id !== threadId);
          localStorage.setItem('eyes_starred_threads', JSON.stringify(next));
          return next;
        });
        if (searchParams.get('threadId') === threadId) {
          router.push('/?view=dashboard&new=' + Date.now());
        }
        window.dispatchEvent(new CustomEvent('eyes-chat-saved'));
      }
    } catch (err) {
      console.error('Failed to delete thread:', err);
    }
  };

  // Group threads chronologically
  const groupedThreads = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const starred: any[] = [];
    const todayGroup: any[] = [];
    const yesterdayGroup: any[] = [];
    const last7DaysGroup: any[] = [];
    const olderGroup: any[] = [];

    threads.forEach(t => {
      if (starredIds.includes(t.id)) {
        starred.push(t);
        return;
      }
      
      const date = new Date(t.updated_at || t.created_at);
      date.setHours(0, 0, 0, 0);

      if (date.getTime() === today.getTime()) {
        todayGroup.push(t);
      } else if (date.getTime() === yesterday.getTime()) {
        yesterdayGroup.push(t);
      } else if (date.getTime() >= sevenDaysAgo.getTime()) {
        last7DaysGroup.push(t);
      } else {
        olderGroup.push(t);
      }
    });

    return {
      starred,
      today: todayGroup,
      yesterday: yesterdayGroup,
      last7Days: last7DaysGroup,
      older: olderGroup
    };
  }, [threads, starredIds]);

  const connectedCount = platforms.filter(p => p.connected).length;
  const coverageScore = useMemo(() => {
    if (platforms.length === 0) return 0;
    return Math.round((connectedCount / platforms.length) * 100);
  }, [platforms, connectedCount]);

  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (coverageScore / 100) * circumference;

  const navigateToView = (view: string) => {
    if (view === 'chat') {
      if (pathname === '/chat') {
        router.push(`/chat?new=${Date.now()}`);
      } else {
        router.push(`/?view=dashboard&new=${Date.now()}`);
      }
    } else if (view === 'dashboard') {
      router.push('/');
    } else if (view === 'admin-funnel') {
      router.push('/admin/funnel');
    } else {
      router.push(`/?view=${view}`);
    }
  };

  const renderThreadItem = (t: any) => {
    const isActive = activeThreadId === t.id;
    const isStarred = starredIds.includes(t.id);
    const targetUrl = pathname === '/chat'
      ? `/chat?threadId=${t.id}`
      : `/?view=dashboard&threadId=${t.id}`;

    return (
      <div
        key={t.id}
        className={`${styles.chatItem} ${isActive ? styles.chatItemActive : ''} ${isStarred ? styles.chatItemStarred : ''}`}
        onClick={() => router.push(targetUrl)}
      >
        <span className={styles.chatTitle}>{t.title}</span>
        <div className={styles.chatActions}>
          <button
            className={`${styles.chatActionBtn} ${isStarred ? styles.starBtnActive : ''}`}
            onClick={(e) => toggleStar(t.id, e)}
            title={isStarred ? "Unstar" : "Star"}
          >
            ★
          </button>
          <button
            className={styles.chatActionBtn}
            onClick={(e) => handleDeleteThread(t.id, e)}
            title="Delete chat"
          >
            ✕
          </button>
        </div>
      </div>
    );
  };

  return (
    <aside className={styles.sidebar}>
      <div onClick={() => router.push('/')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '6px 12px', marginBottom: '16px', color: 'var(--text-primary)' }}>
        <EyesLogo width={92} height={22} />
      </div>

      <button className={styles.newChatBtn} onClick={async () => {
        // Refresh sidebar first so current conversation appears as history
        await fetchThreads();
        navigateToView('chat');
      }}>
        <PlusIcon /> New chat
      </button>

      <div className={styles.scrollArea}>
        <div className={styles.section}>
          <div
            className={`${styles.item} ${activeView === 'connectors' ? styles.itemActive : ''}`}
            onClick={() => navigateToView('connectors')}
          >
            <div className={styles.itemIcon}><ConnectorsIcon /></div>
            <div className={styles.itemMain}>
              <span className={styles.itemLabel}>Connectors</span>
              <span className={styles.itemDesc}>Manage connected sources</span>
            </div>
          </div>

          <div
            className={`${styles.item} ${activeView === 'feed' ? styles.itemActive : ''}`}
            onClick={() => navigateToView('feed')}
          >
            <div className={styles.itemIcon}><FeedIcon /></div>
            <div className={styles.itemMain}>
              <span className={styles.itemLabel}>Source Feed</span>
              <span className={styles.itemDesc}>Ingested raw memories</span>
            </div>
          </div>

          <div
            className={`${styles.item} ${activeView === 'timeline' ? styles.itemActive : ''}`}
            onClick={() => navigateToView('timeline')}
          >
            <div className={styles.itemIcon}><GraphIcon /></div>
            <div className={styles.itemMain}>
              <span className={styles.itemLabel}>Time Line</span>
              <span className={styles.itemDesc}>Chronological event mapping</span>
            </div>
          </div>

          <div
            className={`${styles.item} ${activeView === 'audit' ? styles.itemActive : ''}`}
            onClick={() => navigateToView('audit')}
          >
            <div className={styles.itemIcon}><AuditIcon /></div>
            <div className={styles.itemMain}>
              <span className={styles.itemLabel}>Audit</span>
              <span className={styles.itemDesc}>Consistency & contradiction report</span>
            </div>
          </div>

          <div
            className={`${styles.item} ${activeView === 'action-queue' ? styles.itemActive : ''}`}
            onClick={() => navigateToView('action-queue')}
          >
            <div className={styles.itemIcon}><ActionIcon /></div>
            <div className={styles.itemMain}>
              <span className={styles.itemLabel}>Action Queue <span style={{ fontSize: '8px', background: 'var(--accent-primary)', color: 'var(--bg-primary)', padding: '2px 4px', borderRadius: '4px', marginLeft: '4px', fontWeight: 800 }}>BETA</span></span>
              <span className={styles.itemDesc}>Review and approve actions</span>
            </div>
          </div>




          {isAdmin && (
            <div
              className={`${styles.item} ${activeView === 'admin-funnel' ? styles.itemActive : ''}`}
              onClick={() => navigateToView('admin-funnel')}
              style={{ borderLeft: '2px solid #E06A3B', paddingLeft: '6px' }}
            >
              <div className={styles.itemIcon}><GraphIcon /></div>
              <div className={styles.itemMain}>
                <span className={styles.itemLabel} style={{ color: '#E06A3B' }}>Admin Analytics</span>
                <span className={styles.itemDesc}>Onboarding funnel metrics</span>
              </div>
            </div>
          )}

          <div className={styles.chatHistoryContainer}>
            <div className={styles.chatHistoryDivider} />

            {/* Starred Group */}
            {groupedThreads.starred.length > 0 && (
              <div>
                <div className={styles.historyHeader}>Starred</div>
                {groupedThreads.starred.map(renderThreadItem)}
              </div>
            )}

            {/* Today Group */}
            {groupedThreads.today.length > 0 && (
              <div>
                <div className={styles.historyHeader}>Today</div>
                {groupedThreads.today.map(renderThreadItem)}
              </div>
            )}

            {/* Yesterday Group */}
            {groupedThreads.yesterday.length > 0 && (
              <div>
                <div className={styles.historyHeader}>Yesterday</div>
                {groupedThreads.yesterday.map(renderThreadItem)}
              </div>
            )}

            {/* Last 7 Days Group */}
            {groupedThreads.last7Days.length > 0 && (
              <div>
                <div className={styles.historyHeader}>Previous 7 Days</div>
                {groupedThreads.last7Days.map(renderThreadItem)}
              </div>
            )}

            {/* Older Group */}
            {groupedThreads.older.length > 0 && (
              <div>
                <div className={styles.historyHeader}>Older</div>
                {groupedThreads.older.map(renderThreadItem)}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={styles.footer}>
        <div className={styles.readinessCard} onClick={() => navigateToView('readiness')}>
          <div className={styles.readinessHeader}>
            <span className={styles.readinessTitle}>SOURCE READINESS</span>
          </div>

          <div className={styles.readinessContent}>
            <div className={styles.gaugeWrapper}>
              <svg viewBox="0 0 100 100" className={styles.gaugeSvg}>
                <circle cx="50" cy="50" r="45" className={styles.gaugeBg} />
                <circle
                  cx="50" cy="50" r="45"
                  className={styles.gaugeFill}
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                />
                <text x="50" y="58" textAnchor="middle" className={styles.gaugeText}>{coverageScore}%</text>
              </svg>
            </div>
            <div className={styles.readinessInfo}>
              <div className={styles.platformsCount}>
                {connectedCount}/{platforms.length} Platforms
              </div>
              <div className={styles.reliabilityLabel}>
                Reliability: <span className={styles.reliabilityHigh}>High</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
