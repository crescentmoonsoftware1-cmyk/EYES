"use client";

import React, { useMemo } from 'react';
import { PolicyPageTemplate, SubSectionTitle, Paragraph, UnorderedList, ListItem, Strong } from '../components';

export default function CookiePolicy() {
  const sections = useMemo(() => [
    {
      id: "intro",
      title: "1. Introduction",
      tldr: {
        summary: "This Cookie Policy explains how EYES uses cookies and storage technologies strictly to manage sessions and preferences.",
        badge: "Overview",
        points: ["Privacy-focused storage", "No marketing tracking", "Strictly restricted use"]
      },
      content: (
        <Paragraph>
          This Cookie Policy explains how The EYES (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) uses cookies, pixel tags, local storage, and similar technologies on the-eyes.com to manage security session states and render user interface settings. We are dedicated to providing a private digital sanctum experience, which means our use of storage technologies is highly restricted and privacy-focused.
        </Paragraph>
      )
    },
    {
      id: "what-are-cookies",
      title: "2. What are Cookies and Local Storage?",
      tldr: {
        summary: "Cookies and local storage are standard web tools used to identify your session and persist display layout parameters.",
        badge: "Definition",
        points: ["Cookies secure logins", "Local storage saves choices", "Stored locally on your device"]
      },
      content: (
        <Paragraph>
          Cookies are small text files placed on your computer or mobile device by websites that you visit. Local storage is a standard web technology that allows websites to store data on your computer or mobile device. These tools are used to recognize your browser, remember choices, and secure logins.
        </Paragraph>
      )
    },
    {
      id: "how-we-use",
      title: "3. How We Use Cookies & Storage Technologies",
      tldr: {
        summary: "We divide cookies and local storage tokens into necessary authentication cookies and layout setting keys.",
        badge: "Categories",
        points: ["HTTP-only session tokens", "CSRF protection tokens", "Theme and history cache settings"]
      },
      content: (
        <>
          <Paragraph>
            We only use these technologies to provide our service, protect your account, and remember your visual choices. We categorize our cookies and storage keys into two areas:
          </Paragraph>
          <SubSectionTitle>A. Strictly Necessary & Security Cookies (Authentication)</SubSectionTitle>
          <Paragraph>
            These are required for the security and operation of the platform. Disabling these cookies will prevent you from signing in or retrieving search archive data.
          </Paragraph>
          <UnorderedList>
            <ListItem><Strong>Session Identification:</Strong> Secure HTTP-only cookies (e.g., `eyes-session`, `sb-access-token`, `sb-refresh-token`) set to identify your active session and authorize queries.</ListItem>
            <ListItem><Strong>CSRF Prevention:</Strong> Anti-forgery cookies set to ensure all dashboard updates and settings requests originate from your browser.</ListItem>
          </UnorderedList>

          <SubSectionTitle>B. Functional & Preference Settings (Local Storage)</SubSectionTitle>
          <Paragraph>
            These keys are used to preserve configuration changes you apply to customize the layout. They are stored locally on your device and are never sent to third parties.
          </Paragraph>
          <UnorderedList>
            <ListItem><Strong>Interface Theme:</Strong> The `eyes-theme` and `data-theme` keys stored in local storage to preserve your preference between dark and light modes.</ListItem>
            <ListItem><Strong>Sidebar Layout State:</Strong> Keys stored to remember whether the navigation menu was collapsed or expanded.</ListItem>
            <ListItem><Strong>Chat History Cache:</Strong> The `eyes_chat_history` key to persist recent question structures on your client browser, allowing quick reference.</ListItem>
          </UnorderedList>
        </>
      )
    },
    {
      id: "exclusions",
      title: "4. Absolute Exclusions: Third-Party & Marketing Trackers",
      tldr: {
        summary: "To ensure absolute privacy, EYES utilizes a zero-tracker architecture. No advertising or behavioral analytics are loaded.",
        badge: "No Trackers",
        points: ["No marketing pixels", "No cross-site cookies", "Calculations are server-side only"]
      },
      content: (
        <>
          <Paragraph>
            To preserve your absolute privacy, we maintain a zero-tracker architecture. We do not use:
          </Paragraph>
          <UnorderedList>
            <ListItem>Marketing or remarketing pixels (e.g., Meta Pixel, Google Ads).</ListItem>
            <ListItem>Behavioral tracking scripts or cross-site tracking cookies.</ListItem>
            <ListItem>Third-party analytics trackers that compile user profiling data (such as Google Analytics). All dashboard calculations are performed server-side on your isolated database.</ListItem>
          </UnorderedList>
        </>
      )
    },
    {
      id: "manage",
      title: "5. How to Manage Cookies",
      tldr: {
        summary: "You can restrict cookies through browser settings, though necessary cookies are required to authenticate.",
        badge: "Settings",
        points: ["Restrict via browser", "Clearing cookies logs you out", "Session key required to run app"]
      },
      content: (
        <>
          <Paragraph>
            You can configure your browser to reject all cookies or notify you when a cookie is set. However, since the-eyes.com relies on session cookies to authenticate queries, disabling them will render the dashboard non-functional.
          </Paragraph>
          <Paragraph>
            You can clear all local storage and cookies at any time through your web browser settings. Clearing cookies will immediately terminate your session and return you to the login page.
          </Paragraph>
        </>
      )
    },
    {
      id: "contact",
      title: "6. Contact Information",
      tldr: {
        summary: "Have cookie or local storage inquiries? Send us an email.",
        badge: "Contact",
        points: ["Direct email support", "Privacy inquiries desk", "Fast response times"]
      },
      content: (
        <Paragraph>
          If you have any questions about this Cookie Policy, please contact our team at: <Strong>privacy@the-eyes.com</Strong>.
        </Paragraph>
      )
    }
  ], []);

  return (
    <PolicyPageTemplate 
      title="Cookie Policy" 
      lastUpdated="June 3, 2026" 
      sections={sections} 
    />
  );
}
