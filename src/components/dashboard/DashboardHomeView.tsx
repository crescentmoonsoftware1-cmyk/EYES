'use client';

import React from 'react';
import styles from '../MainContent.module.css';
import { ALL_POSSIBLE_PLATFORMS } from '@/config/platforms';
import type { PlatformStatus } from '@/types/dashboard';
import { AnimatedNumber } from '../common/AnimatedNumber';

interface PlatformConfig {
  id: string;
  name: string;
  color?: string;
  icon?: React.ReactElement;
  description?: string;
  category?: string;
  comingSoon?: boolean;
  apiKeyOnly?: boolean;
}

interface DashboardHomeViewProps {
  platforms: PlatformStatus[];
  syncStatus?: { memoriesIndexed: number; isSyncing: boolean; activeSyncs: string[] } | null;
}

export function DashboardHomeView({ platforms, syncStatus }: DashboardHomeViewProps) {
  const [activeCategory, setActiveCategory] = React.useState<string>('All');
  const [googleInterstitial, setGoogleInterstitial] = React.useState<string | null>(null); // stores startUrl
  const liveStatus = syncStatus ?? null;
  
  const remainingPlatforms = ALL_POSSIBLE_PLATFORMS.filter(p => !platforms.find(ap => ap.id === p.id)?.connected);
  const categories = ['All', 'Productivity', 'Development', 'Social', 'Creative', 'Health'];

  const filteredRemaining = activeCategory === 'All'
    ? remainingPlatforms
    : remainingPlatforms.filter(p => (p as PlatformConfig).category === activeCategory);

  const primaryRemaining   = filteredRemaining.filter(p => !(p as PlatformConfig).comingSoon && !(p as PlatformConfig).apiKeyOnly);
  const apiKeyRemaining    = filteredRemaining.filter(p => !(p as PlatformConfig).comingSoon && (p as PlatformConfig).apiKeyOnly);
  const comingSoonPlatforms = filteredRemaining.filter(p => (p as PlatformConfig).comingSoon);

  const renderPlatformCard = (p: PlatformConfig) => {
    const isApiKey = Boolean(p.apiKeyOnly);

    const startAuth = () => {
      if (isApiKey) {
        alert(`${p.name} connects via an API key configured in your environment — no OAuth flow required. Your key is already active.`);
        return;
      }
      let startUrl = `/api/connect/${p.id}/start`;
      const isGoogle = p.id.startsWith('google') || p.id === 'gmail' || p.id === 'youtube';
      if (isGoogle) {
        startUrl = `/api/connect/google/start?platform=${p.id}`;
        // C7: show pre-consent interstitial before redirecting to Google OAuth
        setGoogleInterstitial(startUrl);
        return;
      }
      window.location.href = startUrl;
    };

    return (
      <div key={p.id} className={`${styles.readinessCard} magnetic-card`} onClick={startAuth} style={{ cursor: 'pointer' }}>
        <div className={styles.cardHeader}>
          <div
            className={styles.readinessIcon}
            style={{
              backgroundColor: p.color?.startsWith('#') ? `${p.color}15` : 'var(--bg-secondary)',
              border: p.color?.startsWith('#') ? `1px solid ${p.color}30` : '1px solid var(--border-subtle)',
            }}
          >
            {p.icon ? React.cloneElement(p.icon, { size: 24 } as React.HTMLAttributes<SVGElement>) : null}
          </div>
          <div className={styles.readinessInfo}>
            <strong>{p.name}</strong>
            <span className={styles.availStatusText}>{isApiKey ? 'API Key' : 'Connect Now'}</span>
          </div>
          {!isApiKey && <span className={styles.addIndicator}>+</span>}
          {isApiKey && <span className={styles.addIndicator} style={{ fontSize: '14px' }}>🔑</span>}
        </div>
        <p className={styles.platformDesc}>{p.description || 'Connect this platform to index more of your life data.'}</p>
      </div>
    );
  };

  const renderComingSoonCard = (p: PlatformConfig) => (
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
          {p.icon ? React.cloneElement(p.icon, { size: 24 } as React.HTMLAttributes<SVGElement>) : null}
        </div>
        <div className={styles.readinessInfo}>
          <strong>{p.name}</strong>
          <span style={{ fontSize: '10px', color: 'var(--text-secondary)', letterSpacing: '1px', fontWeight: 700 }}>UNAVAILABLE</span>
        </div>
      </div>
      <p className={styles.platformDesc} style={{ color: 'var(--text-secondary)' }}>
        {p.description || 'Integration coming soon.'}
      </p>
    </div>
  );


  return (
    <div className={styles.readinessContainer}>

      {/* C7: Google pre-consent interstitial modal */}
      {googleInterstitial && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
        }}>
          <div style={{
            background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)',
            borderRadius: '20px', padding: '32px', maxWidth: '480px', width: '100%',
            boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
          }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
              Before connecting to Google
            </h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: '20px' }}>
              Google may show a notice saying this app is{' '}
              <strong style={{ color: 'var(--text-primary)' }}>"not verified"</strong>{' '}
              — this appears while our OAuth verification is in review with Google (a process that takes days to weeks).
              It does not mean the connection is unsafe.
            </p>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: '28px' }}>
              EYES reads your <strong style={{ color: 'var(--text-primary)' }}>Gmail, Calendar, and Drive</strong> data
              only for indexing into your personal vault. Your OAuth tokens are encrypted at rest and never shared.
              You can disconnect at any time from Source Readiness.
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => { window.location.href = googleInterstitial; }}
                style={{
                  flex: 1, padding: '12px 20px', background: 'var(--text-primary)', color: 'var(--bg-primary)',
                  border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
                }}
              >
                Continue to Google
              </button>
              <button
                onClick={() => setGoogleInterstitial(null)}
                style={{
                  padding: '12px 20px', background: 'transparent', color: 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)', borderRadius: '10px', fontWeight: 600,
                  fontSize: '0.9rem', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* High-Contrast Live Indexing Counter Hero */}
      <div style={{ marginBottom: '32px', paddingBottom: '20px', borderBottom: '1px solid var(--border-subtle)' }}>
        <h1 className={styles.pageHeroTitle} style={{ textAlign: 'left', marginBottom: '16px' }}>Vault</h1>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="stagger-1" style={{ padding: '14px 22px', background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
             <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '2px' }}>Total Memories Indexed</span>
             <div style={{ fontSize: '32px', fontWeight: '900', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', lineHeight: 1 }}>
               {liveStatus ? <AnimatedNumber value={liveStatus.memoriesIndexed} /> : '---'}
             </div>
          </div>
          

        </div>
      </div>


      {/* Discovery Hub Layout */}
      <div className={`${styles.readinessSection} stagger-3`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '16px', flexWrap: 'wrap', gap: '16px' }}>
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
