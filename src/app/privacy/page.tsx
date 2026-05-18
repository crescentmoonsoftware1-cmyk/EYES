'use client';

import React from 'react';
import Header from '@/components/layout/Header';
import styles from '../settings/settings.module.css';

export default function PrivacyPolicy() {
  return (
    <div className={styles.pageRoot}>
      <div className="neural-bg" />
      <div className={styles.headerWrapper}>
        <Header />
      </div>

      <div className={styles.mainWrapper} style={{ marginTop: '80px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ maxWidth: '800px', background: 'var(--bg-secondary)', padding: '40px', borderRadius: '16px', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
          <h1 style={{ color: 'var(--text-primary)', marginBottom: '24px', fontSize: '32px', fontWeight: 800 }}>Privacy Policy</h1>
          <p>Last Updated: {new Date().toLocaleDateString()}</p>
          <br/>
          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px' }}>1. Introduction</h2>
          <p>The EYES (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) is committed to protecting your privacy. This Privacy Policy explains how your personal data is collected, used, and protected.</p>
          
          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px' }}>2. Data Collection and Usage</h2>
          <p>We connect to third-party services (e.g., Google, Slack) strictly at your explicit request to construct your personal Neural Archive. We only process data required to provide the search and memory retrieval services.</p>
          
          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px' }}>3. Data Retention and Deletion</h2>
          <p>You have full sovereignty over your data. Using the &quot;Kill Switch&quot; in your account settings will permanently purge all indexed data and OAuth tokens from our servers immediately.</p>
          
          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px' }}>4. Third-Party AI Models</h2>
          <p>We use state-of-the-art LLMs (e.g., OpenAI, Anthropic) to process your queries. We guarantee that your personal data is NEVER used by these providers to train their public models.</p>
        </div>
      </div>
    </div>
  );
}
