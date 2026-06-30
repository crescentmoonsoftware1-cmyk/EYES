"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export const PageTitle = ({ children }: { children: React.ReactNode }) => (
  <h1 className="font-serif text-3xl md:text-4xl lg:text-5xl text-[var(--text-primary)] mb-2 tracking-tight text-center transition-colors duration-300">{children}</h1>
);

export const DateText = ({ children }: { children: React.ReactNode }) => (
  <p className="font-mono text-[9px] md:text-[10px] text-[var(--text-secondary)] mb-4 uppercase tracking-[0.2em] opacity-80 text-center transition-colors duration-300">{children}</p>
);

export const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-xl md:text-2xl font-serif text-[var(--text-primary)] mt-16 mb-6 pb-4 border-b border-[var(--border-subtle)] transition-colors duration-300">{children}</h3>
);

export const SubSectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h4 className="text-lg md:text-xl font-medium text-[var(--text-primary)] mt-10 mb-4 transition-colors duration-300">{children}</h4>
);

export const Paragraph = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[var(--text-secondary)] leading-loose mb-6 text-[14px] md:text-base opacity-95 transition-colors duration-300">{children}</p>
);

export const UnorderedList = ({ children }: { children: React.ReactNode }) => (
  <ul className="list-none pl-0 mb-8 space-y-4">{children}</ul>
);

export const ListItem = ({ children }: { children: React.ReactNode }) => (
  <li className="flex items-start gap-3 text-[var(--text-secondary)] leading-relaxed text-[14px] md:text-base transition-colors duration-300">
    <span className="w-1.5 h-1.5 rounded-full bg-[#E06A3B] shadow-[0_0_8px_rgba(224,106,59,0.5)] mt-2.5 shrink-0" />
    <span className="flex-1 min-w-0">{children}</span>
  </li>
);

export const Strong = ({ children }: { children: React.ReactNode }) => (
  <strong className="font-semibold text-[var(--text-primary)] transition-colors duration-300">{children}</strong>
);

export type PolicySection = {
  id: string;
  title: string;
  content: React.ReactNode;
  tldr?: {
    summary: string;
    badge?: string;
    points?: string[];
  };
};

const getSectionIcon = (id: string) => {
  const lowerId = id.toLowerCase();
  
  if (lowerId.includes("infrastructure") || lowerId.includes("encryption") || lowerId.includes("security")) {
    return (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    );
  }
  if (lowerId.includes("token") || lowerId.includes("credential")) {
    return (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m-5-2a5 5 0 11-5 5m5-5a5 5 0 015 5m-5 5a5 5 0 01-5-5m5 5a5 5 0 005-5m-5 5a5 5 0 00-5-5m5 5v3a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v3" />
      </svg>
    );
  }
  if (lowerId.includes("kill") || lowerId.includes("purge")) {
    return (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    );
  }
  if (lowerId.includes("cookie") || lowerId.includes("storage") || lowerId.includes("what-are")) {
    return (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
      </svg>
    );
  }
  if (lowerId.includes("exclusion") || lowerId.includes("marketing")) {
    return (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
      </svg>
    );
  }
  if (lowerId.includes("advisory") || lowerId.includes("disclaimer") || lowerId.includes("liability")) {
    return (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    );
  }
  if (lowerId.includes("ai") || lowerId.includes("anomalies")) {
    return (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 113.536 0V21h2v-2.243a5 5 0 013.536 0z" />
      </svg>
    );
  }
  if (lowerId.includes("contact") || lowerId.includes("support")) {
    return (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    );
  }
  if (lowerId.includes("updates") || lowerId.includes("history")) {
    return (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3 3L22 4" />
      </svg>
    );
  }
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
};

export const PolicyPageTemplate = ({
  title,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  lastUpdated: _lastUpdated,
  sections
}: {
  title: string;
  lastUpdated: string;
  sections: PolicySection[];
}) => {
  const [activeTab, setActiveTab] = useState(sections[0]?.id || "");

  const activeTabInfo = sections.find(s => s.id === activeTab) || sections[0];

  return (
    <div className="w-full flex flex-col h-auto lg:h-[calc(100vh-140px)] lg:min-h-0">
      {/* Policy Page Header (Title + Overview summary) - Desktop */}
      <div className="mb-4 flex flex-col md:flex-row justify-between items-start md:items-end gap-4 shrink-0">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-primary)] px-3 py-1 text-[9px] uppercase tracking-[0.42em] text-[var(--text-secondary)] mb-2">
            Compliance Engine
          </div>
          <h1 className="font-serif text-3xl md:text-4xl lg:text-5xl text-[var(--text-primary)] tracking-[-0.04em] leading-[0.92]">
            {title}
          </h1>
        </div>
      </div>

      {/* Main interactive split deck */}
      <div className="flex-1 min-h-0 min-w-0 grid grid-cols-1 lg:grid-cols-[280px_1fr] xl:grid-cols-[320px_1fr] gap-6 xl:gap-10 items-stretch">
        
        {/* Left column sidebar for section navigation */}
        <div className="flex flex-col gap-4 min-h-0 overflow-y-auto pr-1">
          <div className="text-base font-bold tracking-[0.25em] text-[var(--text-secondary)] uppercase mb-2 hidden lg:block opacity-75">
            Index
          </div>
          
          {/* Vertical Tabs List for Desktop */}
          <div className="hidden lg:flex flex-col gap-2">
            {sections.map((sec) => {
              const isActive = activeTab === sec.id;
              const titleWithoutNumber = sec.title.replace(/^\d+\.\s*/, '');
              return (
                <button
                  key={sec.id}
                  onClick={() => setActiveTab(sec.id)}
                  className={`w-full text-left rounded-xl px-4 py-2.5 flex items-center gap-3 transition-all duration-200 border group cursor-pointer ${
                    isActive
                      ? "bg-[rgba(255,255,255,0.06)] border-[rgba(255,255,255,0.12)] text-[var(--text-primary)] shadow-sm"
                      : "bg-transparent border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.02)]"
                  }`}
                >
                  <div className={`transition-colors duration-200 shrink-0 ${
                    isActive ? "text-[#E06A3B]" : "text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]"
                  }`}>
                    {getSectionIcon(sec.id)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate transition-all ${isActive ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>
                      {titleWithoutNumber}
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
            {sections.map((sec) => {
              const isActive = activeTab === sec.id;
              const titleWithoutNumber = sec.title.replace(/^\d+\.\s*/, '');
              const shortTitle = sec.tldr?.badge || titleWithoutNumber;
              return (
                <button
                  key={sec.id}
                  onClick={() => setActiveTab(sec.id)}
                  className={`snap-center rounded-full px-5 py-2.5 text-xs md:text-sm flex items-center gap-2 whitespace-nowrap transition-all border shrink-0 cursor-pointer ${
                    isActive
                      ? "bg-[rgba(255,255,255,0.08)] border-[rgba(255,255,255,0.16)] text-[var(--text-primary)]"
                      : "bg-[rgba(255,255,255,0.02)] border-[var(--border-primary)] text-[var(--text-secondary)]"
                  }`}
                >
                  <span className={isActive ? "text-[#E06A3B]" : "text-[var(--text-secondary)]"}>
                    {getSectionIcon(sec.id)}
                  </span>
                  <span>{shortTitle}</span>
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
                {activeTabInfo?.tldr?.badge || "Overview"}
              </span>
              <span className="text-xs md:text-sm text-[var(--text-secondary)] font-mono">
                Index {sections.findIndex(t => t.id === activeTab) + 1} of {sections.length}
              </span>
            </div>
            <h2 className="font-serif text-2xl md:text-3xl text-[var(--text-primary)] mt-3">
              {activeTabInfo?.title}
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
                {activeTabInfo?.content}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

      </div>
    </div>
  );
};
