'use client';

import React from 'react';
import styles from '../MainContent.module.css';
import { ALL_POSSIBLE_PLATFORMS } from '@/config/platforms';
import type { FeedItem, PlatformStatus } from '@/types/dashboard';

interface MemoryFeedViewProps {
  onBack: () => void;
  feedEvents: FeedItem[];
  platforms: PlatformStatus[];
  filterPlatform: string;
  setFilterPlatform: (id: string) => void;
}

/** Strip URLs, tracking params, and excessive whitespace from raw content for clean preview */
function cleanContent(raw: string | null | undefined, maxLen = 240): string {
  if (!raw) return '';
  const noUrls = raw
    .replace(/https?:\/\/[^\s)\]>,"']+/g, '') // remove bare URLs
    .replace(/\([^)]{0,8}https?[^)]*\)/g, '')  // remove (https://...) link text
    .replace(/utm_[a-z_]+=\S+/gi, '')           // strip tracking params
    .replace(/\s{2,}/g, ' ')                    // collapse whitespace
    .trim();
  return noUrls.length > maxLen ? noUrls.slice(0, maxLen).trimEnd() + '…' : noUrls;
}

export function MemoryFeedView({ 
  onBack, 
  feedEvents, 
  platforms, 
  filterPlatform, 
  setFilterPlatform 
}: MemoryFeedViewProps) {

  // ── Only show platform tabs that have ACTUAL feed entries ──────────────────
  const activePlatformIds = Array.from(
    new Set(feedEvents.map(e => e.platform.toLowerCase()))
  );

  // Try to resolve a display name: prefer PlatformStatus name, fall back to config, fall back to id
  function platformLabel(id: string): string {
    const fromStatus = platforms.find(p => p.id.toLowerCase() === id);
    if (fromStatus) return fromStatus.name;
    const fromConfig = ALL_POSSIBLE_PLATFORMS.find(p => p.id === id);
    if (fromConfig) return fromConfig.name ?? id;
    return id.charAt(0).toUpperCase() + id.slice(1);
  }

  return (
    <div className={styles.soloView}>
       <div className={styles.viewHeader} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '32px' }}>
          <h1 className={styles.soloTitle} style={{ margin: 0, whiteSpace: 'nowrap' }}>SOURCE FEED</h1>
          
          <div className={styles.filterBar} style={{ margin: 0, padding: 0, borderBottom: 'none', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
             <button 
               className={`${styles.filterChip} ${filterPlatform === 'all' ? styles.filterChipActive : ''}`}
               onClick={() => setFilterPlatform('all')}
             >
                All Activities
             </button>
             {/* Only render tabs for platforms that have actual data in the feed */}
             {activePlatformIds.map(id => (
                <button 
                  key={id}
                  className={`${styles.filterChip} ${filterPlatform === id ? styles.filterChipActive : ''}`}
                  onClick={() => setFilterPlatform(id)}
                >
                   {platformLabel(id)}
                </button>
             ))}
          </div>
       </div>
       
       <div className={styles.feedScrollArea}>
          {feedEvents
            .filter(e => filterPlatform === 'all' || e.platform.toLowerCase() === filterPlatform.toLowerCase())
            .map((e) => {
            const platform = ALL_POSSIBLE_PLATFORMS.find(p => p.id === e.platform.toLowerCase());
            const hasRisk = e.is_flagged || e.flag_severity;
            const preview = cleanContent(e.content);
            
            return (
              <div id={`memory-${e.id}`} key={e.id} className={`${styles.feedEventCard} ${hasRisk ? styles.cardHasRisk : ''}`}>
                 <div className={styles.eventIconWrapper}>
                    {platform?.icon ? React.cloneElement(platform.icon as React.ReactElement<{size?: number}>, { size: 18 }) : <div className={styles.fallbackIcon}>{e.platform[0]}</div>}
                 </div>
                 <div className={styles.eventMain}>
                    <div className={styles.eventMeta}>
                       <div className={styles.metaLeft}>
                         <span className={styles.platformBadge}>{e.platform}</span>
                         <span className={styles.eventTime}>{e.timestamp ? new Date(e.timestamp).toLocaleDateString() : 'Recent'}</span>
                       </div>
                       {hasRisk && (
                         <span className={`${styles.riskTag} ${styles['risk' + (e.flag_severity || 'LIGHT')]}`}>
                           {e.flag_severity || 'FLAGGED'}
                         </span>
                       )}
                    </div>
                    <h3 className={styles.eventTitle}>{e.title || 'Indexed Discovery'}</h3>
                    {preview && <p className={styles.eventBody}>{preview}</p>}
                    {e.flag_reason && (
                      <div className={styles.riskReasonOuter}>
                        <span className={styles.riskReasonLabel}>Reputation Signal:</span>
                        <span className={styles.riskReasonText}>{e.flag_reason}</span>
                      </div>
                    )}
                    <div className={styles.eventFooter}>
                       <span className={styles.categoryTag}>MEMORY INDEX</span>
                       <span className={styles.typeTag}>{e.event_type || 'Event'}</span>
                    </div>
                 </div>
              </div>
            );
          })}
          {feedEvents.length === 0 && (
            <div className={styles.emptyFeed}>
               <div className={styles.emptyIcon}>∅</div>
               <p>Your vault is empty. Connect a platform to begin indexing.</p>
            </div>
          )}
       </div>
    </div>
  );
}

