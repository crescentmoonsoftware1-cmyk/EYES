'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import styles from '../MainContent.module.css';
import { ALL_POSSIBLE_PLATFORMS } from '@/config/platforms';
import type { FeedItem, PlatformStatus } from '@/types/dashboard';

interface MemoryFeedViewProps {
  onBack: () => void;
  platforms: PlatformStatus[];
  filterPlatform: string;
  setFilterPlatform: (id: string) => void;
  // feedEvents prop kept for backward compatibility but no longer used for rendering
  feedEvents?: FeedItem[];
}

/** Strip URLs, tracking params, and excessive whitespace from raw content for clean preview */
function cleanContent(raw: string | null | undefined, maxLen = 240): string {
  if (!raw) return '';
  const noUrls = raw
    .replace(/https?:\/\/[^\s)\]>,"']+/g, '')
    .replace(/\([^)]{0,8}https?[^)]*\)/g, '')
    .replace(/utm_[a-z_]+=\S+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return noUrls.length > maxLen ? noUrls.slice(0, maxLen).trimEnd() + '…' : noUrls;
}

export function MemoryFeedView({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onBack,
  platforms,
  filterPlatform,
  setFilterPlatform,
}: MemoryFeedViewProps) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [activePlatformIds, setActivePlatformIds] = useState<string[]>([]);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // ── Fetch a page of memories ────────────────────────────────────────────────
  const fetchPage = useCallback(async (cursor: string | null, platform: string, replace: boolean) => {
    try {
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);
      if (platform && platform !== 'all') params.set('platform', platform);

      const res = await fetch(`/api/memories?${params.toString()}`);
      if (!res.ok) return;

      const data = await res.json();
      const newItems: FeedItem[] = data.items ?? [];
      const nc: string | null = data.nextCursor ?? null;

      setItems(prev => replace ? newItems : [...prev, ...newItems]);
      setNextCursor(nc);
      setHasMore(nc !== null);

      // Collect platform ids that have actual data (from all loaded items)
      if (replace) {
        setActivePlatformIds(Array.from(new Set(newItems.map((e: FeedItem) => e.platform.toLowerCase()))));
      } else {
        setActivePlatformIds(prev =>
          Array.from(new Set([...prev, ...newItems.map((e: FeedItem) => e.platform.toLowerCase())]))
        );
      }
    } catch (err) {
      console.error('[MemoryFeedView] fetch error:', err);
    }
  }, []);

  // ── Re-fetch from top when filter changes ──────────────────────────────────
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setItems([]);
    setNextCursor(null);
    setHasMore(true);
    fetchPage(null, filterPlatform, true).finally(() => setLoading(false));
  }, [filterPlatform, fetchPage]);

  // ── IntersectionObserver — triggers next page on scroll to bottom ──────────
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loadingMore) {
          setLoadingMore(true);
          fetchPage(nextCursor, filterPlatform, false).finally(() => setLoadingMore(false));
        }
      },
      { threshold: 0.1, rootMargin: '200px' }
    );

    if (sentinelRef.current) observerRef.current.observe(sentinelRef.current);

    return () => observerRef.current?.disconnect();
  }, [nextCursor, hasMore, loadingMore, filterPlatform, fetchPage]);

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
        {/* Loading skeleton — first page */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px 0' }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton" style={{
                height: '80px', borderRadius: '12px',
                background: 'rgba(255,255,255,0.04)',
                animation: 'pulse 1.5s ease-in-out infinite',
                animationDelay: `${i * 0.1}s`,
              }} />
            ))}
          </div>
        )}

        {/* Feed items */}
        {!loading && items.map((e) => {
          const platform = ALL_POSSIBLE_PLATFORMS.find(p => p.id === e.platform.toLowerCase());
          const hasRisk = e.is_flagged || e.flag_severity;
          const preview = cleanContent(e.content);

          return (
            <div id={`memory-${e.id}`} key={e.id} className={`${styles.feedEventCard} ${hasRisk ? styles.cardHasRisk : ''}`}>
              <div className={styles.eventIconWrapper}>
                {platform?.icon
                  ? React.cloneElement(platform.icon as React.ReactElement<{ size?: number }>, { size: 18 })
                  : <div className={styles.fallbackIcon}>{e.platform[0]}</div>
                }
              </div>
              <div className={styles.eventMain}>
                <div className={styles.eventMeta}>
                  <div className={styles.metaLeft}>
                    <span className={styles.platformBadge}>{e.platform}</span>
                    <span className={styles.eventTime}>
                      {e.timestamp ? new Date(e.timestamp).toLocaleDateString() : 'Recent'}
                    </span>
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

        {/* Empty state */}
        {!loading && items.length === 0 && (
          <div className={styles.emptyFeed}>
            <div className={styles.emptyIcon}>∅</div>
            <p>Your vault is empty. Connect a platform to begin indexing.</p>
          </div>
        )}

        {/* Sentinel div — IntersectionObserver watches this */}
        <div ref={sentinelRef} style={{ height: '1px' }} />

        {/* Loading more indicator */}
        {loadingMore && (
          <div style={{ textAlign: 'center', padding: '20px 0', fontSize: '12px', color: 'var(--text-secondary)', letterSpacing: '1px' }}>
            LOADING MORE…
          </div>
        )}

        {/* End of feed */}
        {!loading && !hasMore && items.length > 0 && (
          <div style={{ textAlign: 'center', padding: '24px 0', fontSize: '11px', color: 'var(--text-secondary)', opacity: 0.5, letterSpacing: '2px' }}>
            ── END OF FEED · {items.length} RECORDS ──
          </div>
        )}
      </div>
    </div>
  );
}
