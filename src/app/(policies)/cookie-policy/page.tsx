import React from 'react';
import { PolicyPageTemplate, Paragraph, UnorderedList, ListItem, Strong } from '../components';

export default function CookiePolicy() {
  const sections = [
    {
      id: "what-are-cookies",
      title: "1. What Are Cookies and Local Storage?",
      tldr: {
        summary: "Cookies and local storage are small text files or records saved in your browser when you visit a site.",
        badge: "Definition",
        points: ["Stored locally in your browser", "Used to remember your preferences", "Can be cleared at any time"]
      },
      content: (
        <>
          <Paragraph>
            Cookies are small text files containing a string of alphanumeric characters that are downloaded to your device when you visit a website. The EYES also utilizes browser local storage (HTML5 storage tokens) to cache UI layout states, session markers, and active filters.
          </Paragraph>
          <Paragraph>
            These technologies allow us to verify your active login status, maintain your security session, and optimize dashboard loading times.
          </Paragraph>
        </>
      )
    },
    {
      id: "essential",
      title: "2. Essential Cookies and Authentication Tokens",
      tldr: {
        summary: "We use essential session tokens to verify your login status and protect against security breaches.",
        badge: "Essential",
        points: ["Required for platform login", "Powered securely by Supabase Auth", "Protects against CSRF attacks"]
      },
      content: (
        <>
          <Paragraph>
            Some cookies and storage keys are strictly necessary for the operation of the-eyes.com. We use:
          </Paragraph>
          <UnorderedList>
            <ListItem>
              <Strong>Authentication Session Tokens:</Strong> Managed securely via Supabase Auth. These tokens verify who you are, keep you signed in as you navigate the dashboard, and auto-expire for your safety.
            </ListItem>
            <ListItem>
              <Strong>Security Tokens:</Strong> Prevent Cross-Site Request Forgery (CSRF) attacks by confirming that requests sent to our API originate from your active browser session.
            </ListItem>
          </UnorderedList>
          <Paragraph>
            Because these are essential to delivering the core services, you cannot opt out of them if you wish to use the EYES dashboard.
          </Paragraph>
        </>
      )
    },
    {
      id: "preferences",
      title: "3. User Preferences Storage",
      tldr: {
        summary: "We use local browser storage to remember layout selections and console output filters.",
        badge: "Preferences",
        points: ["Remembers active sidebar tabs", "Saves grid and view selections", "Cached locally on your computer"]
      },
      content: (
        <>
          <Paragraph>
            To deliver a premium, fluid user experience, we cache your interface state in your browser&apos;s local memory. This includes:
          </Paragraph>
          <UnorderedList>
            <ListItem>Your active tab and selection within the Privacy and Security index panels.</ListItem>
            <ListItem>Collapsible audit log layout states and risk filter settings.</ListItem>
            <ListItem>Device preference configurations (such as reduced motion settings).</ListItem>
          </UnorderedList>
          <Paragraph>
            These records are stored entirely on your local machine and are never sent to our database or third parties.
          </Paragraph>
        </>
      )
    },
    {
      id: "no-marketing",
      title: "4. Zero-Marketing and Telemetry Policy",
      tldr: {
        summary: "EYES does not use marketing pixels, retargeting tags, or third-party behavioral tracker cookies.",
        badge: "Privacy Focus",
        points: ["No third-party ad networks", "Zero tracking pixels", "Purely functional cookies only"]
      },
      content: (
        <Paragraph>
          Aligned with our zero-selling commitment, the-eyes.com does not integrate any third-party behavioral analytics, retargeting tags, or advertising cookies (such as those from Google Ads, Meta/Facebook Pixel, or marketing hubs). We do not track you across the web.
        </Paragraph>
      )
    },
    {
      id: "control",
      title: "5. Controlling Your Browser Settings",
      tldr: {
        summary: "You can clear or block cookies in your browser settings, though logging in will be disabled.",
        badge: "Control",
        points: ["Clear cookies in browser settings", "Block third-party cookies safely", "Log-in requires session cookies"]
      },
      content: (
        <>
          <Paragraph>
            You have the right to block, reject, or delete cookies at any time. You can accomplish this by modifying the privacy settings inside your web browser (e.g., Google Chrome, Safari, Firefox, or Edge).
          </Paragraph>
          <Paragraph>
            Please note that if you disable all cookies, you will not be able to log in or access your digital sanctum archive, as the platform requires authentication cookies to maintain a secure connection.
          </Paragraph>
        </>
      )
    }
  ];

  return (
    <PolicyPageTemplate 
      title="Cookie Policy" 
      lastUpdated="June 3, 2026" 
      sections={sections} 
    />
  );
}

