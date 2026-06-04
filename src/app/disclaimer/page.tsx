'use client';

import React from 'react';
import Header from '@/components/layout/Header';
import styles from '../settings/settings.module.css';

export default function DisclaimerPage() {
  return (
    <div className={styles.pageRoot}>
      <div className="neural-bg" />
      <div className={styles.headerWrapper}>
        <Header />
      </div>

      <div className={styles.mainWrapper} style={{ marginTop: '80px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ maxWidth: '800px', background: 'var(--bg-secondary)', padding: '40px', borderRadius: '16px', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
          <h1 style={{ color: 'var(--text-primary)', marginBottom: '24px', fontSize: '32px', fontWeight: 800 }}>Disclaimer</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '32px' }}>Effective Date: June 3, 2026 | Last Updated: June 3, 2026</p>
          
          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px', fontWeight: 700 }}>1. Advisory and Diagnostic Purpose Only</h2>
          <p>The EYES is an AI-driven digital archiving, search, and reputation diagnostic dashboard. All metrics, risk scoring (LIGHT, DIRECT, HEAVY), sentiment alerts, categorization patterns, and summaries provided by the dashboard are diagnostic, advisory, and for personal informational review only.</p>
          <p style={{ marginTop: '12px' }}>No outcome, classification, or recommendation on our dashboard constitutes a legally binding valuation, employment screening decision, background validation report, or official certification of conduct.</p>
          
          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px', fontWeight: 700 }}>2. Exclusion of Professional and Legal Advice</h2>
          <p>The contents of this platform, including AI chatbot feedback, audit reports, and risk queue action items, do not constitute legal advice, employment or human resources (HR) counseling, corporate compliance declarations, or financial advice. You are advised to obtain independent, licensed legal and professional counsel prior to taking any action, implementing hiring actions, or making corporate decisions based on evaluations rendered by the-eyes.com.</p>
          
          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px', fontWeight: 700 }}>3. Dependency on External Platforms and API Integrity</h2>
          <p>The EYES indexes communications history directly from API streams provided by third parties (such as Slack, Google Workspace, GitHub, and Twitter). We cannot control, verify, or guarantee:</p>
          <ul style={{ paddingLeft: '20px', marginTop: '12px', listStyleType: 'disc' }}>
            <li style={{ marginBottom: '8px' }}>The truth, accuracy, or completeness of raw messages retrieved from connected profiles.</li>
            <li style={{ marginBottom: '8px' }}>The constant uptime or availability of external developer APIs. If a third-party platform disables their integration token or experiences database outages, EYES cannot sync recent items.</li>
            <li style={{ marginBottom: '8px' }}>The structural security of platforms external to our immediate hosting environments.</li>
          </ul>

          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px', fontWeight: 700 }}>4. Large Language Model & AI Anomalies</h2>
          <p>Our dashboard indexes, vectorizes, and analyzes natural language queries using advanced deep learning engines. Artificial intelligence processes can occasionally produce false semantic links, miscategorize conversations, or generate inaccurate conclusions (commonly known as AI hallucinations).</p>
          <p style={{ marginTop: '12px' }}>You should cross-reference any flag, risk evaluation, or summarized dialogue with the original text using the citations and date anchors provided by EYES before forming conclusions.</p>
          
          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px', fontWeight: 700 }}>5. Limitation of Liability</h2>
          <p>To the maximum extent permitted by applicable law, in no event shall The EYES or its affiliates, developers, or suppliers be liable for any indirect, punitive, incidental, special, consequential, or exemplary damages, including but not limited to loss of profits, goodwill, data, use, or other intangible losses arising out of or relating to your use of this service.</p>
        </div>
      </div>
    </div>
  );
}

