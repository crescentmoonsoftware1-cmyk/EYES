"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const tabs = [
  {
    id: "intro-scope",
    title: "Scope & Consent",
    shortTitle: "Consent",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    tag: "Consent"
  },
  {
    id: "collection",
    title: "Information Collected",
    shortTitle: "Data Types",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
      </svg>
    ),
    tag: "Audit"
  },
  {
    id: "processing",
    title: "Purpose of Processing",
    shortTitle: "Processing",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
      </svg>
    ),
    tag: "Usage"
  },
  {
    id: "sharing",
    title: "Subprocessors & AI Limits",
    shortTitle: "AI Limits",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
    tag: "Integrations"
  },
  {
    id: "killswitch",
    title: "Data Control & Kill Switch",
    shortTitle: "Kill Switch",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    tag: "Control"
  },
  {
    id: "transfers",
    title: "Data Transfers",
    shortTitle: "Transfers",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
      </svg>
    ),
    tag: "Jurisdiction"
  },
  {
    id: "updates",
    title: "Policy Updates",
    shortTitle: "Updates",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
    tag: "Governance"
  }
];

export default function PrivacyPolicy() {
  const [activeTab, setActiveTab] = useState("intro-scope");

  useEffect(() => {
    // Disable body scrolling on desktop where the layout is side-by-side, allow scroll on mobile/tablet
    const checkAndSetScroll = () => {
      if (window.innerWidth >= 1024) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = 'auto';
      }
    };
    checkAndSetScroll();
    window.addEventListener('resize', checkAndSetScroll);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('resize', checkAndSetScroll);
    };
  }, []);

  const activeTabInfo = tabs.find(t => t.id === activeTab) || tabs[0];

  const renderTabContent = (tabId: string) => {
    switch (tabId) {
      case "intro-scope":
        return (
          <div className="space-y-8">
            <p className="text-xl md:text-2xl leading-relaxed text-[var(--text-primary)] font-serif italic">
              &quot;We collect and secure data to run your digital memory archive on the-eyes.com.&quot;
            </p>
            <p className="text-lg md:text-xl leading-relaxed text-[var(--text-secondary)]">
              Using the platform constitutes consent to these practices. If you disagree, please cease use and disconnect integrations.
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mt-8">
              <div className="rounded-2xl border border-[var(--border-primary)] bg-[rgba(255,255,255,0.02)] p-8 md:p-9 hover:border-[rgba(255,255,255,0.06)] transition-all">
                <div className="flex items-center gap-3 mb-3.5 text-[#E06A3B]">
                  <svg className="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <h4 className="font-bold text-base md:text-lg uppercase tracking-wider text-[var(--text-primary)]">Consent Granted</h4>
                </div>
                <p className="text-base text-[var(--text-secondary)] leading-relaxed">
                  By signing in and choosing to connect integrations, you grant permissions to index selected data stream channels.
                </p>
              </div>
              
              <div className="rounded-2xl border border-[var(--border-primary)] bg-[rgba(255,255,255,0.02)] p-8 md:p-9 hover:border-[rgba(255,255,255,0.06)] transition-all">
                <div className="flex items-center gap-3 mb-3.5 text-[#E06A3B]">
                  <svg className="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <h4 className="font-bold text-base md:text-lg uppercase tracking-wider text-[var(--text-primary)]">Consent Revocation</h4>
                </div>
                <p className="text-base text-[var(--text-secondary)] leading-relaxed">
                  Disconnecting integrations immediately ceases raw collections and initiates index compression routines.
                </p>
              </div>
            </div>
          </div>
        );

      case "collection":
        return (
          <div className="space-y-8">
            <p className="text-lg md:text-xl text-[var(--text-secondary)]">
              We collect minimal data depending on which integrations you decide to connect to your profile.
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              {[
                {
                  title: "Account & Billing",
                  desc: "Name, email, and subscription status.",
                  badge: "Active Profile",
                },
                {
                  title: "API Credentials",
                  desc: "Encrypted OAuth tokens to operate your connected platforms.",
                  badge: "AES-256 Wrapped",
                },
                {
                  title: "Archive Data",
                  desc: "Message bodies, timestamps, and metadata (Slack, Workspace, GitHub).",
                  badge: "Vector Sandbox",
                },
                {
                  title: "Logs & Metrics",
                  desc: "Natural language queries and device metrics (IP logs).",
                  badge: "30-Day TTL Cache",
                }
              ].map((item, idx) => (
                <div key={idx} className="rounded-2xl border border-[var(--border-primary)] bg-[rgba(255,255,255,0.02)] p-8 md:p-9 hover:border-[#E06A3B]/20 transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start gap-2 mb-5">
                      <h4 className="font-bold text-base md:text-lg uppercase tracking-wider text-[var(--text-primary)]">{item.title}</h4>
                      <span className="text-xs font-mono tracking-wider text-[#E06A3B] bg-[#E06A3B]/10 px-3 py-1 rounded-full border border-[#E06A3B]/20 shrink-0">
                        {item.badge}
                      </span>
                    </div>
                    <p className="text-base text-[var(--text-secondary)] leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case "processing":
        return (
          <div className="space-y-8">
            <p className="text-lg md:text-xl text-[var(--text-secondary)]">
              Processing operations are strictly limited to the execution of digital sanctum indexes.
            </p>
            
            <div className="space-y-6">
              {[
                {
                  title: "Service Delivery",
                  desc: "Generating reputation indices, executing queries, and updating indicators.",
                  icon: (
                    <svg className="w-7 h-7 text-[#E06A3B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  )
                },
                {
                  title: "User Consent",
                  desc: "Indexing message logs from external channels you choose to connect.",
                  icon: (
                    <svg className="w-7 h-7 text-[#E06A3B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )
                },
                {
                  title: "Platform Integrity",
                  desc: "Debugging technical errors and blocking security threats.",
                  icon: (
                    <svg className="w-7 h-7 text-[#E06A3B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  )
                }
              ].map((item, idx) => (
                <div key={idx} className="flex gap-6 rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.01)] p-7 md:p-8 hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                  <div className="w-14 h-14 flex items-center justify-center bg-[rgba(224,106,59,0.1)] rounded-lg shrink-0">
                    {item.icon}
                  </div>
                  <div>
                    <h4 className="text-base md:text-lg uppercase tracking-wider font-bold text-[var(--text-primary)] mb-1.5">{item.title}</h4>
                    <p className="text-base text-[var(--text-secondary)] leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case "sharing":
        return (
          <div className="space-y-8">
            <p className="text-lg md:text-xl text-[var(--text-secondary)]">
              We operate under a <span className="text-[var(--text-primary)] font-semibold">zero-selling policy</span>. All necessary data flow paths are isolated.
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              <div className="rounded-2xl border border-[var(--border-primary)] bg-[rgba(255,255,255,0.02)] p-8">
                <h4 className="font-bold text-base md:text-lg uppercase tracking-wider text-[var(--text-primary)] mb-5 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Infrastructure Hosts
                </h4>
                <ul className="space-y-4 text-base text-[var(--text-secondary)] leading-relaxed">
                  <li className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                    <span>Supabase</span>
                    <span className="text-sm text-[var(--text-muted)] font-medium">Database Storage</span>
                  </li>
                  <li className="flex items-center justify-between pt-1">
                    <span>Vercel</span>
                    <span className="text-sm text-[var(--text-muted)] font-medium">Application Deployments</span>
                  </li>
                </ul>
              </div>
              
              <div className="rounded-2xl border border-[var(--border-primary)] bg-[rgba(255,255,255,0.02)] p-8">
                <h4 className="font-bold text-base md:text-lg uppercase tracking-wider text-[var(--text-primary)] mb-5 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  AI API Endpoints
                </h4>
                <p className="text-base text-[var(--text-secondary)] leading-relaxed mb-4">
                  OpenAI, Anthropic, and Google Gemini APIs.
                </p>
                <div className="text-base text-[#E06A3B] bg-[#E06A3B]/10 p-4 rounded-xl border border-[#E06A3B]/20 leading-relaxed font-semibold">
                  Strict enterprise agreements with zero-data-retention. Your raw datasets are never used to train public generative LLMs.
                </div>
              </div>
            </div>
          </div>
        );

      case "killswitch":
        return (
          <div className="space-y-8">
            <p className="text-lg md:text-xl text-[var(--text-secondary)]">
              You maintain absolute sovereignty and authority over your archive content indexes.
            </p>
            
            <div className="rounded-2xl border border-red-500/20 bg-red-950/5 p-8 md:p-10 shadow-[0_0_30px_rgba(239,68,68,0.05)]">
              <div className="flex items-center gap-3.5 mb-5 text-red-400">
                <svg className="w-7 h-7 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h4 className="font-serif text-xl md:text-2xl text-[var(--text-primary)]">The Purge Kill Switch</h4>
              </div>
              
              <p className="text-base md:text-lg text-[var(--text-secondary)] leading-relaxed mb-6">
                Triggering the Kill Switch in your account dashboard executes an instant, non-reversible, cascading delete instruction across our primary and replica databases.
              </p>
              
              <div className="grid grid-cols-2 gap-4 text-sm md:text-base font-mono text-[var(--text-secondary)] mb-6">
                <div className="flex items-center gap-2.5 bg-black/30 p-3 rounded-lg">
                  <span className="text-red-500 font-bold">✗</span> Wipes Credentials
                </div>
                <div className="flex items-center gap-2.5 bg-black/30 p-3 rounded-lg">
                  <span className="text-red-500 font-bold">✗</span> Deletes OAuth Tokens
                </div>
                <div className="flex items-center gap-2.5 bg-black/30 p-3 rounded-lg">
                  <span className="text-red-500 font-bold">✗</span> Clears Archive Logs
                </div>
                <div className="flex items-center gap-2.5 bg-black/30 p-3 rounded-lg">
                  <span className="text-red-500 font-bold">✗</span> Flushes Vector Records
                </div>
              </div>
              
              <button disabled className="w-full py-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 text-base font-semibold uppercase tracking-wider opacity-60 cursor-not-allowed flex items-center justify-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                Purge Available in Settings
              </button>
            </div>
          </div>
        );

      case "transfers":
        return (
          <div className="space-y-8">
            <p className="text-lg md:text-xl text-[var(--text-secondary)]">
              Primary storage clusters are located in high-security datacenters within the United States.
            </p>
            
            <div className="rounded-2xl border border-[var(--border-primary)] bg-[rgba(255,255,255,0.02)] p-8 md:p-10 flex flex-col sm:flex-row gap-8 items-center">
              <div className="w-18 h-18 rounded-full bg-[rgba(224,106,59,0.1)] flex items-center justify-center text-[#E06A3B] text-3xl shrink-0">
                🌍
              </div>
              <div className="space-y-2 text-center sm:text-left">
                <h4 className="font-bold text-base md:text-lg text-[var(--text-primary)]">Standard Contractual Clauses (SCCs)</h4>
                <p className="text-base text-[var(--text-secondary)] leading-relaxed">
                  Transfers originating from the European Economic Area (EEA) or United Kingdom (UK) are secured under EU-approved Standard Contractual Clauses, guaranteeing equivalent levels of encryption, storage separation, and digital rights.
                </p>
              </div>
            </div>
          </div>
        );

      case "updates":
        return (
          <div className="space-y-8">
            <p className="text-lg md:text-xl text-[var(--text-secondary)]">
              We reserve the right to refine this policy to reflect platform features.
            </p>
            
            <div className="rounded-2xl border border-[var(--border-primary)] bg-[rgba(255,255,255,0.02)] p-8 md:p-10 space-y-6">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4.5">
                <span className="text-sm text-[var(--text-muted)] uppercase tracking-wider font-mono">Current Policy Engine</span>
                <span className="text-base font-semibold text-emerald-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Active v1.0.0
                </span>
              </div>
              <p className="text-base text-[var(--text-secondary)] leading-relaxed">
                Material modifications will always trigger banner notifications inside your main active dashboard feed or via email at least 7 days before compliance implementation.
              </p>
              <p className="text-base text-[var(--text-secondary)] leading-relaxed">
                Your continued platform use following the updates constitutes automatic acknowledgement of revised policies.
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="w-full flex flex-col h-auto lg:h-[calc(100vh-140px)] lg:min-h-0">
      {/* Policy Page Header (Title + Overview summary) - Desktop */}
      <div className="mb-4 flex flex-col md:flex-row justify-between items-start md:items-end gap-4 shrink-0">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-primary)] px-3 py-1 text-[9px] uppercase tracking-[0.42em] text-[var(--text-secondary)] mb-2">
            Compliance Engine
          </div>
          <h1 className="font-serif text-3xl md:text-4xl lg:text-5xl text-[var(--text-primary)] tracking-[-0.04em] leading-[0.92]">
            Privacy Policy
          </h1>
        </div>
      </div>

      {/* Main interactive split deck */}
      <div className="flex-1 min-h-0 min-w-0 grid grid-cols-1 lg:grid-cols-[280px_1fr] xl:grid-cols-[320px_1fr] gap-6 xl:gap-10 items-stretch">
        
        {/* Left column sidebar for section navigation */}
        <div className="flex flex-col gap-4 min-h-0 overflow-y-auto pr-1">
          <div className="text-base font-bold tracking-[0.25em] text-[var(--text-secondary)] uppercase mb-2 hidden lg:block opacity-75">
            Privacy Index
          </div>
          
          {/* Vertical Tabs List for Desktop */}
          <div className="hidden lg:flex flex-col gap-2">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full text-left rounded-xl px-4 py-2.5 flex items-center gap-3 transition-all duration-200 border group cursor-pointer ${
                    isActive
                      ? "bg-[rgba(255,255,255,0.06)] border-[rgba(255,255,255,0.12)] text-[var(--text-primary)] shadow-sm"
                      : "bg-transparent border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.02)]"
                  }`}
                >
                  <div className={`transition-colors duration-200 shrink-0 ${
                    isActive ? "text-[#E06A3B]" : "text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]"
                  }`}>
                    {tab.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate transition-all ${isActive ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>
                      {tab.title}
                    </p>
                  </div>
                  {isActive && (
                    <span className="w-2 h-2 rounded-full bg-[#E06A3B] shadow-[0_0_8px_rgba(224,106,59,0.85)] shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Horizontal scrollable tab selector for Mobile */}
          <div className="lg:hidden flex gap-2 overflow-x-auto pb-2 scrollbar-none shrink-0 snap-x">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`snap-center rounded-full px-5 py-2.5 text-xs md:text-sm flex items-center gap-2 whitespace-nowrap transition-all border shrink-0 cursor-pointer ${
                    isActive
                      ? "bg-[rgba(255,255,255,0.08)] border-[rgba(255,255,255,0.16)] text-[var(--text-primary)]"
                      : "bg-[rgba(255,255,255,0.02)] border-[var(--border-primary)] text-[var(--text-secondary)]"
                  }`}
                >
                  <span className={isActive ? "text-[#E06A3B]" : "text-[var(--text-secondary)]"}>
                    {tab.icon}
                  </span>
                  <span>{tab.shortTitle}</span>
                </button>
              );
            })}
          </div>

          {/* Quick info status box in Sidebar - Desktop only */}
          <div className="mt-auto hidden lg:block rounded-2xl border border-[var(--border-primary)] bg-[rgba(255,255,255,0.02)] p-6">
            <p className="text-sm font-bold tracking-widest text-[var(--text-secondary)] uppercase mb-3">
              Sovereign Storage
            </p>
            <p className="text-sm md:text-[15px] text-[var(--text-secondary)] leading-relaxed">
              Your data remains locked in single-tenant containers. Zero telemetry tracking is active.
            </p>
          </div>
        </div>

        {/* Right column: active section display area */}
        <div className="rounded-3xl border border-[var(--border-primary)] bg-[rgba(255,255,255,0.03)] p-6 md:p-8 flex flex-col min-h-0 min-w-0 overflow-hidden shadow-2xl relative">
          
          {/* Active section header info */}
          <div className="mb-6 pb-4 border-b border-[var(--border-subtle)] shrink-0">
            <div className="flex items-center justify-between gap-4">
              <span className="text-[10px] font-mono tracking-widest text-[#E06A3B] uppercase bg-[#E06A3B]/10 px-2.5 py-1 rounded-full border border-[#E06A3B]/20">
                {activeTabInfo.tag}
              </span>
              <span className="text-xs md:text-sm text-[var(--text-secondary)] font-mono">
                Index {tabs.findIndex(t => t.id === activeTab) + 1} of {tabs.length}
              </span>
            </div>
            <h2 className="font-serif text-2xl md:text-3xl text-[var(--text-primary)] mt-3">
              {activeTabInfo.title}
            </h2>
          </div>

          {/* Active content block with scrollbar if needed, but page itself doesn't scroll */}
          <div className="flex-1 overflow-y-auto pr-1 select-text scrollbar-thin">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="pb-2"
              >
                {renderTabContent(activeTab)}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

      </div>
    </div>
  );
}
