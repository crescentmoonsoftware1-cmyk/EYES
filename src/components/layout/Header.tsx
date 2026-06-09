'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import styles from './Header.module.css';

export default function Header({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);


  const avatarImageUrl = user?.avatar && user.avatar.length > 2 ? user.avatar : null;
  const avatarInitial = user?.avatar && user.avatar.length <= 2 ? user.avatar : user?.name?.[0] || 'U';

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <button 
          className={styles.menuOpenBtn}
          onClick={onMenuToggle}
          aria-label="Open menu"
        >
          <MenuIcon />
        </button>
        <div className={styles.eyeIcon} onClick={() => router.push('/')} style={{ cursor: 'pointer' }}>
          <EyeIcon />
        </div>
        <h1 className={styles.logoText} onClick={() => router.push('/')} style={{ cursor: 'pointer' }}>EYES</h1>
      </div>

      <div className={styles.right}>
        <div className={styles.userMenuContainer} ref={menuRef}>
          <button 
            className={styles.avatarBtn} 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="User menu"
          >
            <div className={styles.avatar}>
              {avatarImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarImageUrl} alt="User avatar" className={styles.avatarImage} />
              ) : (
                <span className={styles.avatarInitial}>{avatarInitial}</span>
              )}
            </div>
          </button>

          {isMenuOpen && (
            <div className={styles.dropdown}>
              <div className={styles.userInfo}>
                <div className={styles.userName}>{user?.name}</div>
                <div className={styles.userPlan}>{user?.plan || 'PRIVATE BETA'}</div>
              </div>
              
              <div className={styles.divider} />
              
              <button className={styles.menuItem} onClick={() => { setIsMenuOpen(false); router.push('/settings'); }}>
                <SettingsIcon /> Settings
              </button>
              
              <div className={styles.divider} />

              <button 
                className={`${styles.menuItem} ${styles.logoutBtn}`}
                onClick={() => logout()}
              >
                <LogoutIcon /> Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function MenuIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>;
}

function EyeIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>;
}

function SettingsIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1-2.83 0l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>;
}

function LogoutIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
}
