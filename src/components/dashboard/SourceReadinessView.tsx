'use client';

import React from 'react';
import { useState } from 'react';
import styles from '../MainContent.module.css';
import { ALL_POSSIBLE_PLATFORMS } from '@/config/platforms';
import type { PlatformStatus } from '@/types/dashboard';
import { useConfirm } from '@/context/ConfirmContext';

interface SourceReadinessViewProps {
  platforms: PlatformStatus[];
  totalMemories?: number;
}

function getTimeAgo(dateString?: string | null) {
  if (!dateString) return 'Never';
  const diff = Date.now() - new Date(dateString).getTime();
  if (diff < 0) return 'Just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} mins ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hours ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

function parseErrorMessage(raw?: string | null): string {
  if (!raw) return 'Link Fractured';
  
  let clean = raw;
  // If the error contains JSON after a colon or space, try to parse it
  const jsonMatch = raw.match(/(\{.*\})/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.message) return parsed.message;
      if (parsed.error) return parsed.error;
      if (parsed.type) return parsed.type.replace(/_/g, ' ');
    } catch { /* not JSON */ }
  }

  // Fallback cleanup
  clean = raw.replace(/[{}"]/g, '').trim();
  return clean.length > 65 ? clean.slice(0, 65) + '…' : clean;
}

export function SourceReadinessView({ platforms, totalMemories }: SourceReadinessViewProps) {
  const { openConfirm } = useConfirm();
  const [syncError, setSyncError] = useState<string | null>(null);

  const connectedCount = platforms.filter(p => p.connected).length;
  const connectedList = platforms.filter(p => p.connected);
  const activeSourcesCount = platforms.filter(p => p.connected && (p.items || 0) >= 1).length;
  const availablePlatformsCount = ALL_POSSIBLE_PLATFORMS.filter(p => !p.comingSoon).length;
  const coveragePercent = Math.round((connectedCount / availablePlatformsCount) * 100);

  // True health score: percentage of connected platforms that are not in an 'error' state
  const healthScore = connectedCount === 0 ? 0 : Math.round(((connectedCount - platforms.filter(p => p.status === 'error').length) / connectedCount) * 100);

  const handleDisconnect = (platformId: string, platformName: string) => {
    openConfirm({
      title: `Disconnect ${platformName}?`,
      description: `This removes the active OAuth tokens for ${platformName}. Your indexed memories will remain. You can reconnect anytime.`,
      confirmLabel: 'Disconnect',
      confirmVariant: 'danger',
      onConfirm: async () => {
        const response = await fetch(`/api/data/platform/${platformId}?disconnect=true`, {
          method: 'DELETE',
        });
        if (!response.ok) {
          throw new Error(`Failed to disconnect (${response.status})`);
        }
        window.dispatchEvent(new CustomEvent('eyes-realtime-refresh'));
      },
    });
  };

  const handleForceSync = async (id: string) => {
    setSyncError(null);
    const routePlatform = id === 'google-calendar' ? 'google-calendar' : id.replace(/_/g, '-');
    try {
      const response = await fetch(`/api/sync/${routePlatform}?depth=shallow`, {
        method: 'POST',
      });
      if (response.status === 404) {
        setSyncError(`Manual sync for ${id} is not supported yet.`);
        return;
      }
      if (!response.ok) {
        setSyncError(`Sync failed (${response.status}). Please try again.`);
        return;
      }
      // Refresh AFTER confirmed success
      window.dispatchEvent(new CustomEvent('eyes-realtime-refresh'));
    } catch (error) {
      setSyncError(`Failed to manually sync ${id}.`);
      console.warn('Force sync failed:', error);
    }
  };

  return (
    <div className={styles.readinessContainer}>
      {/* Header with Health Score */}
      <div className={styles.readinessHeader} style={{ alignItems: 'center' }}>
        <div className={styles.readinessTitle}>
          <h1 className={styles.pageHeroTitle} style={{ marginBottom: '4px' }}>Source Readiness</h1>
          <p className={styles.pageHeroSub}>Overview of connected sources and data ingestion status.</p>
        </div>
        <div style={{ textAlign: 'right' }}>
           <div style={{ fontSize: '48px', fontWeight: 900, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{healthScore}%</div>
           <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-secondary)', letterSpacing: '2px' }}>HEALTH SCORE</div>
        </div>
      </div>

      {syncError && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: '10px', padding: '10px 16px', marginBottom: '16px',
          fontSize: '13px', color: '#ef4444',
        }}>
          <span>⚠ {syncError}</span>
          <button onClick={() => setSyncError(null)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>
      )}

      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiMainRow}>
            <span className={styles.kpiLabel}>Active Sources</span>
            <span className={styles.kpiValue}>{activeSourcesCount}</span>
          </div>
          <span className={styles.kpiDesc}>Currently providing data to your memory.</span>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiMainRow}>
            <span className={styles.kpiLabel}>Indexed Coverage</span>
            <span className={styles.kpiValue}>{coveragePercent}%</span>
          </div>
          <span className={styles.kpiDesc}>Connected platforms out of available sources.</span>
        </div>
        <div className={`${styles.kpiCard} ${styles.kpiCardFocus}`}>
          <div className={styles.kpiMainRow}>
            <span className={styles.kpiLabel}>Total Memories</span>
            <span className={styles.kpiValue}>{(totalMemories ?? 0).toLocaleString()}</span>
          </div>
          <span className={styles.kpiDesc}>Total records extracted and processed.</span>
        </div>
      </div>

      {/* Management Grid */}
      <div className={styles.readinessSection}>
        <h3 className={styles.subHeader}>● ACTIVE SOURCES ({activeSourcesCount})</h3>
        
        {connectedList.length === 0 ? (
          <div className={styles.emptyState}>No sources connected. Go to the Connectors Hub to add your first source.</div>
        ) : (
          <div className={styles.readinessGrid}>
            {connectedList.map(p => {
               const isSyncing = p.status === 'syncing';
               const isError = p.status === 'error';
               const config = ALL_POSSIBLE_PLATFORMS.find(ap => ap.id === p.id);
               
               return (
                <div key={p.id} className={`${styles.readinessCard} ${styles.connectedCard} ${isSyncing ? styles.cardSyncing : ''} ${isError ? styles.cardError : ''}`} style={{ cursor: 'default' }}>
                  <div className={styles.cardHeader}>
                    <div 
                      className={styles.readinessIcon}
                      style={{
                        backgroundColor: config?.color?.startsWith('#') ? `${config.color}15` : 'var(--bg-secondary)',
                        border: config?.color?.startsWith('#') ? `1px solid ${config.color}30` : '1px solid var(--border-subtle)',
                      }}
                    >
                      {config?.icon ? React.cloneElement(config.icon, { size: 24 } as React.HTMLAttributes<SVGElement>) : null}
                    </div>
                    <div className={styles.readinessInfo}>
                      <strong>{p.name}</strong>
                      <span 
                        className={isError ? styles.errorStatusText : (isSyncing ? styles.syncStatusText : styles.readyStatusText)}
                        title={p.errorMessage || ''}
                        style={{ 
                          display: '-webkit-box', 
                          WebkitLineClamp: 2, 
                          WebkitBoxOrient: 'vertical', 
                          overflow: 'hidden',
                          wordBreak: 'break-word',
                          lineHeight: '1.4'
                        }}
                      >
                        {isError ? parseErrorMessage(p.errorMessage) : (isSyncing ? 'Syncing...' : 'Connected')}
                      </span>
                    </div>
                    {isSyncing && <div className={styles.syncPulse} />}
                  </div>

                  <div style={{ margin: '12px 0', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '8px' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>LAST SYNC</span>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{getTimeAgo(p.lastSyncAt)}</span>
                     </div>
                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>RECORDS</span>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{p.items || 0}</span>
                     </div>
                  </div>

                  <div className={styles.cardActions} style={{ marginTop: 'auto' }}>
                     <button 
                       className={styles.miniSyncBtn}
                       onClick={() => handleForceSync(p.id)}
                       disabled={isSyncing}
                     >
                       Force Sync
                     </button>
                     <button 
                       className={styles.inlineDisconnectBtn} 
                       onClick={() => handleDisconnect(p.id, p.name)}
                     >
                       Disconnect
                     </button>
                  </div>
                </div>
               );
            })}
          </div>
        )}
      </div>


    </div>
  );
}
