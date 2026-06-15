'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import styles from './Header.module.css';
import EyesLogo from '../common/EyesLogo';

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
        <div className={styles.mobileLogo} onClick={() => router.push('/')} style={{ cursor: 'pointer' }}>
          <EyesLogo width={82} height={20} />
        </div>
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
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>;
}

function LogoutIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
}
