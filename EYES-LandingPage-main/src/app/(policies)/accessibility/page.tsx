"use client";

import React, { useMemo } from 'react';
import { PolicyPageTemplate, Paragraph, UnorderedList, ListItem, Strong } from '../components';

export default function AccessibilityDeclaration() {
  const sections = useMemo(() => [
    {
      id: "commitment",
      title: "1. Our Commitment",
      tldr: {
        summary: "We are committed to delivering an accessible digital sanctum and timeline interface that respects individual dignity.",
        badge: "Commitment",
        points: ["Accessible digital sanctums", "Equality and independence", "Regular code accessibility audits"]
      },
      content: (
        <Paragraph>
          The EYES (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) is committed to ensuring that our digital sanctum, memory timelines, and chat interfaces are accessible and usable by individuals with disabilities. We believe that everyone has a right to access their own digital footprint with dignity, equality, and independence, and we continually audit our code to meet these standards.
        </Paragraph>
      )
    },
    {
      id: "standards",
      title: "2. Standards & Target Conformance",
      tldr: {
        summary: "Our design conforms to the Web Content Accessibility Guidelines (WCAG) 2.1 Level AA specifications.",
        badge: "Standards",
        points: ["Conforms to WCAG 2.1 AA", "Aims for broad usability", "Continuous performance testing"]
      },
      content: (
        <Paragraph>
          We aim to conform to the Web Content Accessibility Guidelines (WCAG) 2.1 Level AA requirements. These guidelines outline how to make web content more accessible for people with sensory, cognitive, physical, and developmental needs.
        </Paragraph>
      )
    },
    {
      id: "technical",
      title: "3. Technical Specifications & Verified Tools",
      tldr: {
        summary: "Accessibility relies on HTML5, CSS variables, WAI-ARIA tags, and regular screen reader evaluations.",
        badge: "Tech Stack",
        points: ["Semantic HTML5 structures", "WAI-ARIA visual descriptors", "NVDA, VoiceOver & TalkBack tested"]
      },
      content: (
        <>
          <Paragraph>
            The accessibility of The EYES platform relies on the following technologies working in combination with your specific web browser and assistive devices:
          </Paragraph>
          <UnorderedList>
            <ListItem>HTML5 semantic markup and document structure.</ListItem>
            <ListItem>CSS variables and layout definitions.</ListItem>
            <ListItem>WAI-ARIA (Accessible Rich Internet Applications) attributes for screen reader voice-overs.</ListItem>
          </UnorderedList>
          <Paragraph>
            Our dashboard is regularly tested using NVDA (on Windows), VoiceOver (on macOS/iOS), and TalkBack (on Android devices) in combination with popular modern browsers (Google Chrome, Mozilla Firefox, Apple Safari, and Microsoft Edge).
          </Paragraph>
        </>
      )
    },
    {
      id: "features",
      title: "4. Key Features Implemented",
      tldr: {
        summary: "We support full keyboard access, high-contrast text, OS-linked reduced motion, and responsive zooming.",
        badge: "Features",
        points: ["Full keyboard navigation", "WCAG 4.5:1 contrast ratios", "Automatic reduced motion response"]
      },
      content: (
        <>
          <Paragraph>
            To deliver a premium, accessible experience, we have integrated the following architectural features:
          </Paragraph>
          <UnorderedList>
            <ListItem><Strong>Full Keyboard Access:</Strong> All buttons, inputs, chat interactions, and settings tab lists are fully focusable and operable using standard keyboard navigation (Tab, Shift+Tab, Enter, Space, and Arrow keys). Focus indicators are designed with high visibility.</ListItem>
            <ListItem><Strong>Color and Contrast:</Strong> Text colors are selected to guarantee a contrast ratio of at least 4.5:1 against the background card materials, satisfying WCAG AA visual requirements.</ListItem>
            <ListItem><Strong>Reduced Motion Support:</Strong> The EYES respects user operating system choices for reduced motion. Visual features, such as the initial booting console, scanning lines, and slide animations, are automatically disabled or simplified if you have enabled reduced motion settings.</ListItem>
            <ListItem><Strong>Responsive Zoom:</Strong> The layout supports zooming up to 200% without truncating details, breaking layouts, or hiding navigation menus.</ListItem>
          </UnorderedList>
        </>
      )
    },
    {
      id: "limitations",
      title: "5. Known Limitations & Ongoing Enhancements",
      tldr: {
        summary: "Some PDF report files may have zoom constraints; we are actively optimizing PDF/UA tags.",
        badge: "Limitations",
        points: ["PDF documents undergoing upgrades", "High zoom PDF enhancements active", "Targeting total PDF/UA compliance"]
      },
      content: (
        <Paragraph>
          While we strive to secure WCAG Level AA conformance across our entire application, some dynamic parts of the reputation audit PDF output documents may experience layout restrictions when rendered at high zoom ratios. We are actively refining our PDF generator to produce fully tagging-compliant PDF/UA structures.
        </Paragraph>
      )
    },
    {
      id: "feedback",
      title: "6. Feedback & Escalation",
      tldr: {
        summary: "Discovered an accessibility barrier? Contact our team for support within 48 hours.",
        badge: "Support",
        points: ["48-hour response target", "Fast accessibility resolutions", "Direct support email"]
      },
      content: (
        <Paragraph>
          If you experience any accessibility barriers while using our platform, please reach out to our accessibility team. We are committed to responding to accessibility inquiries within 48 hours and offering alternatives whenever possible:
          <br />Email: <Strong>accessibility@the-eyes.com</Strong>
        </Paragraph>
      )
    }
  ], []);

  return (
    <PolicyPageTemplate 
      title="Accessibility Declaration" 
      lastUpdated="June 3, 2026" 
      sections={sections} 
    />
  );
}
