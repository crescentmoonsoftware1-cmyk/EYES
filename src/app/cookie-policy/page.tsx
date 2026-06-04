'use client';

import React from 'react';
import Header from '@/components/layout/Header';
import styles from '../settings/settings.module.css';

export default function CookiePolicy() {
  return (
    <div className={styles.pageRoot}>
      <div className="neural-bg" />
      <div className={styles.headerWrapper}>
        <Header />
      </div>

      <div className={styles.mainWrapper} style={{ marginTop: '80px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ maxWidth: '800px', background: 'var(--bg-secondary)', padding: '40px', borderRadius: '16px', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
          <h1 style={{ color: 'var(--text-primary)', marginBottom: '24px', fontSize: '32px', fontWeight: 800 }}>Cookie Policy</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '32px' }}>Effective Date: June 3, 2026 | Last Updated: June 3, 2026</p>
          
          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px', fontWeight: 700 }}>1. Introduction</h2>
          <p>This Cookie Policy explains how The EYES (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) uses cookies, pixel tags, local storage, and similar technologies on the-eyes.com to manage security session states and render user interface settings. We are dedicated to providing a private digital vault experience, which means our use of storage technologies is highly restricted and privacy-focused.</p>
          
          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px', fontWeight: 700 }}>2. What are Cookies and Local Storage?</h2>
          <p>Cookies are small text files placed on your computer or mobile device by websites that you visit. Local storage is a standard web technology that allows websites to store data on your computer or mobile device. These tools are used to recognize your browser, remember choices, and secure logins.</p>
          
          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px', fontWeight: 700 }}>3. How We Use Cookies & Storage Technologies</h2>
          <p>We only use these technologies to provide our service, protect your account, and remember your visual choices. We categorize our cookies and storage keys into two areas:</p>
          
          <h3 style={{ color: 'var(--text-primary)', fontSize: '16px', marginTop: '16px', fontWeight: 600 }}>A. Strictly Necessary & Security Cookies (Authentication)</h3>
          <p>These are required for the security and operation of the platform. Disabling these cookies will prevent you from signing in or retrieving search archive data.</p>
          <ul style={{ paddingLeft: '20px', marginTop: '8px', listStyleType: 'disc' }}>
            <li style={{ marginBottom: '8px' }}><strong>Session Identification:</strong> Secure HTTP-only cookies (e.g., <code>eyes-session</code>, <code>sb-access-token</code>, <code>sb-refresh-token</code>) set to identify your active session and authorize queries.</li>
            <li style={{ marginBottom: '8px' }}><strong>CSRF Prevention:</strong> Anti-forgery cookies set to ensure all dashboard updates and settings requests originate from your browser.</li>
          </ul>

          <h3 style={{ color: 'var(--text-primary)', fontSize: '16px', marginTop: '16px', fontWeight: 600 }}>B. Functional & Preference Settings (Local Storage)</h3>
          <p>These keys are used to preserve configuration changes you apply to customize the layout. They are stored locally on your device and are never sent to third parties.</p>
          <ul style={{ paddingLeft: '20px', marginTop: '8px', listStyleType: 'disc' }}>
            <li style={{ marginBottom: '8px' }}><strong>Interface Theme:</strong> The <code>eyes-theme</code> and <code>data-theme</code> keys stored in local storage to preserve your preference between dark and light modes.</li>
            <li style={{ marginBottom: '8px' }}><strong>Sidebar Layout State:</strong> Keys stored to remember whether the navigation menu was collapsed or expanded.</li>
            <li style={{ marginBottom: '8px' }}><strong>Chat History Cache:</strong> The <code>eyes_chat_history</code> key to persist recent question structures on your client browser, allowing quick reference.</li>
          </ul>
          
          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px', fontWeight: 700 }}>4. Absolute Exclusions: Third-Party & Marketing Trackers</h2>
          <p>To preserve your absolute privacy, we maintain a zero-tracker architecture. We do not use:</p>
          <ul style={{ paddingLeft: '20px', marginTop: '12px', listStyleType: 'disc' }}>
            <li style={{ marginBottom: '8px' }}>Marketing or remarketing pixels (e.g., Meta Pixel, Google Ads).</li>
            <li style={{ marginBottom: '8px' }}>Behavioral tracking scripts or cross-site tracking cookies.</li>
            <li style={{ marginBottom: '8px' }}>Third-party analytics trackers that compile user profiling data (such as Google Analytics). All dashboard calculations are performed server-side on your isolated database.</li>
          </ul>
          
          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px', fontWeight: 700 }}>5. How to Manage Cookies</h2>
          <p>You can configure your browser to reject all cookies or notify you when a cookie is set. However, since the-eyes.com relies on session cookies to authenticate queries, disabling them will render the dashboard non-functional.</p>
          <p style={{ marginTop: '12px' }}>You can clear all local storage and cookies at any time through your web browser settings. Clearing cookies will immediately terminate your session and return you to the login page.</p>

          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px', fontWeight: 700 }}>6. Contact Information</h2>
          <p>If you have any questions about this Cookie Policy, please contact our team at: <strong>privacy@the-eyes.com</strong>.</p>
        </div>
      </div>
    </div>
  );
}

