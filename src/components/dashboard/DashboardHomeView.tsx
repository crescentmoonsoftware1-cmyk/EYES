'use client';

import React from 'react';
import styles from '../MainContent.module.css';
import { ALL_POSSIBLE_PLATFORMS } from '@/config/platforms';
import type { PlatformStatus } from '@/types/dashboard';

interface DashboardHomeViewProps {
  platforms: PlatformStatus[];
}

export function DashboardHomeView({ platforms }: DashboardHomeViewProps) {
  const [activeCategory, setActiveCategory] = React.useState<string>('All');
  const [liveStatus, setLiveStatus] = React.useState<{ memoriesIndexed: number; isSyncing: boolean; activeSyncs: string[] } | null>(null);

  React.useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/sync/status');
        if (res.ok) {
          const data = await res.json();
          setLiveStatus({
            memoriesIndexed: data.memoriesIndexed || 0,
            isSyncing: data.isSyncing,
            activeSyncs: data.activeSyncs || [],
          });
        }
      } catch (e) {
        console.error('Failed to fetch live sync status', e);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 8000); // Poll every 8s
    return () => clearInterval(interval);
  }, []);
  
  const remainingPlatforms = ALL_POSSIBLE_PLATFORMS.filter(p => !platforms.find(ap => ap.id === p.id)?.connected);
  const categories = ['All', 'Productivity', 'Development', 'Social', 'Creative', 'Health'];

  const filteredRemaining = activeCategory === 'All' 
    ? remainingPlatforms 
    : remainingPlatforms.filter(p => (p as any).category === activeCategory);

  // Platforms with a fully-registered & working OAuth app
  const primaryPlatformIds = [
    'gmail', 'google-calendar', 'notion', 'slack', 'github', 'discord',
    'dropbox',
  ];

  // Platforms that connect via API key — no OAuth redirect
  const apiKeyPlatformIds = ['vercel', 'trello'];

  // OAuth redirect URL not yet registered on platform — show as Coming Soon (non-clickable)
  const comingSoonIds = [
    'asana', 'clickup', 'netlify', 'webflow', 'canva', 'reddit',
    'twitter', 'linear', 'sentry', 'strava', 'fitbit', 'withings',
  ];
  
  const primaryRemaining   = filteredRemaining.filter(p => primaryPlatformIds.includes(p.id));
  const apiKeyRemaining    = filteredRemaining.filter(p => apiKeyPlatformIds.includes(p.id));
  const comingSoonPlatforms = filteredRemaining.filter(p => comingSoonIds.includes(p.id));

  const renderPlatformCard = (p: any) => {
    const isApiKey = apiKeyPlatformIds.includes(p.id);

    const startAuth = () => {
      if (isApiKey) {
        alert(`${p.name} connects via an API key configured in your environment — no OAuth flow required. Your key is already active.`);
        return;
      }
      let startUrl = `/api/connect/${p.id}/start`;
      if (p.id === 'gmail' || p.id === 'google-calendar') {
        startUrl = `/api/connect/google/start?platform=${p.id}`;
      }
      window.location.href = startUrl;
    };

    return (
      <div key={p.id} className={styles.readinessCard} onClick={startAuth} style={{ cursor: 'pointer' }}>
        <div className={styles.cardHeader}>
          <div
            className={styles.readinessIcon}
            style={{
              backgroundColor: (p as any).color?.startsWith('#') ? `${(p as any).color}15` : 'var(--bg-secondary)',
              border: (p as any).color?.startsWith('#') ? `1px solid ${(p as any).color}30` : '1px solid var(--border-subtle)',
            }}
          >
            {p.icon ? React.cloneElement(p.icon as React.ReactElement<any>, { size: 24 }) : null}
          </div>
          <div className={styles.readinessInfo}>
            <strong>{p.name}</strong>
            <span className={styles.availStatusText}>{isApiKey ? 'API Key' : 'Connect Now'}</span>
          </div>
          {!isApiKey && <span className={styles.addIndicator}>+</span>}
          {isApiKey && <span className={styles.addIndicator} style={{ fontSize: '14px' }}>🔑</span>}
        </div>
        <p className={styles.platformDesc}>{(p as any).description || 'Integrate this platform to expand your neural knowledge base.'}</p>
      </div>
    );
  };

  const renderComingSoonCard = (p: any) => (
    <div
      key={p.id}
      className={styles.readinessCard}
      style={{
        cursor: 'not-allowed',
        opacity: 0.55,
        filter: 'grayscale(40%)',
        position: 'relative',
        userSelect: 'none',
        pointerEvents: 'none',
      }}
    >
      {/* Coming Soon badge */}
      <div style={{
        position: 'absolute', top: '12px', right: '12px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '99px',
        padding: '3px 10px',
        fontSize: '9px',
        fontWeight: 800,
        letterSpacing: '1.5px',
        color: 'var(--text-secondary)',
        textTransform: 'uppercase',
      }}>
        Coming Soon
      </div>

      <div className={styles.cardHeader}>
        <div
          className={styles.readinessIcon}
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          {p.icon ? React.cloneElement(p.icon as React.ReactElement<any>, { size: 24 }) : null}
        </div>
        <div className={styles.readinessInfo}>
          <strong>{p.name}</strong>
          <span style={{ fontSize: '10px', color: 'var(--text-secondary)', letterSpacing: '1px', fontWeight: 700 }}>UNAVAILABLE</span>
        </div>
      </div>
      <p className={styles.platformDesc} style={{ color: 'var(--text-secondary)' }}>
        {(p as any).description || 'Integration coming soon.'}
      </p>
    </div>
  );


  return (
    <div className={styles.readinessContainer}>
      {/* High-Contrast Live Indexing Counter Hero */}
      <div style={{ marginBottom: '48px', paddingBottom: '32px', borderBottom: '1px solid var(--border-subtle)' }}>
        <h1 className={styles.pageHeroTitle} style={{ textAlign: 'left', marginBottom: '24px' }}>Neural Archive</h1>
        <div style={{ display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ padding: '20px 32px', background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
             <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '2px' }}>Total Memories Indexed</span>
             <div style={{ fontSize: '42px', fontWeight: '900', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', lineHeight: 1 }}>
               {liveStatus ? liveStatus.memoriesIndexed.toLocaleString() : '---'}
             </div>
          </div>
          
          {liveStatus?.isSyncing && (
             <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 24px', borderRadius: '99px', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--text-primary)', fontSize: '14px', fontWeight: '700', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
               <span className={styles.typingCursor} style={{ background: '#10b981', width: '10px', height: '10px', borderRadius: '50%' }}></span>
               Engine Active: Syncing {liveStatus.activeSyncs.length} stream(s)...
             </div>
          )}
        </div>
      </div>


      {/* Discovery Hub Layout */}
      <div className={styles.readinessSection}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '16px' }}>
          <h3 className={styles.subHeader} style={{ marginBottom: 0 }}>● PRIMARY CONNECTORS</h3>
          
          <div className={styles.filterBar} style={{ borderBottom: 'none', marginBottom: 0, paddingBottom: 0 }}>
            {categories.map(cat => (
              <button 
                key={cat}
                className={`${styles.filterChip} ${activeCategory === cat ? styles.filterChipActive : ''}`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.readinessGrid}>
          {primaryRemaining.map(renderPlatformCard)}
        </div>

        {apiKeyRemaining.length > 0 && (
          <div style={{ marginTop: '48px' }}>
            <h3 className={styles.subHeader} style={{ marginBottom: '24px', opacity: 0.7 }}>● API KEY CONNECTIONS</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '24px', letterSpacing: '0.5px' }}>
              These platforms authenticate via API token — no OAuth flow needed. Configure their keys in your Vercel environment variables.
            </p>
            <div className={styles.readinessGrid} style={{ opacity: 0.85 }}>
              {apiKeyRemaining.map(renderPlatformCard)}
            </div>
          </div>
        )}

        {comingSoonPlatforms.length > 0 && (
          <div style={{ marginTop: '64px' }}>
            <h3 className={styles.subHeader} style={{ marginBottom: '8px', opacity: 0.6 }}>● COMING SOON</h3>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '24px', letterSpacing: '0.5px' }}>
              These integrations are being set up. Check back soon.
            </p>
            <div className={styles.readinessGrid}>
              {comingSoonPlatforms.map(renderComingSoonCard)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
