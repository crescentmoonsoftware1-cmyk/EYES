'use client';

import React from 'react';
import Header from '@/components/layout/Header';
import styles from '../settings/settings.module.css';

export default function AccessibilityDeclaration() {
  return (
    <div className={styles.pageRoot}>
      <div className="neural-bg" />
      <div className={styles.headerWrapper}>
        <Header />
      </div>

      <div className={styles.mainWrapper} style={{ marginTop: '80px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ maxWidth: '800px', background: 'var(--bg-secondary)', padding: '40px', borderRadius: '16px', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
          <h1 style={{ color: 'var(--text-primary)', marginBottom: '24px', fontSize: '32px', fontWeight: 800 }}>Accessibility Declaration</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '32px' }}>Effective Date: June 3, 2026 | Last Updated: June 3, 2026</p>
          
          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px', fontWeight: 700 }}>1. Our Commitment</h2>
          <p>The EYES (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) is committed to ensuring that our digital vault, memory timelines, and chat interfaces are accessible and usable by individuals with disabilities. We believe that everyone has a right to access their own digital footprint with dignity, equality, and independence, and we continually audit our code to meet these standards.</p>
          
          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px', fontWeight: 700 }}>2. Standards & Target Conformance</h2>
          <p>We aim to conform to the Web Content Accessibility Guidelines (WCAG) 2.1 Level AA requirements. These guidelines outline how to make web content more accessible for people with sensory, cognitive, physical, and developmental needs.</p>
          
          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px', fontWeight: 700 }}>3. Technical Specifications & Verified Tools</h2>
          <p>The accessibility of The EYES platform relies on the following technologies working in combination with your specific web browser and assistive devices:</p>
          <ul style={{ paddingLeft: '20px', marginTop: '12px', listStyleType: 'disc' }}>
            <li style={{ marginBottom: '8px' }}>HTML5 semantic markup and document structure.</li>
            <li style={{ marginBottom: '8px' }}>CSS variables and layout definitions.</li>
            <li style={{ marginBottom: '8px' }}>WAI-ARIA (Accessible Rich Internet Applications) attributes for screen reader voice-overs.</li>
          </ul>
          <p style={{ marginTop: '12px' }}>Our dashboard is regularly tested using NVDA (on Windows), VoiceOver (on macOS/iOS), and TalkBack (on Android devices) in combination with popular modern browsers (Google Chrome, Mozilla Firefox, Apple Safari, and Microsoft Edge).</p>

          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px', fontWeight: 700 }}>4. Key Features Implemented</h2>
          <p>To deliver a premium, accessible experience, we have integrated the following architectural features:</p>
          <ul style={{ paddingLeft: '20px', marginTop: '12px', listStyleType: 'disc' }}>
            <li style={{ marginBottom: '8px' }}><strong>Full Keyboard Access:</strong> All buttons, inputs, chat interactions, and settings tab lists are fully focusable and operable using standard keyboard navigation (Tab, Shift+Tab, Enter, Space, and Arrow keys). Focus indicators are designed with high visibility.</li>
            <li style={{ marginBottom: '8px' }}><strong>Color and Contrast:</strong> Text colors are selected to guarantee a contrast ratio of at least 4.5:1 against the background card materials, satisfying WCAG AA visual requirements.</li>
            <li style={{ marginBottom: '8px' }}><strong>Reduced Motion Support:</strong> The EYES respects user operating system choices for reduced motion. Visual features, such as the initial booting console, scanning lines, and slide animations, are automatically disabled or simplified if you have enabled reduced motion settings.</li>
            <li style={{ marginBottom: '8px' }}><strong>Responsive Zoom:</strong> The layout supports zooming up to 200% without truncating details, breaking layouts, or hiding navigation menus.</li>
          </ul>
          
          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px', fontWeight: 700 }}>5. Known Limitations & Ongoing Enhancements</h2>
          <p>While we strive to secure WCAG Level AA conformance across our entire application, some dynamic parts of the reputation audit PDF output documents may experience layout restrictions when rendered at high zoom ratios. We are actively refining our PDF generator to produce fully tagging-compliant PDF/UA structures.</p>
          
          <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', marginTop: '24px', fontWeight: 700 }}>6. Feedback & Escalation</h2>
          <p>If you experience any accessibility barriers while using our platform, please reach out to our accessibility team. We are committed to responding to accessibility inquiries within 48 hours and offering alternatives whenever possible:</p>
          <p style={{ marginTop: '12px' }}>Email: <strong>accessibility@the-eyes.com</strong></p>
        </div>
      </div>
    </div>
  );
}
