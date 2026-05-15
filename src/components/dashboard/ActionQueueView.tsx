'use client';

import React, { useState, useEffect } from 'react';
import styles from './ActionQueue.module.css'; // New dedicated styles
import { ALL_POSSIBLE_PLATFORMS } from '@/config/platforms';
import { BoltIcon } from '../common/icons/PlatformIcons';

interface ActionItem {
  id: string;
  memoryId: string;
  platform: string;
  title: string;
  description: string;
  suggestedAction: string;
  actionType: string;
  method?: 'POST' | 'PATCH' | 'DELETE';
  confidence: number;
}

interface ActionQueueViewProps {
  onBack: () => void;
}

export function ActionQueueView({ onBack }: ActionQueueViewProps) {
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'priority' | 'meetings'>('all');
  const [logs, setLogs] = useState<string[]>(['INITIALIZING NEURAL LINK...', 'SCANNING GMAIL...', 'CHECKING GITHUB PRs...']);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedAction, setEditedAction] = useState<ActionItem | null>(null);

  useEffect(() => {
    const fetchActions = async () => {
      try {
        const res = await fetch('/api/actions/extract');
        const data = await res.json();
        if (data.actions) {
          setActions(data.actions);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchActions();
    const refreshInterval = setInterval(fetchActions, 30000); // Live update every 30s

    // Rotate dummy logs to make it feel alive
    const logInterval = setInterval(() => {
      const systemLogs = [
        'INDEXING VECTOR SPACE...',
        'CHECKING SLACK CHANNELS...',
        'NEURAL ENGINE IDLE...',
        'SCRAPING DISCOURSE...',
        'COMPILING MEMORY FRAGMENTS...',
        'READY FOR COMMAND'
      ];
      setLogs(prev => [systemLogs[Math.floor(Math.random() * systemLogs.length)], ...prev.slice(0, 4)]);
    }, 4000);

    return () => {
      clearInterval(refreshInterval);
      clearInterval(logInterval);
    };
  }, []);

  const handleApprove = async (action: ActionItem) => {
    const finalAction = editingId === action.id ? editedAction || action : action;
    setProcessingId(action.id);
    try {
      const response = await fetch('/api/actions/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalAction)
      });
      if (response.ok) {
        setActions((prev) => prev.filter(a => a.id !== action.id));
        setEditingId(null);
        setEditedAction(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setProcessingId(null);
    }
  };

  const startEditing = (action: ActionItem) => {
    setEditingId(action.id);
    setEditedAction({ ...action });
  };

  const handleEditChange = (field: keyof ActionItem, value: string) => {
    if (editedAction) {
      setEditedAction({ ...editedAction, [field]: value });
    }
  };

  const handleDismiss = (id: string) => {
    setActions((prev) => prev.filter(a => a.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setEditedAction(null);
    }
  };

  return (
     <div className={styles.queueRoot}>
        <header className={styles.queueHeader}>
           <div className={styles.headerTitleGroup}>
            <h1 className={styles.mainTitle}>Action Command Bridge</h1>
              <p className={styles.subtitle}>Approve autonomous actions discovered across your digital trace.</p>
           </div>
        </header>

        <div className={styles.contentGrid}>
            <main className={styles.actionListContainer}>
               <div className={styles.listHeader}>
                  <span className={styles.countBadge}>{actions.length} PENDING ACTIONS</span>
                  <div className={styles.filterChips}>
                     <button
                       className={activeFilter === 'all' ? styles.chipActive : styles.chip}
                       onClick={() => setActiveFilter('all')}
                     >All</button>
                     <button
                       className={activeFilter === 'priority' ? styles.chipActive : styles.chip}
                       onClick={() => setActiveFilter('priority')}
                     >Priority</button>
                     <button
                       className={activeFilter === 'meetings' ? styles.chipActive : styles.chip}
                       onClick={() => setActiveFilter('meetings')}
                     >Meetings</button>
                  </div>
               </div>

               {(() => {
                 const filtered = actions.filter(a => {
                   if (activeFilter === 'priority') return a.confidence >= 80;
                   if (activeFilter === 'meetings') return a.actionType === 'CALENDAR';
                   return true;
                 });

                 if (loading) return (
                   <div className={styles.loadingBox}>
                    <div className={styles.neuralPulseRing}>
                      <div className={styles.pulseInner} />
                    </div>
                    <span className={styles.loadingTitle}>NEURAL DISCOVERY ACTIVE</span>
                    <p className={styles.loadingDetail}>Extracting intent from your digital trace...</p>
                  </div>
                 );

                 if (filtered.length === 0) return (
                   <div className={styles.emptyCard}>
                     <div className={styles.emptyIcon}><BoltIcon size={48} /></div>
                     <h3>Inbox Zero</h3>
                     <p>{activeFilter !== 'all' ? `No ${activeFilter} actions found.` : 'No actionable items detected in the latest neural scan.'}</p>
                     <button className={styles.refreshBtn} onClick={() => window.location.reload()}>RE-SCAN NOW</button>
                   </div>
                 );

                 return (
                   <div className={styles.cardList}>
                     {filtered.map(action => {
                       const platformObj = ALL_POSSIBLE_PLATFORMS.find(p => p.id === action.platform.toLowerCase());
                       const isProcessing = processingId === action.id;
                       const isEditing = editingId === action.id;
                       const current = isEditing ? editedAction! : action;

                       return (
                         <div key={action.id} className={styles.actionCard}>
                           <div className={styles.cardMain}>
                             <div className={styles.platformIcon}>
                               {platformObj?.icon ? React.cloneElement(platformObj.icon as any, { size: 24 }) : <span>{action.platform[0]}</span>}
                             </div>
                             <div className={styles.cardContent}>
                               <div className={styles.cardHead}>
                                 {isEditing ? (
                                   <input 
                                     className={styles.editTitleInput}
                                     value={current.title}
                                     onChange={(e) => handleEditChange('title', e.target.value)}
                                   />
                                 ) : (
                                   <h4 className={styles.actionTitle}>
                                     {action.method === 'PATCH' && <span className={styles.crudBadge} style={{ color: 'var(--accent-green)' }}>[UPDATE]</span>}
                                     {action.method === 'DELETE' && <span className={styles.crudBadge} style={{ color: 'var(--accent-vital)' }}>[DELETE]</span>}
                                     {action.title}
                                   </h4>
                                 )}
                                 <span className={styles.confidence}>{action.confidence}% CONFIDENCE</span>
                               </div>
                               <p className={styles.actionDesc}>{action.description}</p>
                               <div className={styles.suggestionBox}>
                                 <span className={styles.suggestionLabel}>PROPOSED COMMAND</span>
                                 {isEditing ? (
                                   <textarea 
                                     className={styles.editSuggestionInput}
                                     value={current.suggestedAction}
                                     onChange={(e) => handleEditChange('suggestedAction', e.target.value)}
                                   />
                                 ) : (
                                   <span className={styles.suggestionText}>{action.suggestedAction}</span>
                                 )}
                               </div>
                             </div>
                           </div>
                           <div className={styles.cardFooter}>
                             <button className={styles.approveBtn} onClick={() => handleApprove(action)} disabled={isProcessing}>
                               {isProcessing ? 'EXECUTING...' : isEditing ? 'SAVE & EXECUTE' : 'APPROVE & EXECUTE'}
                             </button>
                             {!isEditing && (
                               <button className={styles.editBtn} onClick={() => startEditing(action)}>EDIT</button>
                             )}
                             <button className={styles.dismissBtn} onClick={() => handleDismiss(action.id)}>DISMISS</button>
                           </div>
                         </div>
                       );
                     })}
                   </div>
                 );
               })()}
            </main>
         </div>
     </div>
  );
}
