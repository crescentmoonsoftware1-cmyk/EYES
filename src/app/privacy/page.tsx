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
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '32px' }}>Effective Date: June 3, 2026 | Last Updated: June 3, 2026</p>
          
          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px', fontWeight: 700 }}>1. Introduction & Scope</h2>
          <p>Welcome to The EYES (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;). We operate the digital memory archiving and reputation diagnostic dashboard at the-eyes.com. This Privacy Policy is a legally binding document that governs your use of our service, outlining how we collect, ingest, index, store, process, and protect your personal information.</p>
          <p style={{ marginTop: '12px' }}>By registering for an account, connecting third-party communication platforms, or executing queries within our semantic search interfaces, you consent to the data practices described herein. If you do not agree with any provision of this Privacy Policy, you must immediately cease using the platform and disconnect your connectors.</p>
          
          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px', fontWeight: 700 }}>2. Information We Collect</h2>
          <p>To construct your Neural Archive and provide semantic lookup tools, we collect several categories of information depending on your dashboard configuration:</p>
          <ul style={{ paddingLeft: '20px', marginTop: '12px', listStyleType: 'disc' }}>
            <li style={{ marginBottom: '8px' }}><strong>Account Identifiers:</strong> Your full name, email address, password hash, and active subscription details provided during user registration.</li>
            <li style={{ marginBottom: '8px' }}><strong>Connector Access Tokens:</strong> Encrypted OAuth 2.0 refresh tokens, client IDs, and authorization tokens necessary to request messages and records from platforms you connect.</li>
            <li style={{ marginBottom: '8px' }}><strong>Communication Payloads & Metadata:</strong> Message text body, subject lines, timestamps, sender/recipient identities, commit logs, pull request metadata, and document headers retrieved from connected platforms (e.g., Slack channels, Google Workspace, GitHub repositories).</li>
            <li style={{ marginBottom: '8px' }}><strong>Internal Query Logs:</strong> Natural language questions, search history, and feedback vectors executed within our dashboard chat interface to retrieve archived memories.</li>
            <li style={{ marginBottom: '8px' }}><strong>Technical Metadata:</strong> IP addresses, browser specifications, user agent information, session timelines, and cookie identifiers collected automatically during your visits.</li>
          </ul>

          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px', fontWeight: 700 }}>3. Purpose of Processing and Legal Bases</h2>
          <p>We process your personal information under the following legal bases and for these specified purposes:</p>
          <ul style={{ paddingLeft: '20px', marginTop: '12px', listStyleType: 'disc' }}>
            <li style={{ marginBottom: '8px' }}><strong>Contractual Performance:</strong> Creating your account, maintaining integrations, executing queries, and delivering your custom reputation audit reports.</li>
            <li style={{ marginBottom: '8px' }}><strong>Consent:</strong> Ingesting and indexing communication history from external platforms through authorization flows controlled fully by you.</li>
            <li style={{ marginBottom: '8px' }}><strong>Legitimate Interest:</strong> Safeguarding the platform from malicious usage, debugging technical errors, optimizing query performance, and maintaining security threat logs.</li>
          </ul>

          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px', fontWeight: 700 }}>4. Data Subprocessors & AI Sharing Limits</h2>
          <p>We do not sell, rent, or lease your personal information or indexed communication logs. To provide the service, we share specific data subsets with selected third-party subprocessors:</p>
          <ul style={{ paddingLeft: '20px', marginTop: '12px', listStyleType: 'disc' }}>
            <li style={{ marginBottom: '8px' }}><strong>Cloud Infrastructure:</strong> Supabase (database hosting) and Vercel (application deployment and edge hosting).</li>
            <li style={{ marginBottom: '8px' }}><strong>Large Language Models (LLMs):</strong> OpenAI, Anthropic, and Google Gemini API endpoints. <em>Crucially, we utilize enterprise-tier API channels with strict zero-data-retention agreements. Your personal data is never retained by these providers and is never used to train public generative models.</em></li>
          </ul>

          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px', fontWeight: 700 }}>5. Data Sovereignty & The Kill Switch</h2>
          <p>We believe in absolute data ownership. You maintain complete control over the lifecycle of your Neural Archive. You have the right to request access to your stored records, request correction of errors, or delete your archive at any time.</p>
          <p style={{ marginTop: '12px' }}>We provide a self-service <strong>Kill Switch</strong> in your settings. Triggering the Kill Switch initiates an immediate, automated cascade deletion across our database clusters. This deletes your user credentials, OAuth access tokens, search logs, index embeddings, and all vector records permanently. This action is instantaneous, non-reversible, and guarantees full deletion.</p>

          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px', fontWeight: 700 }}>6. International Data Transfers</h2>
          <p>Our servers are located primarily in the United States. If you access the service from the European Economic Area (EEA), the United Kingdom, or other regions, your data will be transferred to and processed in the US. We apply Standard Contractual Clauses (SCCs) to ensure equivalent protection levels for your personal data.</p>

          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px', fontWeight: 700 }}>7. Changes to This Privacy Policy</h2>
          <p>We reserves the right to modify this Privacy Policy at any time. When updates are published, we will revise the &quot;Last Updated&quot; date and notify you via a banner on the dashboard or by email if the changes are material. Continued use of the service constitutes acceptance of the updated terms.</p>

          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px', fontWeight: 700 }}>8. Contact Information</h2>
          <p>For inquiries, rights requests, or feedback regarding your personal data privacy, please email our Data Protection Officer at: <strong>privacy@the-eyes.com</strong>.</p>
        </div>
      </div>
    </div>
  );
}


