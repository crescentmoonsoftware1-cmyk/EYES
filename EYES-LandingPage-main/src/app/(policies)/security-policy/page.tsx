"use client";

import React, { useMemo } from 'react';
import { PolicyPageTemplate, Paragraph, UnorderedList, ListItem, Strong } from '../components';

export default function SecurityPolicy() {
  const sections = useMemo(() => [
    {
      id: "infrastructure",
      title: "1. Infrastructure & Architecture Security",
      tldr: {
        summary: "Security is built into our core architecture. We enforce strict enterprise configurations to secure synced profiles.",
        badge: "Architecture",
        points: ["Encrypted vector databases", "Isolated customer pipelines", "Strict access reviews"]
      },
      content: (
        <Paragraph>
          Because EYES aggregates, processes, and vectorizes historical chat and email communications, security is the foundation of our software architecture. We manage our platforms under strict enterprise-grade security structures designed to protect customer repositories from unauthorized access, leakage, or exposure.
        </Paragraph>
      )
    },
    {
      id: "encryption",
      title: "2. Cryptographic Encryption Standards",
      tldr: {
        summary: "We utilize TLS 1.3 for in-transit encryption and AES-256 for at-rest storage keys.",
        badge: "Encryption",
        points: ["TLS 1.3 secure transit", "AES-256 database blocks", "Rotated key managers"]
      },
      content: (
        <UnorderedList>
          <ListItem><Strong>Encryption in Transit:</Strong> All data transmitted between user web browsers, EYES dashboard servers, and third-party platform API gateways is encrypted using Transport Layer Security (TLS 1.3) utilizing secure, modern cipher suites (AES-GCM, CHACHA20-POLY1305).</ListItem>
          <ListItem><Strong>Encryption at Rest:</Strong> All databases, message indices, transaction tables, and vector embeddings are encrypted at rest using AES-256 cryptographic standards. Database storage blocks are protected with individual, rotated encryption keys.</ListItem>
        </UnorderedList>
      )
    },
    {
      id: "tokens",
      title: "3. API Token and Credentials Protection",
      tldr: {
        summary: "Third-party platform API tokens are stored using asymmetric key wrapping and isolated from system logs.",
        badge: "API Tokens",
        points: ["Read-only OAuth scopes", "Asymmetric key wrapped tokens", "Isolated from application logs"]
      },
      content: (
        <>
          <Paragraph>
            We retrieve connection information strictly using secure, standardized OAuth 2.0 authorization flows. We follow the principle of least privilege, requesting read-only scopes necessary to compile your digital vault.
          </Paragraph>
          <Paragraph>
            User secrets, including client IDs, refresh tokens, and authentication cookies, are encrypted before being saved in our relational databases using asymmetric key wrapping. Credentials are never sent in plain text and are isolated from normal logging files.
          </Paragraph>
        </>
      )
    },
    {
      id: "kill-switch",
      title: "4. The Data Purge Kill Switch",
      tldr: {
        summary: "Our self-serve Kill Switch triggers immediate, automated database wipes that bypass recycling folders.",
        badge: "Kill Switch",
        points: ["Instant credentials removal", "Wipes messages and vector indices", "Bypasses temporary directories"]
      },
      content: (
        <>
          <Paragraph>
            We respect your absolute sovereignty over personal data. We provide an automated <Strong>Kill Switch</Strong> in the account settings page. Triggering the Kill Switch initiates a cascade database delete that immediately and permanently wipes:
          </Paragraph>
          <UnorderedList>
            <ListItem>Your user identification profile and billing indicators.</ListItem>
            <ListItem>All connected integration tokens, refresh sequences, and credentials.</ListItem>
            <ListItem>All message archives, document headers, vector indices, and search log tables.</ListItem>
          </UnorderedList>
          <Paragraph>
            This deletion bypasses temporary trash folders, directly erasing records from database disks. Deleted records cannot be recovered.
          </Paragraph>
        </>
      )
    },
    {
      id: "vdp",
      title: "5. Vulnerability Disclosure Policy (VDP) & Safe Harbor",
      tldr: {
        summary: "We welcome security reports from independent auditors. Safe harbor is provided for responsible disclosure.",
        badge: "VDP desk",
        points: ["Vulnerability reporting desk", "7-14 days patching windows", "No automated brute-force scans"]
      },
      content: (
        <>
          <Paragraph>
            We welcome security audits and evaluations conducted by independent cybersecurity researchers. We support responsible disclosure, committing to a safe-harbor relationship if you comply with these guidelines:
          </Paragraph>
          <UnorderedList>
            <ListItem>Submit reports of discovered vulnerabilities directly to our security operations desk at <Strong>security@the-eyes.com</Strong>. Include clear replication instructions.</ListItem>
            <ListItem>Avoid performing Denial of Service (DoS) attacks, automated brute-force scans, or accessing records belonging to other users.</ListItem>
            <ListItem>Allow our team a reasonable timeframe (typically 7–14 days) to deploy updates before disclosing vulnerabilities publicly.</ListItem>
          </UnorderedList>
        </>
      )
    }
  ], []);

  return (
    <PolicyPageTemplate 
      title="Security Policy" 
      lastUpdated="June 3, 2026" 
      sections={sections} 
    />
  );
}
