"use client";

import React, { useMemo } from 'react';
import { PolicyPageTemplate, Paragraph, UnorderedList, ListItem, Strong } from '../components';

export default function CaliforniaNotice() {
  const sections = useMemo(() => [
    {
      id: "scope",
      title: "1. Statutory Background & Scope",
      tldr: {
        summary: "This California Notice at Collection (Notice) is directed exclusively to Consumers residing in the State of California.",
        badge: "Overview",
        points: ["Under CCPA guidelines", "Applies to CA residents", "Meets CPRA criteria"]
      },
      content: (
        <Paragraph>
          This California Notice at Collection (&ldquo;Notice&rdquo;) is provided by The EYES pursuant to the California Consumer Privacy Act of 2018, as amended by the California Privacy Rights Act of 2020 (collectively, the &ldquo;CCPA&rdquo;). This Notice is directed exclusively to visitors and registered users who reside in the State of California (&ldquo;Consumers&rdquo;).
        </Paragraph>
      )
    },
    {
      id: "categories",
      title: "2. Categories of Personal Information We Collect",
      tldr: {
        summary: "Under the CCPA, we collect identifiers, activity logs, platform metadata, and secure credentials.",
        badge: "Categories",
        points: ["Collect IP and cookies", "Access tokens for connectors", "Encrypted credentials payload"]
      },
      content: (
        <>
          <Paragraph>
            Under the CCPA, &ldquo;Personal Information&rdquo; is information that identifies, relates to, describes, or is reasonably capable of being associated with you. We collect the following categories of Personal Information:
          </Paragraph>
          <UnorderedList>
            <ListItem><Strong>Identifiers:</Strong> Legal name, primary email address, unique account IDs, Internet Protocol (IP) address, browser cookies, and encrypted OAuth tokens.</ListItem>
            <ListItem><Strong>Commercial Information:</Strong> Transaction status, billing ledger logs, and subscription type (credit card transactions are securely isolated and processed by Stripe).</ListItem>
            <ListItem><Strong>Internet or Electronic Network Activity:</Strong> Search queries conducted within the neural search interface, system diagnostic flags, connection speed logs, and layout preferences.</ListItem>
            <ListItem><Strong>Professional & Employment-Related Information:</Strong> Communication headers, sender/recipient records, document filenames, and metadata from accounts (such as Slack, Google Workspace, GitHub) you choose to sync.</ListItem>
            <ListItem><Strong>Sensitive Personal Information:</Strong> Account credentials, passwords, and the text payload contents of your communications. <em>Crucially, we do not utilize these payloads for any purpose other than executing search and reputation audits. Payloads are never shared or sold.</em></ListItem>
          </UnorderedList>
        </>
      )
    },
    {
      id: "purposes",
      title: "3. Business and Commercial Purposes for Use",
      tldr: {
        summary: "We utilize personal data strictly to run, optimize, and secure your digital archives.",
        badge: "Purpose",
        points: ["Core service features", "Security logs and alerts", "Integrations troubleshooting"]
      },
      content: (
        <>
          <Paragraph>We utilize the collected categories of Personal Information for these specific business purposes:</Paragraph>
          <UnorderedList>
            <ListItem>Operating, upgrading, and delivering your custom digital archive and chat interface.</ListItem>
            <ListItem>Generating your reputational safety indicators and compiling risk audits.</ListItem>
            <ListItem>Protecting the system from security breaches, brute-force exploits, and maintaining audit logs.</ListItem>
            <ListItem>Processing service support queries and troubleshooting integrations.</ListItem>
          </UnorderedList>
        </>
      )
    },
    {
      id: "retention",
      title: "4. Retention Standards",
      tldr: {
        summary: "Data is retained during your active subscription. You can wipe all files instantly via the Kill Switch.",
        badge: "Retention",
        points: ["Retained during subscription", "1-click Kill Switch wipe", "Immediate cascade database deletion"]
      },
      content: (
        <>
          <Paragraph>
            We retain your Personal Information only for the duration of your active subscription and as necessary to comply with security requirements. We determine retention limits based on the volume, sensitivity, and risk profile of the records.
          </Paragraph>
          <Paragraph>
            You have the right to request deletion of your archive at any time. Triggering the <Strong>Kill Switch</Strong> inside settings initiates an automated database command, permanently purging all vectors, index data, and credentials immediately. This is non-reversible.
          </Paragraph>
        </>
      )
    },
    {
      id: "sales-sharing",
      title: "5. Sales, Sharing, and Profiling Disclosures",
      tldr: {
        summary: "EYES does not sell your personal details to data brokers or share them with marketing trackers.",
        badge: "No Sales",
        points: ["Zero advertising trackers", "No selling to data brokers", "Human-in-the-loop audit score review"]
      },
      content: (
        <Paragraph>
          The EYES does not sell your Personal Information to data brokers or third parties. We do not share your Personal Information with marketing partners for cross-context behavioral advertising. We do not perform automated profiling or tracking that results in legal or high-impact actions without human review.
        </Paragraph>
      )
    },
    {
      id: "rights",
      title: "6. California Consumer Rights",
      tldr: {
        summary: "California residents have rights to know, access, correct, delete, and limit sensitive data use.",
        badge: "Your Rights",
        points: ["Right to Know & Access", "Right to Delete and Correct", "No discrimination for exercising rights"]
      },
      content: (
        <>
          <Paragraph>California residents have specific legal rights under the CCPA:</Paragraph>
          <UnorderedList>
            <ListItem><Strong>Right to Know & Access:</Strong> The right to request disclosure of the categories of personal information collected, the sources, and the specific items stored.</ListItem>
            <ListItem><Strong>Right to Delete:</Strong> The right to request that we delete the personal information we have collected from you.</ListItem>
            <ListItem><Strong>Right to Correct:</Strong> The right to request correction of inaccurate personal details.</ListItem>
            <ListItem><Strong>Right to Limit Use of Sensitive Personal Information:</Strong> The right to limit our processing of sensitive details (such as account credentials and chat payload indexes) only to what is necessary to perform the service.</ListItem>
            <ListItem><Strong>Right to Non-Discrimination:</Strong> We will not discriminate against you for exercising your CCPA rights (e.g., by denying services or charging different prices).</ListItem>
          </UnorderedList>
        </>
      )
    },
    {
      id: "exercise",
      title: "7. How to Exercise Your Rights",
      tldr: {
        summary: "To exercise your CCPA rights, trigger the Kill Switch in settings or contact our operations office.",
        badge: "Exercise",
        points: ["Settings panel Kill Switch", "Contact privacy operations desk", "Assistance within statutory limits"]
      },
      content: (
        <>
          <Paragraph>To exercise your Right to Know, Delete, or Correct under California law, you may submit a request by:</Paragraph>
          <UnorderedList>
            <ListItem>Triggering the automated data removal commands in your settings menu (which deletes all data immediately).</ListItem>
            <ListItem>Submitting an email request directly to our privacy operations office: <Strong>privacy@the-eyes.com</Strong>.</ListItem>
          </UnorderedList>
        </>
      )
    }
  ], []);

  return (
    <PolicyPageTemplate 
      title="California Notice at Collection" 
      lastUpdated="June 3, 2026" 
      sections={sections} 
    />
  );
}
