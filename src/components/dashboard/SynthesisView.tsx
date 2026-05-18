'use client';

import React from 'react';
import styles from '../MainContent.module.css';
import { 
  SearchIcon, 
  ArrowRightIcon, 
  ShieldIcon 
} from '../common/icons/PlatformIcons';
import { useRouter } from 'next/navigation';
import type { Message } from '@/types/dashboard';

/**
 * Lightweight inline markdown renderer.
 * Converts bold, bullet lists, numbered lists, and line breaks to HTML.
 * No external library needed — safe since content is AI-generated (not user HTML).
 */
function renderMarkdown(text: string): string {
  // Process line-by-line to wrap <li> groups in <ul> without needing the `s` flag
  const lines = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.*?)__/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
    .replace(/^[\*\-•]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')
    .split('\n');

  const result: string[] = [];
  let inList = false;
  for (const line of lines) {
    if (line.startsWith('<li>')) {
      if (!inList) { result.push('<ul style="margin: 6px 0 6px 16px; padding: 0; list-style: disc;">'); inList = true; }
      result.push(line);
    } else {
      if (inList) { result.push('</ul>'); inList = false; }
      result.push(line);
    }
  }
  if (inList) result.push('</ul>');

  return '<p style="margin: 0;">' + result.join('\n').replace(/\n\n/g, '</p><p style="margin: 8px 0;">').replace(/\n/g, '<br />') + '</p>';
}

type ViewMode = 'dashboard' | 'synthesis' | 'audit' | 'timeline' | 'feed' | 'readiness' | 'connectors' | 'history' | 'action-queue';

interface SynthesisViewProps {
  query: string;
  setQuery: (q: string) => void;
  messages: Message[];
  isStreaming: boolean;
  onSubmit: (text: string) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  setView: (v: ViewMode) => void;
  totalMemories: number;
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
}: SynthesisViewProps) {
  const router = useRouter();
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
    <div className={`${styles.heroLayout} ${messages.length > 0 ? styles.chatModeLayout : ''}`}>
      <div className={`${styles.heroContent} ${messages.length > 0 ? styles.heroContentMinimized : ''}`}>
        {messages.length === 0 && (
          <>
            <h1 className={styles.brandDisplayTitle}>The EYES</h1>
            <div className={styles.heroSummary}>
              <div className={styles.shieldIcon}><ShieldIcon size={18} /></div>
              <span>Indexed <strong>{totalMemories.toLocaleString()}</strong> records across your connected sources.</span>
            </div>
          </>
        )}

        {messages.length === 0 && (
          <div className={styles.commandContainer}>
            <div className={styles.commandInputBox}>
              <div className={styles.searchIcon}><SearchIcon /></div>
              <input 
                id="memory-search"
                name="query"
                type="text" 
                className={styles.commandInput}
                placeholder="Search digital memories..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && query.trim()) {
                    onSubmit(query.trim());
                  }
                }}
                disabled={isStreaming}
              />
              <button 
                className={styles.commandSendBtn} 
                onClick={() => {
                  if (query.trim()) {
                    onSubmit(query.trim());
                  }
                }}
                disabled={!query.trim() || isStreaming}
                aria-label="Send query"
              >
                <ArrowRightIcon />
              </button>
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

      {/* Floating Chat Input for Active Conversations */}
      {messages.length > 0 && (
        <div className={styles.chatCommandWrapper}>
          <div className={styles.commandContainer} style={{ maxWidth: '800px', margin: '0 auto', background: 'var(--bg-primary)' }}>
            <div className={styles.commandInputBox} style={{ border: '1px solid var(--border-primary)', boxShadow: 'var(--shadow-lg)' }}>
              <div className={styles.searchIcon}><SearchIcon /></div>
              <input 
                type="text" 
                className={styles.commandInput}
                placeholder="Ask a follow up..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && query.trim()) {
                    onSubmit(query.trim());
                  }
                }}
                disabled={isStreaming}
              />
              <button 
                className={styles.commandSendBtn} 
                onClick={() => {
                  if (query.trim()) {
                    onSubmit(query.trim());
                  }
                }}
                disabled={!query.trim() || isStreaming}
              >
                <ArrowRightIcon />
              </button>
            </div>
          </div>
        </div>
      )}

      {messages.length === 0 && (
        <div className={styles.quickActions}>
           <div className={styles.actionCard} onClick={() => setView('feed')}><span>Memory Feed</span></div>
           <div className={styles.actionCard} onClick={() => setView('timeline')}><span>Time Line</span></div>
           <div className={styles.actionCard} onClick={() => setView('audit')}><span>Audit</span></div>
        </div>
      )}
    </div>
  );
}


