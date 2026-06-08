"use client";

import React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useSelectedLayoutSegment } from 'next/navigation';

export default function PoliciesLayout({ children }: { children: React.ReactNode }) {
  const segment = useSelectedLayoutSegment();

  const tabs = [
    { name: "PRIVACY POLICY", path: "/privacy-policy", segment: "privacy-policy" },
    { name: "COOKIE POLICY", path: "/cookie-policy", segment: "cookie-policy" },
    { name: "SECURITY POLICY", path: "/security-policy", segment: "security-policy" },
    { name: "DISCLAIMER", path: "/disclaimer", segment: "disclaimer" },
  ];

  return (
    <div className="h-screen overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)] font-sans flex flex-col selection:bg-[#E06A3B] selection:text-white transition-colors duration-300 overflow-x-hidden">
      
      {/* Centered Navigation Wrapper */}
      <div className="w-full flex justify-center pt-6 pb-2 px-6 shrink-0">
        <div className="w-full max-w-7xl lg:max-w-[1400px] xl:max-w-[1536px]">
          {/* Policy Navigation Tabs Header */}
          <nav className="rounded-3xl border border-[var(--border-primary)] bg-[rgba(255,255,255,0.04)] backdrop-blur-xl px-4 py-2.5 shadow-lg overflow-hidden">
            <div className="w-full overflow-x-auto scrollbar-none">
              <div className="flex flex-nowrap justify-start sm:justify-center items-center gap-3 md:gap-4 min-w-max sm:min-w-0 px-2 pb-0.5">
                <Link
                  href="/"
                  className="rounded-full px-4 py-2 text-[10px] md:text-xs font-semibold tracking-[0.25em] bg-[rgba(224,106,59,0.08)] border border-[#E06A3B]/20 text-[#E06A3B] hover:bg-[#E06A3B]/20 hover:text-white transition-all duration-200 select-none uppercase flex items-center justify-center cursor-pointer shrink-0 mr-1.5"
                >
                  HOME
                </Link>
                {tabs.map((tab) => {
                  const isActive = segment === tab.segment;
                  return (
                    <Link
                      key={tab.path}
                      href={tab.path}
                      className={`relative rounded-full px-4 py-2 text-[10px] md:text-xs font-semibold tracking-[0.25em] transition-all duration-200 select-none uppercase text-center ${
                        isActive
                          ? "bg-[rgba(255,255,255,0.16)] text-[var(--text-primary)] shadow-sm"
                          : "bg-[rgba(255,255,255,0.03)] border border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[#E06A3B] hover:bg-[#E06A3B]/10 hover:border-[#E06A3B]/30"
                      }`}
                    >
                      {tab.name}
                    </Link>
                  );
                })}
              </div>
            </div>
          </nav>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 w-full flex justify-center min-h-0">
        <main className="w-full max-w-7xl lg:max-w-[1400px] xl:max-w-[1536px] px-6 pt-1 pb-4 md:pb-6 flex flex-col min-h-0">
          <motion.div
            className="w-full flex-1 flex flex-col min-h-0"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
