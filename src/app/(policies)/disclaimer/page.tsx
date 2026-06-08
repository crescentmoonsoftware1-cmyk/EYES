import React from 'react';
import { PolicyPageTemplate, Paragraph, UnorderedList, ListItem } from '../components';

export default function Disclaimer() {
  const sections = [
    {
      id: "advisory",
      title: "1. Advisory and Diagnostic Purpose Only",
      tldr: {
        summary: "EYES is an AI-driven archive and reputation diagnostic tool. Scoring and metrics are for personal informational review only.",
        badge: "Purpose",
        points: ["Diagnostic parameters only", "Not a background validation check", "Non-binding results"]
      },
      content: (
        <>
          <Paragraph>
            The EYES is an AI-driven digital archiving, search, and reputation diagnostic dashboard. All metrics, risk scoring (LIGHT, DIRECT, HEAVY), sentiment alerts, categorization patterns, and summaries provided by the dashboard are diagnostic, advisory, and for personal informational review only.
          </Paragraph>
          <Paragraph>
            No outcome, classification, or recommendation on our dashboard constitutes a legally binding valuation, employment screening decision, background validation report, or official certification of conduct.
          </Paragraph>
        </>
      )
    },
    {
      id: "exclusion",
      title: "2. Exclusion of Professional and Legal Advice",
      tldr: {
        summary: "Platform analyses, risk alerts, and chat outputs do not constitute legal, compliance, HR, or financial advice.",
        badge: "Legal Limit",
        points: ["Not legal advice", "Consult professionals before acting", "No client-attorney relationship"]
      },
      content: (
        <Paragraph>
          The contents of this platform, including AI chatbot feedback, audit reports, and risk queue action items, do not constitute legal advice, employment or human resources (HR) counseling, corporate compliance declarations, or financial advice. You are advised to obtain independent, licensed legal and professional counsel prior to taking any action, implementing hiring actions, or making corporate decisions based on evaluations rendered by the-eyes.com.
        </Paragraph>
      )
    },
    {
      id: "dependency",
      title: "3. Dependency on External Platforms and API Integrity",
      tldr: {
        summary: "EYES indexes details from third-party developer APIs (Slack, Google, GitHub) and is dependent on their status.",
        badge: "API Integrity",
        points: ["Dependent on developer APIs", "Outages stop database syncing", "We do not control third-party security"]
      },
      content: (
        <>
          <Paragraph>
            The EYES indexes communications history directly from API streams provided by third parties (such as Slack, Google Workspace, GitHub, and Twitter). We cannot control, verify, or guarantee:
          </Paragraph>
          <UnorderedList>
            <ListItem>The truth, accuracy, or completeness of raw messages retrieved from connected profiles.</ListItem>
            <ListItem>The constant uptime or availability of external developer APIs. If a third-party platform disables their integration token or experiences database outages, EYES cannot sync recent items.</ListItem>
            <ListItem>The structural security of platforms external to our immediate hosting environments.</ListItem>
          </UnorderedList>
        </>
      )
    },
    {
      id: "ai-anomalies",
      title: "4. Large Language Model & AI Anomalies",
      tldr: {
        summary: "AI systems can generate incorrect semantic links or hallucinate facts. Cross-reference using original citations.",
        badge: "AI Warning",
        points: ["AI hallucinations can occur", "Cross-reference alerts with source text", "Dynamic classification is predictive"]
      },
      content: (
        <>
          <Paragraph>
            Our dashboard indexes, vectorizes, and analyzes natural language queries using advanced deep learning engines. Artificial intelligence processes can occasionally produce false semantic links, miscategorize conversations, or generate inaccurate conclusions (commonly known as AI hallucinations).
          </Paragraph>
          <Paragraph>
            You should cross-reference any flag, risk evaluation, or summarized dialogue with the original text using the citations and date anchors provided by EYES before forming conclusions.
          </Paragraph>
        </>
      )
    },
    {
      id: "liability",
      title: "5. Limitation of Liability",
      tldr: {
        summary: "To the maximum extent under law, EYES is not liable for indirect, punitive, or consequential losses from service use.",
        badge: "Liability",
        points: ["No liability for data losses", "No profit loss coverage", "Limits align with applicable laws"]
      },
      content: (
        <Paragraph>
          To the maximum extent permitted by applicable law, in no event shall The EYES or its affiliates, developers, or suppliers be liable for any indirect, punitive, incidental, special, consequential, or exemplary damages, including but not limited to loss of profits, goodwill, data, use, or other intangible losses arising out of or relating to your use of this service.
        </Paragraph>
      )
    }
  ];

  return (
    <PolicyPageTemplate 
      title="Disclaimer" 
      lastUpdated="June 3, 2026" 
      sections={sections} 
    />
  );
}
