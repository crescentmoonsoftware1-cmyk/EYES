'use client';

import React from 'react';
import Header from '@/components/layout/Header';
import styles from '../settings/settings.module.css';

export default function TermsOfService() {
  return (
    <div className={styles.pageRoot}>
      <div className="neural-bg" />
      <div className={styles.headerWrapper}>
        <Header />
      </div>

      <div className={styles.mainWrapper} style={{ marginTop: '80px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ maxWidth: '800px', background: 'var(--bg-secondary)', padding: '40px', borderRadius: '16px', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
          <h1 style={{ color: 'var(--text-primary)', marginBottom: '24px', fontSize: '32px', fontWeight: 800 }}>Terms of Service</h1>
          <p>Last Updated: {new Date().toLocaleDateString()}</p>
          <br/>
          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px' }}>1. Acceptance of Terms</h2>
          <p>By accessing and using The EYES (&quot;Service&quot;), you accept and agree to be bound by the terms and provision of this agreement.</p>
          
          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px' }}>2. Description of Service</h2>
          <p>EYES provides a personal intelligence platform that indexes your connected accounts. You are responsible for ensuring you have the legal right to connect any third-party accounts (Google, Slack, etc.) to this service.</p>

          
          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px' }}>3. User Conduct</h2>
          <p>You agree to use the Service only for lawful purposes. You are solely responsible for the security of your account and any data you choose to index.</p>
          
          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px' }}>4. Termination</h2>
          <p>We may terminate or suspend access to our Service immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.</p>
        </div>
      </div>
    </div>
  );
}
