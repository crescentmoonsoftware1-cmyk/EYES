'use client';

import React from 'react';
import Header from '@/components/layout/Header';
import styles from '../settings/settings.module.css';

export default function SecurityPolicy() {
  return (
    <div className={styles.pageRoot}>
      <div className="neural-bg" />
      <div className={styles.headerWrapper}>
        <Header />
      </div>

      <div className={styles.mainWrapper} style={{ marginTop: '80px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ maxWidth: '800px', background: 'var(--bg-secondary)', padding: '40px', borderRadius: '16px', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
          <h1 style={{ color: 'var(--text-primary)', marginBottom: '24px', fontSize: '32px', fontWeight: 800 }}>Security Policy</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '32px' }}>Effective Date: June 3, 2026 | Last Updated: June 3, 2026</p>
          
          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px', fontWeight: 700 }}>1. Infrastructure & Architecture Security</h2>
          <p>Because EYES aggregates, processes, and vectorizes historical chat and email communications, security is the foundation of our software architecture. We manage our platforms under strict enterprise-grade security structures designed to protect customer repositories from unauthorized access, leakage, or exposure.</p>
          
          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px', fontWeight: 700 }}>2. Cryptographic Encryption Standards</h2>
          <ul style={{ paddingLeft: '20px', marginTop: '12px', listStyleType: 'disc' }}>
            <li style={{ marginBottom: '8px' }}><strong>Encryption in Transit:</strong> All data transmitted between user web browsers, EYES dashboard servers, and third-party platform API gateways is encrypted using Transport Layer Security (TLS 1.3) utilizing secure, modern cipher suites (AES-GCM, CHACHA20-POLY1305).</li>
            <li style={{ marginBottom: '8px' }}><strong>Encryption at Rest:</strong> All databases, message indices, transaction tables, and vector embeddings are encrypted at rest using AES-256 cryptographic standards. Database storage blocks are protected with individual, rotated encryption keys.</li>
          </ul>
          
          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px', fontWeight: 700 }}>3. API Token and Credentials Protection</h2>
          <p>We retrieve connection information strictly using secure, standardized OAuth 2.0 authorization flows. We follow the principle of least privilege, requesting read-only scopes necessary to compile your digital vault.</p>
          <p style={{ marginTop: '12px' }}>User secrets, including client IDs, refresh tokens, and authentication cookies, are encrypted before being saved in our relational databases using asymmetric key wrapping. Credentials are never sent in plain text and are isolated from normal logging files.</p>
          
          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px', fontWeight: 700 }}>4. The Data Purge Kill Switch</h2>
          <p>We respect your absolute sovereignty over personal data. We provide an automated <strong>Kill Switch</strong> in the account settings page. Triggering the Kill Switch initiates a cascade database delete that immediately and permanently wipes:</p>
          <ul style={{ paddingLeft: '20px', marginTop: '12px', listStyleType: 'disc' }}>
            <li style={{ marginBottom: '8px' }}>Your user identification profile and billing indicators.</li>
            <li style={{ marginBottom: '8px' }}>All connected integration tokens, refresh sequences, and credentials.</li>
            <li style={{ marginBottom: '8px' }}>All message archives, document headers, vector indices, and search log tables.</li>
          </ul>
          <p style={{ marginTop: '12px' }}>This deletion bypasses temporary trash folders, directly erasing records from database disks. Deleted records cannot be recovered.</p>
          
          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px', fontWeight: 700 }}>5. Vulnerability Disclosure Policy (VDP) & Safe Harbor</h2>
          <p>We welcome security audits and evaluations conducted by independent cybersecurity researchers. We support responsible disclosure, committing to a safe-harbor relationship if you comply with these guidelines:</p>
          <ul style={{ paddingLeft: '20px', marginTop: '12px', listStyleType: 'disc' }}>
            <li style={{ marginBottom: '8px' }}>Submit reports of discovered vulnerabilities directly to our security operations desk at <strong>security@the-eyes.com</strong>. Include clear replication instructions.</li>
            <li style={{ marginBottom: '8px' }}>Avoid performing Denial of Service (DoS) attacks, automated brute-force scans, or accessing records belonging to other users.</li>
            <li style={{ marginBottom: '8px' }}>Allow our team a reasonable timeframe (typically 7–14 days) to deploy updates before disclosing vulnerabilities publicly.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

