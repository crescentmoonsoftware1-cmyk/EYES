# The EYES — Landing Page Legal & Policy Content (Full Copy)

This document contains the complete, long-form legal copy for **The EYES** ecosystem. Each section is drafted specifically for the platform's focus on privacy, vector search, OAuth platform connector structures, and customer data sovereignty.

---

## 1. Privacy Policy
**Recommended Route:** `/privacy`

### Content:
# Privacy Policy
*Effective Date: June 3, 2026 | Last Updated: June 3, 2026*

### 1. Introduction & Scope
Welcome to The EYES ("we", "us", "our"). We operate the digital memory archiving and reputation diagnostic dashboard at the-eyes.com. This Privacy Policy is a legally binding document that governs your use of our service, outlining how we collect, ingest, index, store, process, and protect your personal information.

By registering for an account, connecting third-party communication platforms, or executing queries within our semantic search interfaces, you consent to the data practices described herein. If you do not agree with any provision of this Privacy Policy, you must immediately cease using the platform and disconnect your connectors.

### 2. Information We Collect
To construct your Neural Archive and provide semantic lookup tools, we collect several categories of information depending on your dashboard configuration:
- **Account Identifiers:** Your full name, email address, password hash, and active subscription details provided during user registration.
- **Connector Access Tokens:** Encrypted OAuth 2.0 refresh tokens, client IDs, and authorization tokens necessary to request messages and records from platforms you connect.
- **Communication Payloads & Metadata:** Message text body, subject lines, timestamps, sender/recipient identities, commit logs, pull request metadata, and document headers retrieved from connected platforms (e.g., Slack channels, Google Workspace, GitHub repositories).
- **Internal Query Logs:** Natural language questions, search history, and feedback vectors executed within our dashboard chat interface to retrieve archived memories.
- **Technical Metadata:** IP addresses, browser specifications, user agent information, session timelines, and cookie identifiers collected automatically during your visits.

### 3. Purpose of Processing and Legal Bases
We process your personal information under the following legal bases and for these specified purposes:
- **Contractual Performance:** Creating your account, maintaining integrations, executing queries, and delivering your custom reputation audit reports.
- **Consent:** Ingesting and indexing communication history from external platforms through authorization flows controlled fully by you.
- **Legitimate Interest:** Safeguarding the platform from malicious usage, debugging technical errors, optimizing query performance, and maintaining security threat logs.

### 4. Data Subprocessors & AI Sharing Limits
We do not sell, rent, or lease your personal information or indexed communication logs. To provide the service, we share specific data subsets with selected third-party subprocessors:
- **Cloud Infrastructure:** Supabase (database hosting) and Vercel (application deployment and edge hosting).
- **Large Language Models (LLMs):</strong> OpenAI, Anthropic, and Google Gemini API endpoints. *Crucially, we utilize enterprise-tier API channels with strict zero-data-retention agreements. Your personal data is never retained by these providers and is never used to train public generative models.*

### 5. Data Sovereignty & The Kill Switch
We believe in absolute data ownership. You maintain complete control over the lifecycle of your Neural Archive. You have the right to request access to your stored records, request correction of errors, or delete your archive at any time.

We provide a self-service **Kill Switch** in your settings. Triggering the Kill Switch initiates an immediate, automated cascade deletion across our database clusters. This deletes your user credentials, OAuth access tokens, search logs, index embeddings, and all vector records permanently. This action is instantaneous, non-reversible, and guarantees full deletion.

### 6. International Data Transfers
Our servers are located primarily in the United States. If you access the service from the European Economic Area (EEA), the United Kingdom, or other regions, your data will be transferred to and processed in the US. We apply Standard Contractual Clauses (SCCs) to ensure equivalent protection levels for your personal data.

### 7. Changes to This Privacy Policy
We reserves the right to modify this Privacy Policy at any time. When updates are published, we will revise the "Last Updated" date and notify you via a banner on the dashboard or by email if the changes are material. Continued use of the service constitutes acceptance of the updated terms.

### 8. Contact Information
For inquiries, rights requests, or feedback regarding your personal data privacy, please email our Data Protection Officer at: **privacy@the-eyes.com**.

---

## 2. Cookie Policy
**Recommended Route:** `/cookie-policy`

### Content:
# Cookie Policy
*Effective Date: June 3, 2026 | Last Updated: June 3, 2026*

### 1. Introduction
This Cookie Policy explains how The EYES ("we", "us", "our") uses cookies, pixel tags, local storage, and similar technologies on the-eyes.com to manage security session states and render user interface settings. We are dedicated to providing a private digital vault experience, which means our use of storage technologies is highly restricted and privacy-focused.

### 2. What are Cookies and Local Storage?
Cookies are small text files placed on your computer or mobile device by websites that you visit. Local storage is a standard web technology that allows websites to store data on your computer or mobile device. These tools are used to recognize your browser, remember choices, and secure logins.

### 3. How We Use Cookies & Storage Technologies
We only use these technologies to provide our service, protect your account, and remember your visual choices. We categorize our cookies and storage keys into two areas:

#### A. Strictly Necessary & Security Cookies (Authentication)
These are required for the security and operation of the platform. Disabling these cookies will prevent you from signing in or retrieving search archive data.
- **Session Identification:** Secure HTTP-only cookies (e.g., `eyes-session`, `sb-access-token`, `sb-refresh-token`) set to identify your active session and authorize queries.
- **CSRF Prevention:** Anti-forgery cookies set to ensure all dashboard updates and settings requests originate from your browser.

#### B. Functional & Preference Settings (Local Storage)
These keys are used to preserve configuration changes you apply to customize the layout. They are stored locally on your device and are never sent to third parties.
- **Interface Theme:** The `eyes-theme` and `data-theme` keys stored in local storage to preserve your preference between dark and light modes.
- **Sidebar Layout State:** Keys stored to remember whether the navigation menu was collapsed or expanded.
- **Chat History Cache:** The `eyes_chat_history` key to persist recent question structures on your client browser, allowing quick reference.

### 4. Absolute Exclusions: Third-Party & Marketing Trackers
To preserve your absolute privacy, we maintain a zero-tracker architecture. We do not use:
- Marketing or remarketing pixels (e.g., Meta Pixel, Google Ads).
- Behavioral tracking scripts or cross-site tracking cookies.
- Third-party analytics trackers that compile user profiling data (such as Google Analytics). All dashboard calculations are performed server-side on your isolated database.

### 5. How to Manage Cookies
You can configure your browser to reject all cookies or notify you when a cookie is set. However, since the-eyes.com relies on session cookies to authenticate queries, disabling them will render the dashboard non-functional.

You can clear all local storage and cookies at any time through your web browser settings. Clearing cookies will immediately terminate your session and return you to the login page.

### 6. Contact Information
If you have any questions about this Cookie Policy, please contact our team at: **privacy@the-eyes.com**.

---

## 3. Accessibility Declaration
**Recommended Route:** `/accessibility`

### Content:
# Accessibility Declaration
*Effective Date: June 3, 2026 | Last Updated: June 3, 2026*

### 1. Our Commitment
The EYES ("we", "us", "our") is committed to ensuring that our digital vault, memory timelines, and chat interfaces are accessible and usable by individuals with disabilities. We believe that everyone has a right to access their own digital footprint with dignity, equality, and independence, and we continually audit our code to meet these standards.

### 2. Standards & Target Conformance
We aim to conform to the Web Content Accessibility Guidelines (WCAG) 2.1 Level AA requirements. These guidelines outline how to make web content more accessible for people with sensory, cognitive, physical, and developmental needs.

### 3. Technical Specifications & Verified Tools
The accessibility of The EYES platform relies on the following technologies working in combination with your specific web browser and assistive devices:
- HTML5 semantic markup and document structure.
- CSS variables and layout definitions.
- WAI-ARIA (Accessible Rich Internet Applications) attributes for screen reader voice-overs.

Our dashboard is regularly tested using NVDA (on Windows), VoiceOver (on macOS/iOS), and TalkBack (on Android devices) in combination with popular modern browsers (Google Chrome, Mozilla Firefox, Apple Safari, and Microsoft Edge).

### 4. Key Features Implemented
To deliver a premium, accessible experience, we have integrated the following architectural features:
- **Full Keyboard Access:** All buttons, inputs, chat interactions, and settings tab lists are fully focusable and operable using standard keyboard navigation (Tab, Shift+Tab, Enter, Space, and Arrow keys). Focus indicators are designed with high visibility.
- **Color and Contrast:** Text colors are selected to guarantee a contrast ratio of at least 4.5:1 against the background card materials, satisfying WCAG AA visual requirements.
- **Reduced Motion Support:** The EYES respects user operating system choices for reduced motion. Visual features, such as the initial booting console, scanning lines, and slide animations, are automatically disabled or simplified if you have enabled reduced motion settings.
- **Responsive Zoom:** The layout supports zooming up to 200% without truncating details, breaking layouts, or hiding navigation menus.

### 5. Known Limitations & Ongoing Enhancements
While we strive to secure WCAG Level AA conformance across our entire application, some dynamic parts of the reputation audit PDF output documents may experience layout restrictions when rendered at high zoom ratios. We are actively refining our PDF generator to produce fully tagging-compliant PDF/UA structures.

### 6. Feedback & Escalation
If you experience any accessibility barriers while using our platform, please reach out to our accessibility team. We are committed to responding to accessibility inquiries within 48 hours and offering alternatives whenever possible:
Email: **accessibility@the-eyes.com**

---

## 4. Disclaimer
**Recommended Route:** `/disclaimer`

### Content:
# Disclaimer
*Effective Date: June 3, 2026 | Last Updated: June 3, 2026*

### 1. Advisory and Diagnostic Purpose Only
The EYES is an AI-driven digital archiving, search, and reputation diagnostic dashboard. All metrics, risk scoring (LIGHT, DIRECT, HEAVY), sentiment alerts, categorization patterns, and summaries provided by the dashboard are diagnostic, advisory, and for personal informational review only.

No outcome, classification, or recommendation on our dashboard constitutes a legally binding valuation, employment screening decision, background validation report, or official certification of conduct.

### 2. Exclusion of Professional and Legal Advice
The contents of this platform, including AI chatbot feedback, audit reports, and risk queue action items, do not constitute legal advice, employment or human resources (HR) counseling, corporate compliance declarations, or financial advice. You are advised to obtain independent, licensed legal and professional counsel prior to taking any action, implementing hiring actions, or making corporate decisions based on evaluations rendered by the-eyes.com.

### 3. Dependency on External Platforms and API Integrity
The EYES indexes communications history directly from API streams provided by third parties (such as Slack, Google Workspace, GitHub, and Twitter). We cannot control, verify, or guarantee:
- The truth, accuracy, or completeness of raw messages retrieved from connected profiles.
- The constant uptime or availability of external developer APIs. If a third-party platform disables their integration token or experiences database outages, EYES cannot sync recent items.
- The structural security of platforms external to our immediate hosting environments.

### 4. Large Language Model & AI Anomalies
Our dashboard indexes, vectorizes, and analyzes natural language queries using advanced deep learning engines. Artificial intelligence processes can occasionally produce false semantic links, miscategorize conversations, or generate inaccurate conclusions (commonly known as AI hallucinations).

You should cross-reference any flag, risk evaluation, or summarized dialogue with the original text using the citations and date anchors provided by EYES before forming conclusions.

### 5. Limitation of Liability
To the maximum extent permitted by applicable law, in no event shall The EYES or its affiliates, developers, or suppliers be liable for any indirect, punitive, incidental, special, consequential, or exemplary damages, including but not limited to loss of profits, goodwill, data, use, or other intangible losses arising out of or relating to your use of this service.

---

## 5. Security Policy
**Recommended Route:** `/security`

### Content:
# Security Policy
*Effective Date: June 3, 2026 | Last Updated: June 3, 2026*

### 1. Infrastructure & Architecture Security
Because EYES aggregates, processes, and vectorizes historical chat and email communications, security is the foundation of our software architecture. We manage our platforms under strict enterprise-grade security structures designed to protect customer repositories from unauthorized access, leakage, or exposure.

### 2. Cryptographic Encryption Standards
- **Encryption in Transit:** All data transmitted between user web browsers, EYES dashboard servers, and third-party platform API gateways is encrypted using Transport Layer Security (TLS 1.3) utilizing secure, modern cipher suites (AES-GCM, CHACHA20-POLY1305).
- **Encryption at Rest:** All databases, message indices, transaction tables, and vector embeddings are encrypted at rest using AES-256 cryptographic standards. Database storage blocks are protected with individual, rotated encryption keys.

### 3. API Token and Credentials Protection
We retrieve connection information strictly using secure, standardized OAuth 2.0 authorization flows. We follow the principle of least privilege, requesting read-only scopes necessary to compile your digital vault.

User secrets, including client IDs, refresh tokens, and authentication cookies, are encrypted before being saved in our relational databases using asymmetric key wrapping. Credentials are never sent in plain text and are isolated from normal logging files.

### 4. The Data Purge Kill Switch
We respect your absolute sovereignty over personal data. We provide an automated **Kill Switch** in the account settings page. Triggering the Kill Switch initiates a cascade database delete that immediately and permanently wipes:
- Your user identification profile and billing indicators.
- All connected integration tokens, refresh sequences, and credentials.
- All message archives, document headers, vector indices, and search log tables.

This deletion bypasses temporary trash folders, directly erasing records from database disks. Deleted records cannot be recovered.

### 5. Vulnerability Disclosure Policy (VDP) & Safe Harbor
We welcome security audits and evaluations conducted by independent cybersecurity researchers. We support responsible disclosure, committing to a safe-harbor relationship if you comply with these guidelines:
- Submit reports of discovered vulnerabilities directly to our security operations desk at **security@the-eyes.com**. Include clear replication instructions.
- Avoid performing Denial of Service (DoS) attacks, automated brute-force scans, or accessing records belonging to other users.
- Allow our team a reasonable timeframe (typically 7–14 days) to deploy updates before disclosing vulnerabilities publicly.

---

## 6. California Notice at Collection
**Recommended Route:** `/california-notice`

### Content:
# California Notice at Collection
*Effective Date: June 3, 2026 | Last Updated: June 3, 2026*

### 1. Statutory Background & Scope
This California Notice at Collection ("Notice") is provided by The EYES pursuant to the California Consumer Privacy Act of 2018, as amended by the California Privacy Rights Act of 2020 (collectively, the "CCPA"). This Notice is directed exclusively to visitors and registered users who reside in the State of California ("Consumers").

### 2. Categories of Personal Information We Collect
Under the CCPA, "Personal Information" is information that identifies, relates to, describes, or is reasonably capable of being associated with you. We collect the following categories of Personal Information:
- **Identifiers:** Legal name, primary email address, unique account IDs, Internet Protocol (IP) address, browser cookies, and encrypted OAuth tokens.
- **Commercial Information:** Transaction status, billing ledger logs, and subscription type (credit card transactions are securely isolated and processed by Stripe).
- **Internet or Electronic Network Activity:** Search queries conducted within the neural search interface, system diagnostic flags, connection speed logs, and layout preferences.
- **Professional & Employment-Related Information:** Communication headers, sender/recipient records, document filenames, and metadata from accounts (such as Slack, Google Workspace, GitHub) you choose to sync.
- **Sensitive Personal Information:** Account credentials, passwords, and the text payload contents of your communications. *Crucially, we do not utilize these payloads for any purpose other than executing search and reputation audits. Payloads are never shared or sold.*

### 3. Business and Commercial Purposes for Use
We utilize the collected categories of Personal Information for these specific business purposes:
- Operating, upgrading, and delivering your custom digital archive and chat interface.
- Generating your reputational safety indicators and compiling risk audits.
- Protecting the system from security breaches, brute-force exploits, and maintaining audit logs.
- Processing service support queries and troubleshooting integrations.

### 4. Retention Standards
We retain your Personal Information only for the duration of your active subscription and as necessary to comply with security requirements. We determine retention limits based on the volume, sensitivity, and risk profile of the records.

You have the right to request deletion of your archive at any time. Triggering the **Kill Switch** inside settings initiates an automated database command, permanently purging all vectors, index data, and credentials immediately. This is non-reversible.

### 5. Sales, Sharing, and Profiling Disclosures
The EYES does not sell your Personal Information to data brokers or third parties. We do not share your Personal Information with marketing partners for cross-context behavioral advertising. We do not perform automated profiling or tracking that results in legal or high-impact actions without human review.

### 6. California Consumer Rights
California residents have specific legal rights under the CCPA:
- **Right to Know & Access:** The right to request disclosure of the categories of personal information collected, the sources, and the specific items stored.
- **Right to Delete:** The right to request that we delete the personal information we have collected from you.
- **Right to Correct:** The right to request correction of inaccurate personal details.
- **Right to Limit Use of Sensitive Personal Information:** The right to limit our processing of sensitive details (such as account credentials and chat payload indexes) only to what is necessary to perform the service.
- **Right to Non-Discrimination:** We will not discriminate against you for exercising your CCPA rights (e.g., by denying services or charging different prices).

### 7. How to Exercise Your Rights
To exercise your Right to Know, Delete, or Correct under California law, you may submit a request by:
- Triggering the automated data removal commands in your settings menu (which deletes all data immediately).
- Submitting an email request directly to our privacy operations office: **privacy@the-eyes.com**.
