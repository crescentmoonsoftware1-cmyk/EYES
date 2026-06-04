"use client";

import React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function PoliciesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const tabs = [
    { name: "PRIVACY POLICY", path: "/privacy-policy" },
    { name: "COOKIE POLICY", path: "/cookie-policy" },
    { name: "SECURITY POLICY", path: "/security-policy" },
    { name: "DISCLAIMER", path: "/disclaimer" },
  ];

  return (
    <div className="h-screen overflow-hidden bg-(--bg-primary) text-(--text-primary) font-sans flex flex-col selection:bg-[#E06A3B] selection:text-white transition-colors duration-300 overflow-x-hidden">
      
      {/* Centered Navigation Wrapper */}
      <div className="w-full flex justify-center pt-6 pb-2 px-6 shrink-0">
        <div className="w-full max-w-7xl lg:max-w-350 xl:max-w-384">
          {/* Policy Navigation Tabs Header */}
          <nav className="rounded-3xl border border-(--border-primary) bg-[rgba(255,255,255,0.04)] backdrop-blur-xl px-4 py-2.5 shadow-lg overflow-hidden">
            <div className="w-full overflow-x-auto scrollbar-none">
              <div className="flex flex-nowrap justify-start sm:justify-center items-center gap-3 md:gap-4 min-w-max sm:min-w-0 px-2 pb-0.5">
                <Link
                  href="/"
                  className="rounded-[20px] px-5 py-2.5 text-[10px] md:text-xs font-semibold tracking-[0.25em] bg-[rgba(224,106,59,0.08)] border border-[#E06A3B]/20 text-[#E06A3B] hover:bg-[#E06A3B]/20 hover:text-white transition-all duration-200 select-none uppercase flex items-center gap-1.5 cursor-pointer shrink-0 mr-1.5"
                >
                  HOME
                </Link>
                {tabs.map((tab) => {
                  const isActive = pathname === tab.path;
                  return (
                    <Link
                      key={tab.path}
                      href={tab.path}
                      className={`relative rounded-full px-4 py-2 text-[10px] md:text-xs font-semibold tracking-[0.25em] transition-all duration-200 select-none uppercase text-center ${
                        isActive
                          ? "bg-[#E06A3B] text-white shadow-md border border-[#E06A3B]"
                          : "bg-[rgba(255,255,255,0.03)] border border-(--border-primary) text-(--text-secondary) hover:text-(--text-primary) hover:bg-[rgba(255,255,255,0.06)]"
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
        <main className="w-full max-w-7xl lg:max-w-350 xl:max-w-384 px-6 pt-1 pb-4 md:pb-6 flex flex-col min-h-0">
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
