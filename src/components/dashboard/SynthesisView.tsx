'use client';

import React from 'react';
import styles from '../MainContent.module.css';
import { 
  SearchIcon, 
  ArrowRightIcon, 
  ShieldIcon 
} from '../common/icons/PlatformIcons';
import { useRouter } from 'next/navigation';
import { ALL_POSSIBLE_PLATFORMS } from '@/config/platforms';
import type { Message } from '@/types/dashboard';

/**
 * Lightweight inline markdown renderer.
 * Converts bold, bullet lists, numbered lists, and line breaks to HTML.
 * No external library needed — safe since content is AI-generated (not user HTML).
 */
function renderMarkdown(text: string): string {
  return text
    // Bold: **text** or __text__
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.*?)__/g, '<strong>$1</strong>')
    // Italic: *text* or _text_ (only if not double)
    .replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
    // Bullet list lines: lines starting with * or - or •
    .replace(/^[\*\-•]\s+(.+)$/gm, '<li>$1</li>')
    // Numbered list lines: lines starting with 1. 2. etc
    .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')
    // Wrap consecutive <li> blocks in <ul>
    .replace(/(<li>.*<\/li>)/gs, '<ul style="margin: 6px 0 6px 16px; padding: 0; list-style: disc;">$1</ul>')
    // Double newline → paragraph break
    .replace(/\n\n/g, '</p><p style="margin: 8px 0;">')
    // Single newline → line break
    .replace(/\n/g, '<br />')
    // Wrap whole thing in a paragraph
    .replace(/^/, '<p style="margin: 0;">')
    .replace(/$/, '</p>');
}

interface SynthesisViewProps {
  query: string;
  setQuery: (q: string) => void;
  messages: Message[];
  isStreaming: boolean;
  onSubmit: (text: string) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  setView: (v: any) => void;
  totalMemories: number;
  platforms?: any[];
}

export function SynthesisView({
  query,
  setQuery,
  messages,
  isStreaming,
  onSubmit,
  messagesEndRef,
  setView,
  totalMemories,
  platforms = []
}: SynthesisViewProps) {
  const router = useRouter();
  const connected = platforms.filter(p => p.isConnected);
  const [digest, setDigest] = React.useState<string[] | null>(null);
  const [loadingDigest, setLoadingDigest] = React.useState(true);

  React.useEffect(() => {
    fetch('/api/actions/digest')
      .then(res => res.json())
      .then(data => {
        if (data.digest) setDigest(data.digest);
        setLoadingDigest(false);
      })
      .catch(() => setLoadingDigest(false));
  }, []);

  return (
    <div className={styles.heroLayout}>
      <div className={styles.heroContent}>
        {/* Exact Logo from Screenshot */}
        <h1 className={styles.brandDisplayTitle}>The EYES</h1>
        
        <div className={styles.heroSummary}>
          <div className={styles.shieldIcon}><ShieldIcon size={18} /></div>
          <span>Indexed <strong>{totalMemories.toLocaleString()}</strong> records across your connected sources.</span>
        </div>



        <div className={styles.commandContainer}>
          <div className={styles.commandInputBox}>
            <div className={styles.searchIcon}><SearchIcon /></div>
            <input 
              type="text" 
              className={styles.commandInput}
              placeholder="Search digital memories..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && query.trim()) {
                  router.push(`/chat?q=${encodeURIComponent(query.trim())}`);
                }
              }}
              disabled={isStreaming}
            />
            <button 
              className={styles.commandSendBtn} 
              onClick={() => {
                if (query.trim()) {
                  router.push(`/chat?q=${encodeURIComponent(query.trim())}`);
                }
              }}
              disabled={!query.trim() || isStreaming}
              aria-label="Send query"
            >
              <ArrowRightIcon />
            </button>
          </div>
        </div>

        {/* Dynamic Connected Pills */}
        {connected.length > 0 && (
          <div className={styles.connectedRow}>
            <span className={styles.connectedLabel}>CONNECTED</span>
            <div className={styles.connectedPills}>
              {connected.map(p => {
                const config = ALL_POSSIBLE_PLATFORMS.find(ap => ap.id === p.id);
                // Simple heuristic: if sync_progress is 100, we assume it's healthy, else it might be degraded/syncing
                const isHealthy = p.sync_progress === 100;
                
                return (
                  <div key={p.id} className={styles.miniConnectionPill} onClick={() => setView('readiness')} style={{ cursor: 'pointer' }} title={isHealthy ? 'Connection Healthy' : 'Action Required / Syncing'}>
                    <div className={`${styles.statusDot} ${isHealthy ? styles.statusDotHealthy : styles.statusDotDegraded}`} />
                    {config?.icon ? React.cloneElement(config.icon as React.ReactElement<any>, { size: 16 }) : null}
                    <span style={{ textTransform: 'capitalize' }}>{p.id.replace('-', ' ')}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {messages.length > 0 && (
        <div className={styles.chatOutput}>
           {messages.map((m, i) => (
             <div key={i} className={`${styles.chatMessage} ${m.role === 'user' ? styles.userMsg : styles.aiMsg}`}>
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

             </div>
           ))}
           <div ref={messagesEndRef} />
        </div>
      )}

      <div className={styles.quickActions}>
         <div className={styles.actionCard} onClick={() => setView('feed')}><span>Memory Feed</span></div>
         <div className={styles.actionCard} onClick={() => setView('timeline')}><span>Time Line</span></div>
         <div className={styles.actionCard} onClick={() => setView('audit')}><span>Audit</span></div>
      </div>
    </div>
  );
}
