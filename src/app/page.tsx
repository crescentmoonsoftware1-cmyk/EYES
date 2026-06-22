'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import LandingPage from '@/components/landing/LandingPage';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import MainContent from '@/components/MainContent';
import SmoothScroll from '@/components/SmoothScroll';
import styles from './page.module.css';

function HomeInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeView = searchParams.get('view') || 'dashboard';
  const { user, isLoading } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSystemBooting, setIsSystemBooting] = useState(true);

  // Redirect admin users immediately to admin funnel analytics.
  // Uses a server-side API check — admin email is never exposed in the client bundle.
  useEffect(() => {
    if (!isLoading && user) {
      fetch('/api/admin/funnel?period=24h', { method: 'GET' })
        .then(res => { if (res.ok) router.replace('/admin/funnel'); })
        .catch(() => {}); // non-admins get 403, silently ignored
    }
  }, [user, isLoading, router]);

  // Synchronize loading across components
  const handleBootComplete = useCallback(() => {
    // Artificial delay for that premium 'handshake' feel
    setTimeout(() => setIsSystemBooting(false), 200);
  }, []);

  // Show a premium black screen while loading auth session to prevent flashes
  if (isLoading) {
    return (
      <div style={{
        background: '#080808',
        height: '100vh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          color: '#E06A3B',
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: '12px',
          letterSpacing: '0.15em',
          marginBottom: '16px',
        }}>
          Connecting…

        </div>
        <div style={{
          width: '120px',
          height: '1px',
          background: 'rgba(255,255,255,0.06)',
          position: 'relative',
          overflow: 'hidden',
          borderRadius: '2px',
        }}>
          <div style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            width: '40%',
            background: '#E06A3B',
            animation: 'loadingSweep 1.2s infinite ease-in-out',
          }} />
        </div>
        <style>{`
          @keyframes loadingSweep {
            0% { left: -40%; }
            50% { left: 100%; }
            100% { left: 100%; }
          }
        `}</style>
      </div>
    );
  }

  // If not authenticated, render the Landing Page
  if (!user) {
    return (
      <SmoothScroll>
        <LandingPage />
      </SmoothScroll>
    );
  }

  // isAdmin drives the loading screen below; the useEffect above handles the actual redirect.
  // We optimistically show the redirect screen only if the API confirmed admin on a prior render;
  // for first render we fall through to the dashboard which is harmless — the useEffect fires quickly.
  const isAdmin = false; // resolved server-side via /api/admin/funnel check in useEffect

  // Show clean transition screen for admins while redirecting
  if (isAdmin) {
    return (
      <div style={{
        background: '#080808',
        height: '100vh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          color: '#E06A3B',
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: '12px',
          letterSpacing: '0.15em',
          marginBottom: '16px',
        }}>
          ROUTING TO ADMIN CONSOLE...
        </div>
      </div>
    );
  }

  // If authenticated user, render the Dashboard
  return (
    <div className={styles.pageRoot}>
      <div className="neural-bg" />
      <div className="scanline" />
      {isSystemBooting && (
        <div className={styles.globalBootLoader}>
          <div className={styles.bootText}>
            Loading…

          </div>
          <div className={styles.bootProgressLine} />
        </div>
      )}
      <div
        className={`${styles.sidebarWrapper} ${isSystemBooting ? styles.hidden : ''} ${isSidebarOpen ? styles.sidebarVisible : ''}`}
        onClick={() => setIsSidebarOpen(false)}
      >
        <Sidebar />
      </div>
      <div className={`${styles.headerWrapper} ${isSystemBooting ? styles.hidden : ''}`}>
        <Header onMenuToggle={() => setIsSidebarOpen(!isSidebarOpen)} />
      </div>
      <div className={`${styles.mainWrapper} ${isSystemBooting ? styles.hidden : ''} ${activeView === 'audit' ? styles.mainWrapperAudit : ''}`}>
        <MainContent onLoaded={handleBootComplete} />
      </div>

      {isSidebarOpen && (
        <div
          className={styles.mobileOverlay}
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}
