'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import LandingPage from '@/components/landing/LandingPage';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import MainContent from '@/components/MainContent';
import styles from './page.module.css';

export default function Home() {
  const { user, isLoading } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSystemBooting, setIsSystemBooting] = useState(true);

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
          fontFamily: "'DM Mono', monospace",
          fontWeight: 600,
          fontSize: '12px',
          letterSpacing: '0.15em',
          marginBottom: '16px',
        }}>
          VERIFYING NEURAL LINK...
        </div>
        <div style={{
          width: '120px',
          height: '1px',
          background: 'rgba(255,255,255,0.06)',
          position: 'relative',
          overflow: 'hidden',
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
    return <LandingPage />;
  }

  // If authenticated, render the Dashboard
  return (
    <div className={styles.pageRoot}>
      <div className="neural-bg" />
      <div className="scanline" />
      {isSystemBooting && (
        <div className={styles.globalBootLoader}>
          <div className={styles.bootText}>
            INITIALIZING EYES NEURAL LINK...
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
      <div className={`${styles.mainWrapper} ${isSystemBooting ? styles.hidden : ''}`}>
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
