'use client';

import { useState, useEffect } from 'react';
import JSZip from 'jszip';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import styles from './settings.module.css';
import { useAuth } from '@/context/AuthContext';

interface ChatGPTMessagePart {
  message?: {
    author?: { role?: string };
    content?: { parts?: unknown[] };
    create_time?: number;
  };
}

interface ClaudeConversation {
  name?: string;
  uuid?: string;
  created_at?: string;
  chat_messages?: Array<{ sender?: string; text?: string }>;
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

export default function SettingsPage() {
  const { user, updateUser, theme, setGlobalTheme } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'tuning' | 'privacy' | 'security' | 'integrations' | 'theme'>('profile');
  const [riskSensitivity, setRiskSensitivity] = useState('MEDIUM');
  const [syncDepth, setSyncDepth] = useState('balanced');
  const [excludedSenders, setExcludedSenders] = useState<string[]>([]);
  const [gdprConsent, setGdprConsent] = useState(true);
  const [newSender, setNewSender] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [settingsSaved, setSettingsSaved] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // AI Integrations state
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
        
        // Find specifically 'conversations.json' first (standard ChatGPT export name)
        let jsonFile = Object.values(zip.files).find(f => f.name.endsWith('conversations.json') && !f.dir);
        if (!jsonFile) {
          // Fallback to any JSON file in the ZIP archive
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

      // Auto-detect format
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
      
      // Batch sync client-side (batches of 30)
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

      // Re-fetch latest sync status to get precise DB counts and dates
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

    } catch (err) {
      console.error('[Import Error]', err);
      const errMsg = err instanceof Error ? err.message : 'Failed to complete import.';
      setSyncStatus(`Error: ${errMsg}`);
      setSyncProgress(0);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (user?.name) setDisplayName(user.name);
  }, [user]);

  // Load persisted global settings on mount
  useEffect(() => {
    fetch('/api/user/settings')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data) return;
        if (data.riskSensitivity) setRiskSensitivity(data.riskSensitivity);
        if (data.syncDepth) setSyncDepth(data.syncDepth);
        if (data.gdprConsent !== undefined) setGdprConsent(data.gdprConsent);
        if (Array.isArray(data.excludedSenders)) setExcludedSenders(data.excludedSenders);
      })
      .catch(() => {});
  }, []);

  // Load recent manual imports from database on mount
  useEffect(() => {
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
  }, []);

  const handleSaveNeuralSettings = async () => {
    setSettingsSaved(null);
    try {
      const res = await fetch('/api/user/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riskSensitivity, syncDepth, excludedSenders, gdprConsent }),
      });
      if (res.ok) {
        updateUser({ behaviorLoggingConsent: gdprConsent });
      }
      setSettingsSaved(res.ok ? 'Settings saved!' : 'Failed to save.');
    } catch {
      setSettingsSaved('Error saving settings.');
    } finally {
      setTimeout(() => setSettingsSaved(null), 3000);
    }
  };

  const handleUpdateProfile = async () => {
    if (displayName === user?.name) return;
    setIsSaving(true);
    setSaveStatus(null);
    try {
      const result = await updateUser({ name: displayName });
      if (result.success) {
        setSaveStatus('Profile updated successfully!');
      } else {
        setSaveStatus(result.message || 'Failed to update.');
      }
    } catch {
      setSaveStatus('An unexpected error occurred.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    const confirm1 = window.confirm("WARNING: This will permanently delete your account and all associated data. Are you sure?");
    if (!confirm1) return;
    
    const confirm2 = window.prompt("Type 'DELETE' to confirm.");
    if (confirm2 !== "DELETE") return;

    try {
      const res = await fetch('/api/user/delete', { method: 'DELETE' });
      if (res.ok) {
        alert("Account deleted.");
        window.location.href = '/login';
      } else {
        alert("Failed to delete account. Please try again or contact support.");
      }
    } catch {
      alert("Error deleting account.");
    }
  };

  const handleWipeArchive = async () => {
    const confirm = window.prompt("Type 'WIPE' to completely purge all indexed memories. This cannot be undone.");
    if (confirm !== 'WIPE') return;

    try {
      const res = await fetch('/api/user/wipe', { method: 'POST' });
      if (res.ok) {
        alert("Neural Archive successfully purged.");
      } else {
        alert("Failed to purge archive.");
      }
    } catch {
      alert("Error purging archive.");
    }
  };

  return (
    <div className={styles.pageRoot}>
      <div className="neural-bg" />
      <div className="scanline" />
      
      <div className={styles.sidebarWrapper}>
        <Sidebar />
      </div>

      <div className={styles.headerWrapper}>
        <Header />
      </div>

      <div className={styles.mainWrapper}>
        <div className={styles.container}>
          <h1 className={styles.title}>Account Settings</h1>
          <p className={styles.subtitle}>Manage your digital identity and neural interface preferences.</p>

          <div className={styles.contentLayout}>
            {/* Tabs Sidebar */}
            <div className={styles.tabList}>
              <button 
                className={`${styles.tabBtn} ${activeTab === 'profile' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('profile')}
              >
                Profile Details
              </button>
              <button 
                className={`${styles.tabBtn} ${activeTab === 'tuning' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('tuning')}
              >
                Neural Tuning
              </button>
              <button 
                className={`${styles.tabBtn} ${activeTab === 'theme' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('theme')}
              >
                Interface Theme
              </button>
              <button 
                className={`${styles.tabBtn} ${activeTab === 'privacy' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('privacy')}
              >
                Privacy Shields
              </button>
              <button 
                className={`${styles.tabBtn} ${activeTab === 'integrations' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('integrations')}
              >
                AI Integrations
              </button>
              <button 
                className={`${styles.tabBtn} ${activeTab === 'security' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('security')}
              >
                Secure Access
              </button>
            </div>

            {/* Tab Content */}
            <div className={styles.panel}>
              {activeTab === 'profile' && (
                <div className={styles.profileSection}>
                  <div className={styles.fieldGroup}>
                    <label>DISPLAY NAME</label>
                    <input 
                      id="display-name"
                      name="displayName"
                      type="text"
                      autoComplete="name"
                      value={displayName} 
                      onChange={(e) => setDisplayName(e.target.value)}
                      className={styles.input} 
                    />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label>EMAIL ADDRESS</label>
                    <input id="email-display" name="email" type="email" autoComplete="email" value={user?.email || ''} className={styles.input} disabled />
                  </div>
                  
                  {saveStatus && <p className={saveStatus.includes('success') ? styles.successText : styles.errorText}>{saveStatus}</p>}
                  
                  <button 
                    className={styles.saveBtn} 
                    onClick={handleUpdateProfile}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Updating...' : 'Update Profile'}
                  </button>
                </div>
              )}

              {activeTab === 'tuning' && (
                <div className={styles.tuningSection}>
                  <div className={styles.fieldGroup}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label>RISK SENSITIVITY</label>
                      <span className={styles.statBadge}>{riskSensitivity}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', marginTop: '12px', marginBottom: '8px' }}>
                      {['LOW', 'MEDIUM', 'HIGH'].map((level) => (
                        <button
                          key={level}
                          onClick={() => setRiskSensitivity(level)}
                          className={`${styles.levelBtn} ${riskSensitivity === level ? styles.levelBtnActive : ''}`}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                    <p className={styles.fieldDesc}>Adjust how aggressive the neural flagger is in identifying potential risks.</p>
                  </div>

                  <div className={styles.fieldGroup}>
                    <label>SYNC DEPTH</label>
                    <div className={styles.customSelectWrapper}>
                      <div 
                        className={styles.customSelectValue} 
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                      >
                        {syncDepth === 'shallow' ? 'Shallow (Last 30 Days)' : syncDepth === 'balanced' ? 'Balanced (Last 6 Months)' : 'Deep (Full History)'}
                        <span style={{ fontSize: '10px' }}>▼</span>
                      </div>
                      {isDropdownOpen && (
                        <div className={styles.customSelectMenu}>
                          <div className={styles.customOption} onClick={() => { setSyncDepth('shallow'); setIsDropdownOpen(false); }}>Shallow (Last 30 Days)</div>
                          <div className={styles.customOption} onClick={() => { setSyncDepth('balanced'); setIsDropdownOpen(false); }}>Balanced (Last 6 Months)</div>
                          <div className={styles.customOption} onClick={() => { setSyncDepth('deep'); setIsDropdownOpen(false); }}>Deep (Full History)</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {settingsSaved && activeTab === 'tuning' && (
                    <p className={settingsSaved.includes('saved') ? styles.successText : styles.errorText}>{settingsSaved}</p>
                  )}
                  <button className={styles.saveBtn} onClick={handleSaveNeuralSettings}>
                    Save Neural Settings
                  </button>
                </div>
              )}


              {activeTab === 'privacy' && (
                <div className={styles.privacySection}>
                  <div className={styles.fieldGroup}>
                    <label>EXCLUDE SENDERS / DOMAINS</label>
                    <p className={styles.fieldDesc}>These entries will never be indexed or scanned by the neural engine.</p>
                    
                    <div className={styles.listContainer}>
                      {excludedSenders.map(sender => (
                        <div key={sender} className={styles.listItem}>
                          <span>{sender}</span>
                          <button 
                            className={styles.itemRemove}
                            onClick={() => setExcludedSenders(prev => prev.filter(s => s !== sender))}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                      <input
                        id="exclude-sender"
                        name="excludeSender"
                        type="text"
                        autoComplete="off"
                        placeholder="Add email or domain..."
                        value={newSender}
                        onChange={(e) => setNewSender(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newSender && !excludedSenders.includes(newSender)) {
                            setExcludedSenders(prev => [...prev, newSender]);
                            setNewSender('');
                          }
                        }}
                        className={styles.input}
                      />
                      <button
                        className={styles.addBtn}
                        onClick={() => {
                          if (newSender && !excludedSenders.includes(newSender)) {
                            setExcludedSenders(prev => [...prev, newSender]);
                            setNewSender('');
                          }
                        }}
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  <div className={styles.divider} style={{ margin: '32px 0' }} />

                  <div className={styles.fieldGroup}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <label>GDPR DATA COLLECTION (MISTRAL FINE-TUNING)</label>
                        <p className={styles.fieldDesc} style={{ maxWidth: '80%' }}>
                          Allow EYES to anonymously log your AI queries (prompts, completions, latency) to improve future Mistral models. No PII is collected.
                        </p>
                      </div>
                      <div 
                        onClick={() => setGdprConsent(!gdprConsent)}
                        style={{
                          width: '40px',
                          height: '24px',
                          background: gdprConsent ? '#10b981' : 'rgba(255, 255, 255, 0.1)',
                          borderRadius: '12px',
                          position: 'relative',
                          cursor: 'pointer',
                          transition: 'background 0.2s',
                          flexShrink: 0
                        }}
                      >
                        <div style={{
                          width: '18px',
                          height: '18px',
                          background: '#fff',
                          borderRadius: '50%',
                          position: 'absolute',
                          top: '3px',
                          left: gdprConsent ? '19px' : '3px',
                          transition: 'left 0.2s',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                        }} />
                      </div>
                    </div>
                  </div>

                  {settingsSaved && activeTab === 'privacy' && (
                    <p className={settingsSaved.includes('saved') ? styles.successText : styles.errorText}>{settingsSaved}</p>
                  )}
                  <button className={styles.saveBtn} onClick={handleSaveNeuralSettings}>
                    Save Privacy Settings
                  </button>
                </div>
              )}

              {activeTab === 'theme' && (
                <div className={styles.themeSection}>
                  <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 600 }}>Interface Theme</h3>
                  <p className={styles.fieldDesc} style={{ marginBottom: '24px' }}>
                    Select your preferred appearance mode for the EYES dashboard.
                  </p>

                  <div className={styles.themeGrid}>
                    <div 
                      className={`${styles.themeCard} ${theme === 'dark' ? styles.themeActive : ''}`}
                      onClick={() => setGlobalTheme('dark')}
                    >
                      <div className={styles.themePreviewDark} />
                      <span>Dark Mode</span>
                    </div>

                    <div 
                      className={`${styles.themeCard} ${theme === 'light' ? styles.themeActive : ''}`}
                      onClick={() => setGlobalTheme('light')}
                    >
                      <div className={styles.themePreviewLight} />
                      <span>Light Mode</span>
                    </div>

                    <div 
                      className={`${styles.themeCard} ${theme === 'ember' ? styles.themeActive : ''}`}
                      onClick={() => setGlobalTheme('ember')}
                    >
                      <div className={styles.themePreviewEmber} />
                      <span>Ember Mode</span>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'integrations' && (
                <div className={styles.integrationsSection}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Manual Data Export Sync</h3>
                    <span className={styles.betaBadge}>Beta</span>
                  </div>
                  <p className={styles.fieldDesc} style={{ marginBottom: '20px' }}>
                    Upload your conversation history exports from ChatGPT or Claude. EYES will parse these files and instantly add your past conversations to your vault context.
                  </p>

                  <div 
                    className={`${styles.uploadZone} ${dragActive ? styles.uploadZoneDragActive : ''}`}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                  >
                    <input 
                      type="file"
                      id="file-upload"
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
                        <label htmlFor="file-upload" className={styles.browseLabel}>Browse Files</label>
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
                    {recentImports.map((imp, idx) => (
                      <div key={idx} className={styles.importItem}>
                        <div className={styles.importItemInfo}>
                          <h4>{imp.name}</h4>
                          <p>{imp.count.toLocaleString()} nodes added • {imp.date} • Source: {imp.platform}</p>
                        </div>
                        <span className={`${styles.statusPill} ${styles.statusCompleted}`}>
                          {imp.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'security' && (
                <div className={styles.securitySection}>
                  <div className={styles.securityInfo}>
                    <h3>OAuth Connections</h3>
                    <p>Your account is currently secured via GitHub.</p>
                  </div>
                  
                  <div className={styles.divider} style={{ margin: '32px 0' }} />

                  <div className={styles.dangerZone}>
                    <h3>Danger Zone</h3>
                    <p className={styles.fieldDesc}>Actions here are permanent and cannot be undone.</p>
                    
                    <div className={styles.dangerAction}>
                      <div>
                        <strong>Purge Neural Archive</strong>
                        <p>Wipe all indexed memories from all connected platforms.</p>
                      </div>
                      <button 
                        className={styles.dangerBtnOutline}
                        onClick={handleWipeArchive}
                      >
                        Purge All Data
                      </button>
                    </div>

                    <div className={styles.dangerAction} style={{ marginTop: '24px' }}>
                      <div>
                        <strong>Delete Account</strong>
                        <p>Permanently remove your neural identity and all associated data.</p>
                      </div>
                      <button className={styles.dangerBtn} onClick={handleDeleteAccount}>Delete Account</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
