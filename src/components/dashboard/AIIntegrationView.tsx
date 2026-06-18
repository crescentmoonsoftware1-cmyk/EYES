'use client';

import { useState, useEffect } from 'react';
import JSZip from 'jszip';
import styles from './AIIntegrationView.module.css';

interface ClaudeConversation {
  name?: string;
  uuid?: string;
  created_at?: string;
  chat_messages?: Array<{ sender?: string; text?: string }>;
}

interface ChatGPTMessagePart {
  message?: {
    author?: { role?: string };
    content?: { parts?: unknown[] };
    create_time?: number;
  };
}

interface ImportMemoryPayload {
  source_id: string;
  event_type: string;
  title: string;
  content: string;
  author: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

interface AIIntegrationViewProps {
  onBack: () => void;
}

export function AIIntegrationView({ onBack }: AIIntegrationViewProps) {
  const [dragActive, setDragActive] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncStatus, setSyncStatus] = useState('');
  const [recentImports, setRecentImports] = useState<Array<{ name: string; platform: string; count: number; date: string; status: 'Completed' | 'Processing' | 'Error' }>>([]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setUploadedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setUploadedFile(e.target.files[0]);
    }
  };

  const handleStartSync = async () => {
    if (!uploadedFile) return;
    setIsSyncing(true);
    setSyncProgress(0);
    setSyncStatus('Reading upload file...');

    try {
      let rawText = '';
      const fileName = uploadedFile.name;

      if (fileName.endsWith('.zip')) {
        setSyncStatus('Extracting ZIP file...');
        const zip = await JSZip.loadAsync(uploadedFile);
        
        let jsonFile = Object.values(zip.files).find(f => f.name.endsWith('conversations.json') && !f.dir);
        if (!jsonFile) {
          jsonFile = Object.values(zip.files).find(f => f.name.endsWith('.json') && !f.dir);
        }

        if (!jsonFile) {
          throw new Error('No JSON files found inside the ZIP archive.');
        }
        rawText = await jsonFile.async('text');
      } else if (fileName.endsWith('.json')) {
        rawText = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = () => reject(new Error('Failed to read JSON file.'));
          reader.readAsText(uploadedFile);
        });
      } else {
        throw new Error('Unsupported file format. Please upload a .zip or .json file.');
      }

      setSyncStatus('Parsing conversation data...');
      const rawData = JSON.parse(rawText) as unknown[];

      if (!Array.isArray(rawData)) {
        throw new Error('Invalid export format. Expected a JSON array of conversations.');
      }

      let platform = '';
      const memories: ImportMemoryPayload[] = [];

      if (rawData.length > 0 && rawData[0] !== null && typeof rawData[0] === 'object' && ('mapping' in rawData[0] || 'create_time' in rawData[0])) {
        platform = 'chatgpt';
        setSyncStatus('Auto-detected ChatGPT format. Extracting dialogues...');
        
        for (const convo of rawData as Record<string, unknown>[]) {
          const title = (convo.title as string) || 'Untitled Conversation';
          const mapping = convo.mapping as Record<string, ChatGPTMessagePart> | undefined;
          if (!mapping) continue;

          const nodes = Object.values(mapping);
          const messages = nodes
            .filter((node): node is ChatGPTMessagePart & { message: { content: { parts: unknown[] } } } => 
              !!node.message && !!node.message.content && Array.isArray(node.message.content.parts)
            )
            .sort((a, b) => (a.message.create_time || 0) - (b.message.create_time || 0));

          if (messages.length === 0) continue;

          let dialogue = '';
          for (const msg of messages) {
            const role = msg.message.author?.role === 'user' ? 'User' : 'Assistant';
            const text = (msg.message.content.parts || [])
              .filter((part): part is string => typeof part === 'string')
              .join('\n');
            if (!text.trim()) continue;
            dialogue += `${role}: ${text}\n\n`;
          }

          if (!dialogue.trim()) continue;

          const firstMsgTime = messages[0]?.message?.create_time;
          const timestamp = firstMsgTime ? new Date(firstMsgTime * 1000).toISOString() : new Date().toISOString();

          memories.push({
            source_id: (convo.id as string) || (convo.conversation_id as string) || Math.random().toString(36).substring(7),
            event_type: 'chat_session',
            title,
            content: dialogue.trim(),
            author: 'user',
            timestamp,
            metadata: {
              message_count: messages.length,
              imported_at: new Date().toISOString()
            }
          });
        }

      } else if (rawData.length > 0 && rawData[0] !== null && typeof rawData[0] === 'object' && ('chat_messages' in rawData[0] || 'uuid' in rawData[0])) {
        platform = 'claude';
        setSyncStatus('Auto-detected Claude format. Extracting dialogues...');

        for (const convo of rawData as ClaudeConversation[]) {
          const title = convo.name || 'Untitled Conversation';
          const chatMessages = convo.chat_messages || [];
          if (chatMessages.length === 0) continue;

          let dialogue = '';
          for (const msg of chatMessages) {
            const role = msg.sender === 'human' ? 'User' : 'Assistant';
            const text = msg.text || '';
            if (!text.trim()) continue;
            dialogue += `${role}: ${text}\n\n`;
          }

          if (!dialogue.trim()) continue;

          const timestamp = convo.created_at || new Date().toISOString();

          memories.push({
            source_id: convo.uuid || Math.random().toString(36).substring(7),
            event_type: 'chat_session',
            title,
            content: dialogue.trim(),
            author: 'user',
            timestamp,
            metadata: {
              message_count: chatMessages.length,
              imported_at: new Date().toISOString()
            }
          });
        }
      } else {
        throw new Error('Could not identify the conversation export format.');
      }

      if (memories.length === 0) {
        throw new Error('No valid conversations with messages found in the file.');
      }

      setSyncStatus(`Syncing ${memories.length} conversations to your vault...`);
      
      const BATCH_SIZE = 30;
      let insertedCount = 0;

      for (let i = 0; i < memories.length; i += BATCH_SIZE) {
        const batch = memories.slice(i, i + BATCH_SIZE);
        const progress = Math.min(Math.round((i / memories.length) * 100), 98);
        setSyncProgress(progress);
        setSyncStatus(`Syncing conversations ${i + 1} to ${Math.min(i + BATCH_SIZE, memories.length)}...`);

        const res = await fetch('/api/user/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform, memories: batch })
        });

        if (!res.ok) {
          const errData = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(errData.error || 'Server error syncing data');
        }

        const resData = (await res.json()) as { inserted?: number };
        insertedCount += (resData.inserted || 0);
      }

      setSyncProgress(100);
      setSyncStatus(`Sync complete! Successfully imported ${insertedCount} conversations.`);
      setUploadedFile(null);
      
      // Notify other views that a background sync or import was completed
      window.dispatchEvent(new CustomEvent('eyes-realtime-refresh'));

      loadImportsList();

    } catch (err) {
      console.error('[Import Error]', err);
      const errMsg = err instanceof Error ? err.message : 'Failed to complete import.';
      setSyncStatus(`Error: ${errMsg}`);
      setSyncProgress(0);
    } finally {
      setIsSyncing(false);
    }
  };

  const loadImportsList = () => {
    fetch('/api/sync/status')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data || !Array.isArray(data.platforms)) return;
        const manualPlatforms = data.platforms.filter(
          (p: { platform: string }) => p.platform === 'chatgpt' || p.platform === 'claude'
        );
        const mappedImports = manualPlatforms.map((p: { platform: string; total_items?: number; last_sync_at?: string; status?: string }) => ({
          name: p.platform === 'chatgpt' ? 'chatgpt_history' : 'claude_history',
          platform: p.platform === 'chatgpt' ? 'ChatGPT' : 'Claude',
          count: p.total_items || 0,
          date: p.last_sync_at ? new Date(p.last_sync_at).toLocaleDateString() + ' ' + new Date(p.last_sync_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Unknown date',
          status: p.status === 'connected' ? 'Completed' as const : p.status === 'error' ? 'Error' as const : 'Processing' as const
        }));
        setRecentImports(mappedImports);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadImportsList();
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.panel}>
        <div className={styles.integrationsHeader}>
          <h1 className={styles.title}>AI Integration</h1>
          <span className={styles.betaBadge}>Beta</span>
        </div>
        <p className={styles.subtitle}>Upload your conversation history exports from ChatGPT or Claude. EYES will parse these files and instantly add your past conversations to your vault context.</p>

        <div 
          className={`${styles.uploadZone} ${dragActive ? styles.uploadZoneDragActive : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input 
            type="file"
            id="file-upload-dashboard"
            style={{ display: 'none' }}
            accept=".zip,.json"
            onChange={handleFileChange}
            disabled={isSyncing}
          />

          {uploadedFile ? (
            <div className={styles.uploadedFileContainer}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
              <span className={styles.fileName}>{uploadedFile.name}</span>
              <span className={styles.fileSize}>{(uploadedFile.size / 1024 / 1024).toFixed(2)} MB</span>
              
              {!isSyncing && (
                <div className={styles.actionBtnRow}>
                  <button className={styles.saveBtn} onClick={handleStartSync}>Start Syncing</button>
                  <button className={styles.cancelBtn} onClick={() => setUploadedFile(null)}>Cancel</button>
                </div>
              )}
            </div>
          ) : !isSyncing ? (
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '8px' }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              <span className={styles.uploadTitle}>Drag and drop your export file here</span>
              <span className={styles.uploadDesc}>Supports .zip (ChatGPT) or .json (Claude)</span>
              <label htmlFor="file-upload-dashboard" className={styles.browseLabel}>Browse Files</label>
            </div>
          ) : null}

          {isSyncing && (
            <div className={styles.syncProgressContainer}>
              <div className={styles.syncStatusText}>{syncStatus}</div>
              <div className={styles.syncProgressTrack}>
                <div className={styles.syncProgressBar} style={{ width: `${syncProgress}%` }} />
              </div>
            </div>
          )}
        </div>

        <div className={styles.importHeader}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Recent Imports</h3>
        </div>

        <div className={styles.importList}>
          {recentImports.length === 0 ? (
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center', padding: '20px 0' }}>No manual imports completed yet.</p>
          ) : (
            recentImports.map((imp, idx) => (
              <div key={idx} className={styles.importItem}>
                <div className={styles.importItemInfo}>
                  <h4>{imp.name}</h4>
                  <p>{imp.count.toLocaleString()} nodes added • {imp.date} • Source: {imp.platform}</p>
                </div>
                <span className={`${styles.statusPill} ${styles.statusCompleted}`}>
                  {imp.status}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
