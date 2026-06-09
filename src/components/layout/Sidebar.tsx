'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { 
  ChatIcon, 
  ConnectorsIcon, 
  HistoryIcon,
  PlusIcon,
  EyeIconSmall
} from '../common/icons/SidebarIcons';
import styles from './Sidebar.module.css';

interface Platform {
  id: string;
  connected: boolean;
  status: string;
}

export default function Sidebar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeView = searchParams.get('view') || 'dashboard';
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const { user } = useAuth();

  const adminEmailsEnv = process.env.NEXT_PUBLIC_ADMIN_EMAILS || '';
  const adminEmails = adminEmailsEnv.split(',').map(email => email.trim().toLowerCase());
  const isAdmin = user && user.email && adminEmails.includes(user.email.toLowerCase());


  useEffect(() => {
    const loadReadiness = async () => {
      try {
        const response = await fetch('/api/platform-readiness', { cache: 'no-store' });
        if (response.ok) {
          const data = await response.json();
          setPlatforms(data.platforms || []);
        }
      } catch (e) {}
    };
    loadReadiness();
    const interval = setInterval(loadReadiness, 120000); // Every 2 min — connections rarely change
    return () => clearInterval(interval);
  }, []);

  const connectedCount = platforms.filter(p => p.connected).length;
  const coverageScore = useMemo(() => {
    if (platforms.length === 0) return 0;
    return Math.round((connectedCount / platforms.length) * 100);
  }, [platforms, connectedCount]);

  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (coverageScore / 100) * circumference;

  const navigateToView = (view: string) => {
    if (view === 'chat') {
      router.push(`/?view=dashboard&new=${Date.now()}`);
    } else if (view === 'dashboard') {
      router.push('/');
    } else if (view === 'admin-funnel') {
      router.push('/admin/funnel');
    } else {
      router.push(`/?view=${view}`);
    }
  };

  return (
    <aside className={styles.sidebar}>
      <div onClick={() => router.push('/')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 10px', marginBottom: '20px' }}>
        <div style={{ width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
        </div>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontWeight: 800, fontSize: '18px', letterSpacing: '2.5px', color: 'var(--text-primary)', margin: 0 }}>EYES</h1>
      </div>

      <div className={styles.scrollArea}>
        <div className={styles.section}>
          
          <div 
            className={`${styles.item} ${activeView === 'dashboard' ? styles.itemActive : ''}`} 
            onClick={() => navigateToView('chat')}
          >
            <div className={styles.itemIcon}><span style={{fontSize: '18px', filter: 'grayscale(1)'}}>💬</span></div>
            <div className={styles.itemMain}>
              <span className={styles.itemLabel}>Chat</span>
              <span className={styles.itemDesc}>Start a new thread</span>
            </div>
          </div>

          <div 
            className={`${styles.item} ${activeView === 'connectors' ? styles.itemActive : ''}`} 
            onClick={() => navigateToView('connectors')}
          >
            <div className={styles.itemIcon}><span style={{fontSize: '18px', filter: 'grayscale(1)'}}>🔗</span></div>
            <div className={styles.itemMain}>
              <span className={styles.itemLabel}>Connectors</span>
              <span className={styles.itemDesc}>Manage connected sources</span>
            </div>
          </div>

          <div 
            className={`${styles.item} ${activeView === 'action-queue' ? styles.itemActive : ''}`} 
            onClick={() => navigateToView('action-queue')}
          >
            <div className={styles.itemIcon}><span style={{fontSize: '18px', filter: 'grayscale(1)'}}>⚡</span></div>
            <div className={styles.itemMain}>
              <span className={styles.itemLabel}>Action Queue <span style={{fontSize: '8px', background: 'var(--accent-primary)', color: 'var(--bg-primary)', padding: '2px 4px', borderRadius: '4px', marginLeft: '4px', fontWeight: 800}}>BETA</span></span>
              <span className={styles.itemDesc}>Approve autonomous tasks</span>
            </div>
          </div>


          <div 
            className={`${styles.item} ${activeView === 'history' ? styles.itemActive : ''}`} 
            onClick={() => navigateToView('history')}
          >
            <div className={styles.itemIcon}><span style={{fontSize: '18px', filter: 'grayscale(1)'}}>🕒</span></div>
            <div className={styles.itemMain}>
              <span className={styles.itemLabel}>History</span>
              <span className={styles.itemDesc}>Review runs and activity</span>
            </div>
          </div>

          {isAdmin && (
            <div 
              className={`${styles.item} ${activeView === 'admin-funnel' ? styles.itemActive : ''}`} 
              onClick={() => navigateToView('admin-funnel')}
              style={{ borderLeft: '2px solid #E06A3B', paddingLeft: '6px' }}
            >
              <div className={styles.itemIcon}><span style={{fontSize: '18px'}}>📊</span></div>
              <div className={styles.itemMain}>
                <span className={styles.itemLabel} style={{ color: '#E06A3B' }}>Admin Analytics</span>
                <span className={styles.itemDesc}>Onboarding funnel metrics</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={styles.footer}>
        <div className={styles.readinessCard} onClick={() => navigateToView('readiness')}>
          <div className={styles.readinessHeader}>
             <span className={styles.readinessIcon} style={{fontSize: '14px', filter: 'grayscale(1)'}}>👁️</span>
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
