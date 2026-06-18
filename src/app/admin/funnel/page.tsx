'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

interface FunnelData {
  totalSignups: number;
  totalConnected: number;
  totalCompletedAudits: number;
  stuckBeforeConnecting: number;
  connectedButNeverAudited: number;
  platformBreakdown: Record<string, number>;
  recentActivity: Array<{
    type: 'signup' | 'audit';
    userId: string;
    timestamp: string;
    status?: string;
  }>;
}

type Period = 'all' | '30d' | '7d' | '24h';
type Tab = 'overview' | 'sources' | 'activity' | 'insights';

export default function AdminFunnelPage() {
  const { user, isLoading: authLoading, logout } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('all');
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  // Check if current user is authorized as admin
  const adminEmailsEnv = process.env.NEXT_PUBLIC_ADMIN_EMAILS || '';
  const adminEmails = adminEmailsEnv.split(',')
    .map(email => email.trim().toLowerCase())
    .filter(email => email !== '');
  const isAdmin = user && user.email && adminEmails.length > 0 && adminEmails.includes(user.email.toLowerCase());

  useEffect(() => {
    // If auth is loaded and user is not admin, redirect to dashboard or home
    if (!authLoading && !isAdmin) {
      router.replace('/');
    }
  }, [authLoading, isAdmin, router]);

  const fetchFunnelData = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/funnel?period=${period}`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Failed to load funnel stats: ${response.statusText}`);
      }
      const result = await response.json();
      if (result.success && result.data) {
        setData(result.data);
      } else {
        throw new Error(result.error || 'Unknown error occurred');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage || 'Failed to fetch analytics');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, period]);

  useEffect(() => {
    fetchFunnelData();
  }, [fetchFunnelData]);

  // Format time elapsed
  const formatTime = (isoString: string) => {
    try {
      const past = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - past.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      return `${diffDays}d ago`;
    } catch {
      return '';
    }
  };

  // Convert platform keys to clean titles
  const formatPlatform = (raw: string) => {
    const maps: Record<string, string> = {
      github: 'GitHub',
      gmail: 'Gmail',
      notion: 'Notion',
      discord: 'Discord',
      slack: 'Slack',
      twitter: 'Twitter (X)',
      dropbox: 'Dropbox',
      fitbit: 'Fitbit',
      strava: 'Strava',
      zoom: 'Zoom',
    };
    return maps[raw.toLowerCase()] || raw.charAt(0).toUpperCase() + raw.slice(1);
  };

  // Premium loader
  if (authLoading || (isAdmin && loading && !data)) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loaderTitle}>RETRIEVING FUNNEL METRICS...</div>
        <div className={styles.loaderProgressLine} />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <div className={styles.errorTitle}>ANALYTICS LINK FAILURE</div>
        <div className={styles.errorDesc}>{error}</div>
        <button className={styles.actionBtn} onClick={() => window.location.reload()}>Retry Handshake</button>
      </div>
    );
  }

  // Calculate percentages
  const total = data?.totalSignups || 0;
  const connected = data?.totalConnected || 0;
  const audited = data?.totalCompletedAudits || 0;

  const connectionRate = total > 0 ? Math.round((connected / total) * 100) : 0;
  const auditRate = connected > 0 ? Math.round((audited / connected) * 100) : 0;
  const overallConversion = total > 0 ? Math.round((audited / total) * 100) : 0;

  const connectionDrop = 100 - connectionRate;
  const auditDrop = 100 - auditRate;

  const platformBreakdownList = Object.entries(data?.platformBreakdown || {})
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className={styles.adminRoot}>
      <div className="neural-bg" />
      <div className="scanline" />

      {/* Admin Panel Layout */}
      <div className={styles.adminContainer}>
        
        {/* Left Navigation Sidebar */}
        <aside className={styles.adminSidebar}>
          <div className={styles.sidebarHeader}>
            <span className={styles.brandIcon}>👁️</span>
            <div className={styles.brandInfo}>
              <span className={styles.brandTitle}>THE EYES</span>
              <span className={styles.adminBadge}>ADMIN PANEL</span>
            </div>
          </div>

          <nav className={styles.sidebarNav}>
            <button
              className={`${styles.navItem} ${activeTab === 'overview' ? styles.navItemActive : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              <span className={styles.navIcon}>📊</span> Funnel Overview
            </button>
            <button
              className={`${styles.navItem} ${activeTab === 'sources' ? styles.navItemActive : ''}`}
              onClick={() => setActiveTab('sources')}
            >
              <span className={styles.navIcon}>🔌</span> Connected Sources
            </button>
            <button
              className={`${styles.navItem} ${activeTab === 'activity' ? styles.navItemActive : ''}`}
              onClick={() => setActiveTab('activity')}
            >
              <span className={styles.navIcon}>🔔</span> Cohort Activity
            </button>
            <button
              className={`${styles.navItem} ${activeTab === 'insights' ? styles.navItemActive : ''}`}
              onClick={() => setActiveTab('insights')}
            >
              <span className={styles.navIcon}>💡</span> Optimization Advice
            </button>
          </nav>

          <div className={styles.sidebarFooter}>
            <button className={styles.logoutBtn} onClick={logout}>
              🔒 Logout Session
            </button>
          </div>
        </aside>

        {/* Right Dashboard Area */}
        <div className={styles.adminMain}>
          <header className={styles.header}>
            <div>
              <h2 className={styles.tabTitle}>
                {activeTab === 'overview' && 'Onboarding Funnel Overview'}
                {activeTab === 'sources' && 'Source Connection Distribution'}
                {activeTab === 'activity' && 'Anonymized Cohort Activity Feed'}
                {activeTab === 'insights' && 'Funnel Optimization Insights'}
              </h2>
              <p className={styles.tabSub}>
                {activeTab === 'overview' && 'Analyzing user progression and drop-off rates.'}
                {activeTab === 'sources' && 'Identifying the most linked external platforms.'}
                {activeTab === 'activity' && 'Live activity logs of recent signups and audits.'}
                {activeTab === 'insights' && 'Data-backed recommendations to resolve friction.'}
              </p>
            </div>
            
            <div className={styles.headerRight}>
              <div className={styles.periodSelector}>
                {(['all', '30d', '7d', '24h'] as Period[]).map((p) => (
                  <button
                    key={p}
                    className={`${styles.periodBtn} ${period === p ? styles.periodBtnActive : ''}`}
                    onClick={() => setPeriod(p)}
                  >
                    {p === 'all' ? 'All Time' : p === '30d' ? '30 Days' : p === '7d' ? '7 Days' : '24h'}
                  </button>
                ))}
              </div>
              <div className={styles.statusBadge}>
                <span className={styles.pulseDot} />
                SECURE
              </div>
            </div>
          </header>

          {/* Tab Content Display Area */}
          <div className={styles.tabContent}>
            
            {/* 1. Funnel Overview */}
            {activeTab === 'overview' && (
              <div className={`${styles.contentWrapper} animate-fadeIn`}>
                <section className={styles.funnelCard}>
                  <div className={styles.funnelFlow}>
                    {/* Step 1 */}
                    <div className={styles.funnelStep}>
                      <div className={styles.stepMetrics}>
                        <span className={styles.stepNum}>01</span>
                        <span className={styles.stepLabel}>Registration</span>
                        <span className={styles.stepCount}>{total} Users</span>
                      </div>
                      <div className={styles.progressTrack}>
                        <div className={styles.progressBar} style={{ width: '100%' }}>
                          <span className={styles.barLabel}>100%</span>
                        </div>
                      </div>
                    </div>

                    {/* SVG Connector 1 */}
                    <div className={styles.taperingConnector}>
                      <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={styles.connectorSvg}>
                        <defs>
                          <linearGradient id="taperGrad1" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.2" />
                            <stop offset="100%" stopColor="var(--accent-vital)" stopOpacity="0.2" />
                          </linearGradient>
                        </defs>
                        <path
                          d={`M 0,0 L 100,0 L ${100 - (100 - connectionRate) / 2},30 L ${(100 - connectionRate) / 2},30 Z`}
                          fill="url(#taperGrad1)"
                        />
                      </svg>
                      <span className={styles.dropoffOverlayText}>
                        ⚠️ {data?.stuckBeforeConnecting} stuck here ({connectionDrop}% drop)
                      </span>
                    </div>

                    {/* Step 2 */}
                    <div className={styles.funnelStep}>
                      <div className={styles.stepMetrics}>
                        <span className={styles.stepNum}>02</span>
                        <span className={styles.stepLabel}>Connected Platform</span>
                        <span className={styles.stepCount}>{connected} Users</span>
                      </div>
                      <div className={styles.progressTrack}>
                        <div className={styles.progressBar} style={{ width: `${connectionRate}%`, background: 'var(--accent-vital)' }}>
                          <span className={styles.barLabel}>{connectionRate}%</span>
                        </div>
                      </div>
                    </div>

                    {/* SVG Connector 2 */}
                    <div className={styles.taperingConnector}>
                      <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={styles.connectorSvg}>
                        <defs>
                          <linearGradient id="taperGrad2" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="var(--accent-vital)" stopOpacity="0.2" />
                            <stop offset="100%" stopColor="#00D1FF" stopOpacity="0.2" />
                          </linearGradient>
                        </defs>
                        <path
                          d={`M ${(100 - connectionRate) / 2},0 L ${100 - (100 - connectionRate) / 2},0 L ${100 - (100 - overallConversion) / 2},30 L ${(100 - overallConversion) / 2},30 Z`}
                          fill="url(#taperGrad2)"
                        />
                      </svg>
                      <span className={styles.dropoffOverlayText}>
                        ⚠️ {data?.connectedButNeverAudited} connected but never audited ({auditDrop}% drop)
                      </span>
                    </div>

                    {/* Step 3 */}
                    <div className={styles.funnelStep}>
                      <div className={styles.stepMetrics}>
                        <span className={styles.stepNum}>03</span>
                        <span className={styles.stepLabel}>Completed Audit</span>
                        <span className={styles.stepCount}>{audited} Users</span>
                      </div>
                      <div className={styles.progressTrack}>
                        <div className={styles.progressBar} style={{ width: `${overallConversion}%`, background: '#00D1FF' }}>
                          <span className={styles.barLabel}>{overallConversion}% Overall Conversion</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Summary boxes */}
                <section className={styles.metricsGrid}>
                  <div className={`${styles.statsCard} magnetic-card`}>
                    <div className={styles.statsHeader}>
                      <span className={styles.statsIcon}>👥</span>
                      <span className={styles.statsLabel}>Cohort Signups</span>
                    </div>
                    <div className={styles.statsValue}>{total}</div>
                    <div className={styles.statsDesc}>Registered profiles in current period</div>
                  </div>

                  <div className={`${styles.statsCard} magnetic-card`}>
                    <div className={styles.statsHeader}>
                      <span className={styles.statsIcon}>🔒</span>
                      <span className={styles.statsLabel}>Stuck At Onboarding</span>
                    </div>
                    <div className={styles.statsValue} style={{ color: 'var(--accent-red)' }}>{data?.stuckBeforeConnecting}</div>
                    <div className={styles.statsDesc}>Registered but zero connected platforms</div>
                  </div>

                  <div className={`${styles.statsCard} magnetic-card`}>
                    <div className={styles.statsHeader}>
                      <span className={styles.statsIcon}>⏳</span>
                      <span className={styles.statsLabel}>Connected No-Audit</span>
                    </div>
                    <div className={styles.statsValue} style={{ color: '#E06A3B' }}>{data?.connectedButNeverAudited}</div>
                    <div className={styles.statsDesc}>Connected platform but ran no audits</div>
                  </div>

                  <div className={`${styles.statsCard} magnetic-card`}>
                    <div className={styles.statsHeader}>
                      <span className={styles.statsIcon}>✨</span>
                      <span className={styles.statsLabel}>Active Auditors</span>
                    </div>
                    <div className={styles.statsValue} style={{ color: '#00D1FF' }}>{audited}</div>
                    <div className={styles.statsDesc}>Completed reputation audit successfully</div>
                  </div>
                </section>
              </div>
            )}

            {/* 2. Source Distribution */}
            {activeTab === 'sources' && (
              <div className={`${styles.contentWrapper} animate-fadeIn`}>
                <section className={styles.breakdownCard}>
                  {platformBreakdownList.length === 0 ? (
                    <div className={styles.emptyBreakdown}>No sources connected yet in this period.</div>
                  ) : (
                    <div className={styles.platformList}>
                      {platformBreakdownList.map(([pName, count]) => {
                        const pct = connected > 0 ? Math.round((count / connected) * 100) : 0;
                        return (
                          <div key={pName} className={styles.platformItem}>
                            <div className={styles.platformInfo}>
                              <span className={styles.platformName}>{formatPlatform(pName)}</span>
                              <span className={styles.platformCount}>{count} links ({pct}%)</span>
                            </div>
                            <div className={styles.platformTrack}>
                              <div className={styles.platformBar} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* 3. Activity Feed */}
            {activeTab === 'activity' && (
              <div className={`${styles.contentWrapper} animate-fadeIn`}>
                <section className={styles.activityCard}>
                  {data?.recentActivity && data.recentActivity.length > 0 ? (
                    <div className={styles.activityList}>
                      {data.recentActivity.map((act, idx) => (
                        <div key={idx} className={styles.activityItem}>
                          <div className={styles.activityDotWrapper}>
                            <span className={`${styles.activityDot} ${act.type === 'signup' ? styles.dotSignup : styles.dotAudit}`} />
                            {idx < data.recentActivity.length - 1 && <span className={styles.activityLine} />}
                          </div>
                          <div className={styles.activityDetails}>
                            <span className={styles.activityDesc}>
                              {act.type === 'signup' ? (
                                <>User <code className={styles.userIdHash}>#{act.userId.substring(0, 4)}</code> registered profile.</>
                              ) : (
                                <>User <code className={styles.userIdHash}>#{act.userId.substring(0, 4)}</code> executed Reputation Audit.</>
                              )}
                            </span>
                            <span className={styles.activityTime}>{formatTime(act.timestamp)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.emptyBreakdown}>No recent activity logged in this period.</div>
                  )}
                </section>
              </div>
            )}

            {/* 4. Insights */}
            {activeTab === 'insights' && (
              <div className={`${styles.contentWrapper} animate-fadeIn`}>
                <section className={styles.insightsCard}>
                  <div className={styles.insightsList}>
                    {connectionDrop > 40 && (
                      <div className={styles.insightItem}>
                        <strong>High Onboarding Drop-off ({connectionDrop}%):</strong>
                        <p>A significant portion of signed-up users are not connecting any platform. Consider simplifying the Google OAuth setup, providing quick tooltips explaining why connection is needed, or offering a &quot;Demo Mode&quot; with mock data.</p>
                      </div>
                    )}
                    {auditDrop > 30 && (
                      <div className={styles.insightItem}>
                        <strong>Audit Initiation Friction ({auditDrop}%):</strong>
                        <p>Users are successfully connecting sources but not initiating their first Reputation Audit. Consider adding a clear, prominent &quot;Run Reputation Audit&quot; call-to-action immediately after connection is complete, or automatically queueing a default audit upon connection.</p>
                      </div>
                    )}
                    {connectionDrop <= 40 && auditDrop <= 30 && (
                      <div className={styles.insightItem}>
                        <strong>Funnel Performing Healthy:</strong>
                        <p>Your conversion rates look strong. To scale further, focus on getting more traffic to the sign-up page or offering premium integrations (Slack, Notion, Strava) to increase connected platform diversity.</p>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
