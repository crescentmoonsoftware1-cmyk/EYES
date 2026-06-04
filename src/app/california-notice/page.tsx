'use client';

import React from 'react';
import Header from '@/components/layout/Header';
import styles from '../settings/settings.module.css';

export default function CaliforniaNoticePage() {
  return (
    <div className={styles.pageRoot}>
      <div className="neural-bg" />
      <div className={styles.headerWrapper}>
        <Header />
      </div>

      <div className={styles.mainWrapper} style={{ marginTop: '80px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ maxWidth: '800px', background: 'var(--bg-secondary)', padding: '40px', borderRadius: '16px', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
          <h1 style={{ color: 'var(--text-primary)', marginBottom: '24px', fontSize: '32px', fontWeight: 800 }}>California Notice at Collection</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '32px' }}>Effective Date: June 3, 2026 | Last Updated: June 3, 2026</p>
          
          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px', fontWeight: 700 }}>1. Statutory Background & Scope</h2>
          <p>This California Notice at Collection (&quot;Notice&quot;) is provided by The EYES pursuant to the California Consumer Privacy Act of 2018, as amended by the California Privacy Rights Act of 2020 (collectively, the &quot;CCPA&quot;). This Notice is directed exclusively to visitors and registered users who reside in the State of California (&quot;Consumers&quot;).</p>
          
          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px', fontWeight: 700 }}>2. Categories of Personal Information We Collect</h2>
          <p>Under the CCPA, &quot;Personal Information&quot; is information that identifies, relates to, describes, or is reasonably capable of being associated with you. We collect the following categories of Personal Information:</p>
          <ul style={{ paddingLeft: '20px', marginTop: '12px', listStyleType: 'disc' }}>
            <li style={{ marginBottom: '8px' }}><strong>Identifiers:</strong> Legal name, primary email address, unique account IDs, Internet Protocol (IP) address, browser cookies, and encrypted OAuth tokens.</li>
            <li style={{ marginBottom: '8px' }}><strong>Commercial Information:</strong> Transaction status, billing ledger logs, and subscription type (credit card transactions are securely isolated and processed by Stripe).</li>
            <li style={{ marginBottom: '8px' }}><strong>Internet or Electronic Network Activity:</strong> Search queries conducted within the neural search interface, system diagnostic flags, connection speed logs, and layout preferences.</li>
            <li style={{ marginBottom: '8px' }}><strong>Professional & Employment-Related Information:</strong> Communication headers, sender/recipient records, document filenames, and metadata from accounts (such as Slack, Google Workspace, GitHub) you choose to sync.</li>
            <li style={{ marginBottom: '8px' }}><strong>Sensitive Personal Information:</strong> Account credentials, passwords, and the text payload contents of your communications. <em>Crucially, we do not utilize these payloads for any purpose other than executing search and reputation audits. Payloads are never shared or sold.</em></li>
          </ul>
          
          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px', fontWeight: 700 }}>3. Business and Commercial Purposes for Use</h2>
          <p>We utilize the collected categories of Personal Information for these specific business purposes:</p>
          <ul style={{ paddingLeft: '20px', marginTop: '12px', listStyleType: 'disc' }}>
            <li style={{ marginBottom: '8px' }}>Operating, upgrading, and delivering your custom digital archive and chat interface.</li>
            <li style={{ marginBottom: '8px' }}>Generating your reputational safety indicators and compiling risk audits.</li>
            <li style={{ marginBottom: '8px' }}>Protecting the system from security breaches, brute-force exploits, and maintaining audit logs.</li>
            <li style={{ marginBottom: '8px' }}>Processing service support queries and troubleshooting integrations.</li>
          </ul>
          
          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px', fontWeight: 700 }}>4. Retention Standards</h2>
          <p>We retain your Personal Information only for the duration of your active subscription and as necessary to comply with security requirements. We determine retention limits based on the volume, sensitivity, and risk profile of the records.</p>
          <p style={{ marginTop: '12px' }}>You have the right to request deletion of your archive at any time. Triggering the <strong>Kill Switch</strong> inside settings initiates an automated database command, permanently purging all vectors, index data, and credentials immediately. This is non-reversible.</p>
          
          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px', fontWeight: 700 }}>5. Sales, Sharing, and Profiling Disclosures</h2>
          <p>The EYES does not sell your Personal Information to data brokers or third parties. We do not share your Personal Information with marketing partners for cross-context behavioral advertising. We do not perform automated profiling or tracking that results in legal or high-impact actions without human review.</p>
          
          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px', fontWeight: 700 }}>6. California Consumer Rights</h2>
          <p>California residents have specific legal rights under the CCPA:</p>
          <ul style={{ paddingLeft: '20px', marginTop: '12px', listStyleType: 'disc' }}>
            <li style={{ marginBottom: '8px' }}><strong>Right to Know & Access:</strong> The right to request disclosure of the categories of personal information collected, the sources, and the specific items stored.</li>
            <li style={{ marginBottom: '8px' }}><strong>Right to Delete:</strong> The right to request that we delete the personal information we have collected from you.</li>
            <li style={{ marginBottom: '8px' }}><strong>Right to Correct:</strong> The right to request correction of inaccurate personal details.</li>
            <li style={{ marginBottom: '8px' }}><strong>Right to Limit Use of Sensitive Personal Information:</strong> The right to limit our processing of sensitive details (such as account credentials and chat payload indexes) only to what is necessary to perform the service.</li>
            <li style={{ marginBottom: '8px' }}><strong>Right to Non-Discrimination:</strong> We will not discriminate against you for exercising your CCPA rights (e.g., by denying services or charging different prices).</li>
          </ul>
          
          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px', fontWeight: 700 }}>7. How to Exercise Your Rights</h2>
          <p>To exercise your Right to Know, Delete, or Correct under California law, you may submit a request by:</p>
          <ul style={{ paddingLeft: '20px', marginTop: '12px', listStyleType: 'disc' }}>
            <li style={{ marginBottom: '8px' }}>Triggering the automated data removal commands in your settings menu (which deletes all data immediately).</li>
            <li style={{ marginBottom: '8px' }}>Submitting an email request directly to our privacy operations office: <strong>privacy@the-eyes.com</strong>.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

