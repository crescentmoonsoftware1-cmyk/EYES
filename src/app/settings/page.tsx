'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import styles from './settings.module.css';
import { useAuth } from '@/context/AuthContext';

export default function SettingsPage() {
  const router = useRouter();
  const { user, updateUser, theme, setGlobalTheme } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'tuning' | 'privacy' | 'security'>('profile');
  const [riskSensitivity, setRiskSensitivity] = useState('MEDIUM');
  const [syncDepth, setSyncDepth] = useState('balanced');
  const [excludedSenders, setExcludedSenders] = useState<string[]>([]);
  const [newSender, setNewSender] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [settingsSaved, setSettingsSaved] = useState<string | null>(null);

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
        if (Array.isArray(data.excludedSenders)) setExcludedSenders(data.excludedSenders);
      })
      .catch(() => {});
  }, []);

  const handleSaveNeuralSettings = async () => {
    setSettingsSaved(null);
    try {
      const res = await fetch('/api/user/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riskSensitivity, syncDepth, excludedSenders }),
      });
      setSettingsSaved(res.ok ? 'Settings saved!' : 'Failed to save.');
    } catch {
      setSettingsSaved('Error saving settings.');
    } finally {
      setTimeout(() => setSettingsSaved(null), 3000);
    }
  };

  const handleUpdateTheme = (newTheme: 'dark' | 'light') => {
    setGlobalTheme(newTheme);
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
    } catch (e) {
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
    } catch (e) {
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
    } catch (e) {
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
                className={`${styles.tabBtn} ${activeTab === 'privacy' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('privacy')}
              >
                Privacy Shields
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
                      type="text" 
                      value={displayName} 
                      onChange={(e) => setDisplayName(e.target.value)}
                      className={styles.input} 
                    />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label>EMAIL ADDRESS</label>
                    <input type="email" value={user?.email || ''} className={styles.input} disabled />
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
                          style={{
                            flex: 1,
                            padding: '12px',
                            background: riskSensitivity === level ? 'var(--text-primary)' : 'var(--bg-secondary)',
                            color: riskSensitivity === level ? 'var(--bg-primary)' : 'var(--text-primary)',
                            border: '1px solid var(--border-primary)',
                            borderRadius: '8px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                    <p className={styles.fieldDesc}>Adjust how aggressive the neural flagger is in identifying potential risks.</p>
                  </div>

                  <div className={styles.fieldGroup}>
                    <label>SYNC DEPTH</label>
                    <select
                      className={styles.select}
                      value={syncDepth}
                      onChange={(e) => setSyncDepth(e.target.value)}
                    >
                      <option value="shallow">Shallow (Last 30 Days)</option>
                      <option value="balanced">Balanced (Last 6 Months)</option>
                      <option value="deep">Deep (Full History)</option>
                    </select>
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
                        type="text"
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

                  {settingsSaved && activeTab === 'privacy' && (
                    <p className={settingsSaved.includes('saved') ? styles.successText : styles.errorText}>{settingsSaved}</p>
                  )}
                  <button className={styles.saveBtn} onClick={handleSaveNeuralSettings}>
                    Save Privacy Settings
                  </button>
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
