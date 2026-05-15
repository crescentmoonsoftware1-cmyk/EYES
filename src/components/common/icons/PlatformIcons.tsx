import React from 'react';

/**
 * SOURCE OF TRUTH FOR PLATFORM ICONS
 * These icons are highly detailed and use official brand colors.
 */

export function ShieldIcon({ size = 20, color = "var(--accent-green)" }: { size?: number, color?: string }) { 
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 22C12 22 20 18 20 12V5L12 2L4 5V12C4 18 12 22 12 22Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12 11V17" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12 7H12.01" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function SearchIcon({ size = 20 }: { size?: number }) { 
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  ); 
}

export function ArrowRightIcon({ size = 24 }: { size?: number }) { 
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12H19M19 12L13 6M19 12L13 18"/>
    </svg>
  ); 
}

// PREMIUM AUDIT CATEGORY ICONS
export function PrivacyEyeIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="var(--text-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="12" cy="12" r="3" stroke="var(--accent-vital)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12 17V17.01" stroke="var(--accent-vital)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function OperationalLinkIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="var(--text-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="var(--accent-vital)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function SentimentChartIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z" stroke="var(--text-primary)" strokeWidth="2"/>
      <path d="M8 12L11 9L13 14L16 11" stroke="var(--accent-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M2 12H22" stroke="var(--border-primary)" strokeWidth="1" strokeDasharray="2 2"/>
    </svg>
  );
}

export function BoltIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M13 2L3 14H12V22L22 10H13V2Z" fill="currentColor"/>
    </svg>
  );
}

export function RedditIconOfficial({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid">
      <circle cx="128" cy="128" r="128" fill="#FF4500"/>
      <path fill="#FFF" d="M213.2 129.2a18.6 18.6 0 00-18.7-18.6c-4.8 0-9.2 1.8-12.6 4.8-12.8-8.9-30.3-14.7-49.8-15.5l8.5-40 27.8 5.9c.3 7 6.1 12.6 13.3 12.6a13.3 13.3 0 100-26.6c-5.2 0-9.8 3-11.9 7.5l-31-6.6a2.3 2.3 0 00-2.4.5 2.3 2.3 0 00-1.4 2.1l-9.5 44.5c-19.8.6-37.7 6.6-50.6 15.6a18.7 18.7 0 00-12.7-5.1 18.6 18.6 0 000 37.2c0 2.2.3 4.4.8 6.5-1.5-.2-3.1-.3-4.7-.3-17.7 0-32 14.3-32 32s14.3 32 32 32 32-14.3 32-32c0-2-.2-4-.6-5.8 19 5.5 41.5 8.8 65.8 8.8 24.3 0 46.8-3.2 65.8-8.8-.4 1.8-.6 3.8-.6 5.8 0 17.7 14.3 32 32 32s32-14.3 32-32-14.3-32-32-32c-1.6 0-3.2.1-4.7.3.5-2.1.8-4.3.8-6.5 0-7.6-4.6-14-11-17a18.6 18.6 0 000-10.3zm-128 13.3a13.3 13.3 0 1126.6 0 13.3 13.3 0 01-26.6 0zm74.3 35.3c-9.2 9.1-26.6 9.7-31.6 9.7-5.2 0-22.6-.7-31.6-9.7a3.4 3.4 0 014.9-4.8c5.8 5.8 18 7.8 26.7 7.8s20.9-2 26.7-7.8a3.4 3.4 0 014.9 4.8zm-2.4-21.9a13.3 13.3 0 110-26.6 13.3 13.3 0 010 26.6z"/>
    </svg>
  );
}

export function GitHubIconOfficial({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 250" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid">
      <path fill="var(--text-primary)" d="M128 0C57.3 0 0 57.3 0 128c0 56.5 36.7 104.5 87.5 121.5 6.4 1.2 8.7-2.8 8.7-6.2 0-3-.1-13.1-.2-23.8-35.6 7.7-43.1-15.1-43.1-15.1-5.8-14.8-14.2-18.7-14.2-18.7-11.6-8 .9-7.8.9-7.8 12.9.9 19.6 13.2 19.6 13.2 11.4 19.6 29.9 13.9 37.2 10.6 1.2-8.3 4.5-13.9 8.1-17.1-28.4-3.2-58.3-14.2-58.3-63.3 0-14 5-25.4 13.2-34.4-1.3-3.2-5.7-16.2 1.2-33.9 0 0 10.7-3.4 35.2 13.1 10.2-2.8 21.2-4.3 32-4.3s21.8 1.5 32 4.3c24.5-16.5 35.2-13.1 35.2-13.1 7 17.6 2.6 30.7 1.3 33.9 8.2 9 13.2 20.4 13.2 34.4 0 49.2-29.9 60-58.4 63.2 4.6 4 8.7 11.8 8.7 23.7 0 17.1-.1 30.9-.1 35.1 0 3.4 2.3 7.4 8.8 6.1C219.4 232.5 256 184.5 256 128 256 57.3 198.7 0 128 0z"/>
    </svg>
  );
}

export function GmailIconOfficial({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 193" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid">
      <path fill="#4285f4" d="M58.2 192V93.1L27.5 65.1 0 49.5v125.1c0 9.7 7.8 17.5 17.5 17.5h40.7z"/>
      <path fill="#34a853" d="M197.8 192h40.7c9.7 0 17.5-7.8 17.5-17.5V49.5l-31.2 17.8-27 25.8V192z"/>
      <path fill="#ea4335" d="M58.2 93.1V17.5L128 70l69.8-52.5v75.6L128 145.5l-69.8-52.4z"/>
      <path fill="#fbbc04" d="M197.8 17.5V93.1l58.2-43.6V26.2c0-21.6-24.6-33.9-41.9-20.9l-16.3 12.2z"/>
      <path fill="#c5221f" d="M0 49.5l26.8 20.1 31.4 23.5V17.5L41.9 5.3C24.6-7.7 0 4.6 0 26.2v23.3z"/>
    </svg>
  );
}

export function CalendarIconOfficial({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid">
      <path fill="#fff" d="M195.4 60.6H60.6v134.8h134.8V60.6z"/>
      <path fill="#ea4335" d="M195.4 256L256 195.4l-30.3-5.2-30.3 5.2V256z"/>
      <path fill="#188038" d="M0 195.4v40.4C0 247 9 256 20.2 256h40.4v-60.6H0z"/>
      <path fill="#1967d2" d="M256 60.6V20.2C256 9 247 0 235.8 0h-40.4v60.6H256z"/>
      <path fill="#fbbc04" d="M60.6 0H20.2C9 0 0 9 0 20.2v40.4h60.6V0z"/>
      <path fill="#4285f4" d="M195.4 60.6v134.8H60.6V60.6h134.8z"/>
      <path d="M156.4 101.4c0-1.9-.4-3.3-1.3-4.3-.9-1-2.1-1.5-3.8-1.5s-2.9.5-3.8 1.5c-.8 1-1.3 2.4-1.3 4.3v34.5c0 1.9.4 3.3 1.3 4.3.9 1 2.1 1.5 3.8 1.5s2.9-.5 3.8-1.5c.8-1 1.3-2.4 1.3-4.3v-34.5zM114.7 135.1c0 1.3.2 2.2.8 2.9.5.7 1.3 1 2.2 1s1.7-.3 2.2-1 .8-1.6.8-2.9V102.3c0-1.3-.2-2.2-.8-2.9-.5-.7-1.3-1-2.2-1s-1.7.3-2.2 1-.8 1.6-.8 2.9v32.8z" fill="#fff"/>
    </svg>
  );
}

export function NotionIconOfficial({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid">
      <path fill="white" d="M16 11.5L164 0l34.3 7.8 47.2 33.3c10.4 7.3 10.4 8.3 10.4 14.6v182.5c0 11.4-4.2 18.2-18.7 19.2L65.4 267.4c-11 .5-16-1.1-21.8-8.3L8.8 213.8C2.6 205.5 0 199.3 0 192V29.7c0-9.4 4.2-17.2 16.1-18.2z"/>
      <path fill="black" d="M50.9 32.2L183.6 22.8l44.6 53.1c2.1 2.1 3.1 4.2 3.1 7.3V229.6c0 4.2-1.6 7.3-5.7 7.8l-132.6 8.8c-5.7.5-8.3-1-10.9-4.2L38.5 186.1c-2.1-3.1-3.1-5.2-3.1-10.4V32.2c0-4.7 6.2-6.8 15.5-1.1z"/>
      <path fill="white" d="M71.7 189.2h3.1V72.9l-15.1 9.4v72.9c0 7.3 5.7 14.6 11.9 21.3"/>
      <path fill="white" d="M177.9 56.6l-45.2 71-24.9-40-41 10.4v93.4c0 6.2-11.9 0-11.9 14s4.2 4.2 4.2 8.3c0 4.2 6.8 3.6 12.5-.5 5.7-4.1 11.9-2.6 11.9-6.8v-2.1c0-2.1-.5-4.2-2.1-5.7l-8.8-6.8c-3.6-3.1 7.3-2.6 15.1 2.1l109.6 6.7c4.2-3.1 7.3-8.8 7.3-13V65.1l-12.5-8.5z"/>
      <path fill="black" d="M129.3 143.7l44.7-71 6.2 4.2v112.4h-3.1l-4.2.5v-91L152.1 131.7l-22.8 12z"/>
    </svg>
  );
}

export function SlackIconOfficial({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid">
      <path fill="#e01e5a" d="M53.8 161.3c0 14.8-12 26.8-26.8 26.8S.2 176.1.2 161.3s12-26.8 26.8-26.8h26.8v12.9z"/>
      <path fill="#e01e5a" d="M67.2 161.3c0-14.8 12-26.8 26.8-26.8s26.8 12 26.8 26.8v67c0 14.8-12 26.8-26.8 26.8s-26.8-12-26.8-26.8v-67z"/>
      <path fill="#36c5f0" d="M94.1 53.8c-14.8 0-26.8-12-26.8-26.8S79.3.2 94.1.2s26.8 12 26.8 26.8v26.8h-12.9z"/>
      <path fill="#36c5f0" d="M94.1 67.2c14.8 0 26.8 12 26.8 26.8s-12 26.8-26.8 26.8H27c-14.8 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8h67.1z"/>
      <path fill="#2eb67d" d="M202.2 94.7c0-14.8 12-26.8 26.8-26.8s26.8 12 26.8 26.8-12 26.8-26.8 26.8h-26.8V94.7z"/>
      <path fill="#2eb67d" d="M188.8 94.7c0 14.8-12 26.8-26.8 26.8s-26.8-12-26.8-26.8V27.7c0-14.8 12-26.8 26.8-26.8s26.8 12 26.8 26.8v67z"/>
      <path fill="#ecb22e" d="M161.9 202.2c14.8 0 26.8 12 26.8 26.8s-12 26.8-26.8 26.8-26.8-12-26.8-26.8v-26.8h12.9z"/>
      <path fill="#ecb22e" d="M161.9 188.8c-14.8 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8h67.1c14.8 0 26.8 12 26.8 26.8s-12 26.8-26.8 26.8h-67.1z"/>
    </svg>
  );
}

export function LinkedInIconOfficial({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid">
      <path fill="#0077b5" d="M256 256h-60v-94.3c0-22.5-.4-51.5-31.4-51.5-31.4 0-36.2 24.5-36.2 49.9V256h-60V64h57.6v26.2h.8c8-15.2 27.6-31.2 56.8-31.2 60.8 0 72 40 72 92.1V256zM28.4 64h60v192h-60V64zM58.4 0c19.2 0 34.8 15.6 34.8 34.8s-15.6 34.8-34.8 34.8S23.6 54 23.6 34.8 39.2 0 58.4 0z"/>
    </svg>
  );
}

export function DiscordIconOfficial({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 199" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid">
      <path fill="#5865f2" d="M216.9 16.6A208.5 208.5 0 00164 0c-2.3 4.1-4.9 9.6-6.8 14q-29.5-4.4-58.5 0c-1.8-4.4-4.5-9.9-6.8-14a207.8 207.8 0 00-52.9 16.6C5.6 67.1-3.4 116.4 1.1 165c22.2 16.6 43.7 26.6 64.8 33.2 5.1-6.9 9.4-14.7 12.8-22.9-7.6-2.9-14.9-6.4-21.8-10.6l5.4-4.2c42.1 19.7 87.9 19.7 129.5 0l5.4 4.2c-7 4.2-14.3 7.8-21.9 10.7 3.4 8.2 7.7 16 12.8 22.8 21.1-6.6 42.6-16.6 64.8-33.2 5.3-56.3-9.1-105.1-38.1-148.4M85.5 135.1c-12.6 0-23-11.8-23-26.2s10.1-26.2 23-26.2 23.2 11.8 23 26.2c0 14.4-10.1 26.2-23 26.2m85 0c-12.6 0-23-11.8-23-26.2s10.1-26.2 23-26.2 12.9 0 23.2 11.8s-.2 26.2-13 26.2"/>
    </svg>
  );
}

export function XIconOfficial({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid">
      <path fill="var(--text-primary)" d="M149.1 108.4L242.3 0h-22.1l-81 94.1L74.6 0H0l97.8 142.3L0 256h22.1l85.5-99.4L183.7 256h72.3l-106.9-147.6zm-30.3 35.2l-9.9-14.2L30 16.7h33.9l63.6 91 9.9 14.2 82.7 118.3h-33.9l-67.5-96.5z"/>
    </svg>
  );
}

export function DropboxIconOfficial({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid">
      <path fill="#0061ff" d="M64 25.1l64 41.5-64 41.5L0 66.6 64 25.1zM192 25.1l64 41.5-64 41.5-64-41.5 64-41.5zM0 149.6l64-41.5 64 41.5-64 41.5L0 149.6zM192 108.1l64 41.5-64 41.5-64-41.5 64-41.5zM64 201l64 41.5 64-41.5-64-41.5L64 201z"/>
    </svg>
  );
}

export function OutlookIconOfficial({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path fill="#0072C6" d="M128 0c70.7 0 128 57.3 128 128s-57.3 128-128 128S0 198.7 0 128 57.3 0 128 0z"/>
      <path fill="#fff" d="M185 70h-94c-11 0-20 9-20 20v76c0 11 9 20 20 20h94c11 0 20-9 20-20V90c0-11-9-20-20-20zm-4 76l-43-30-43 30V90l43 30 43-30v56z"/>
    </svg>
  );
}

export function AsanaIconOfficial({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path fill="#F95D5C" d="M12 1.621a5.19 5.19 0 10.001 10.38 5.19 5.19 0 00-.001-10.38zm-6.931 10.74a5.19 5.19 0 10.001 10.38 5.19 5.19 0 00-.001-10.38zm13.862 0a5.19 5.19 0 10.001 10.38 5.19 5.19 0 00-.001-10.38z"/>
    </svg>
  );
}

export function TrelloIconOfficial({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path fill="#0079BF" d="M18.545 0H5.455C2.442 0 0 2.442 0 5.455v13.09C0 21.558 2.442 24 5.455 24h13.09C21.558 24 24 21.558 24 18.545V5.455C24 2.442 21.558 0 18.545 0zM9.545 16.145c0 1.137-.921 2.059-2.059 2.059H5.182c-1.138 0-2.059-.922-2.059-2.059V5.455c0-1.137.921-2.059 2.059-2.059h2.304c1.138 0 2.059.922-2.059 2.059v10.69zM18.818 11.5c0 1.137-.921 2.059-2.059 2.059h-2.304c-1.138 0-2.059-.922-2.059-2.059V5.455c0-1.137.921-2.059 2.059-2.059h2.304c1.138 0 2.059.922-2.059 2.059V11.5z"/>
    </svg>
  );
}

export function LinearIconOfficial({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path fill="#5E6AD2" d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 1.5c5.8 0 10.5 4.7 10.5 10.5S17.8 22.5 12 22.5 1.5 17.8 1.5 12 6.2 1.5 12 1.5zm-5.25 4.5l-1.06 1.06 10.5 10.5 1.06-1.06L6.75 6zm0 4.5l-1.06 1.06 6 6 1.06-1.06-6-6zm4.5-4.5l-1.06 1.06 6 6 1.06-1.06-6-6z"/>
    </svg>
  );
}

export function ClickUpIconOfficial({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path fill="#7B68EE" d="M12 0l-5.4 4.8 1.2 1.2 4.2-3.6 4.2 3.6 1.2-1.2L12 0zm-7.2 12c0 4.2 3.6 7.2 7.2 7.2s7.2-3 7.2-7.2h-2.4c0 3-1.8 4.8-4.8 4.8s-4.8-1.8-4.8-4.8H4.8z"/>
    </svg>
  );
}

export function VercelIconOfficial({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path fill="#000000" d="M24 22.525H0L12 1.475l12 21.05z"/>
    </svg>
  );
}


export function NetlifyIconOfficial({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
      <path fill="#25C7B7" d="M128 0L256 128L128 256L0 128L128 0z"/>
      <path fill="#fff" d="M128 40L216 128L128 216L40 128L128 40z" opacity="0.4"/>
    </svg>
  );
}

export function SupabaseIconOfficial({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path fill="#3ECF8E" d="M21.362 9.354H12V.396L2.638 14.646H12v8.958l9.362-14.25z"/>
    </svg>
  );
}

export function SentryIconOfficial({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path fill="#362D59" d="M11.983 0l-2.616 1.341-3.328 1.708L0 6.13l.366 3.012 3.12 1.624 3.011-1.545-2.094-.486-.33-1.63 3.328-1.707 3.328-1.708 3.328 1.708 3.328 1.707-1.127 5.568h3.328L24 6.13l-6.04-3.081-3.328-1.708L12.016 0h-.033zM10.42 10.373l-1.127 5.568h3.328l1.127-5.568h-3.328zm-3.328 1.707l-1.127 5.568h3.328l1.127-5.568h-3.328z"/>
    </svg>
  );
}


export function PostHogIconOfficial({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
      <rect width="256" height="256" rx="40" fill="#F0F0F0"/>
      <circle cx="128" cy="128" r="80" fill="#000"/>
    </svg>
  );
}

export function WebflowIconOfficial({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
      <path fill="#4353FF" d="M0 0h256v256H0z"/>
      <path fill="#fff" d="M50 50h156v156H50z" opacity="0.2"/>
    </svg>
  );
}

export function DevinIconOfficial({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
      <circle cx="128" cy="128" r="128" fill="#1A1A1A"/>
      <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fill="#fff" fontSize="120" fontWeight="bold">D</text>
    </svg>
  );
}

export function CursorIconOfficial({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
      <path fill="var(--text-primary)" d="M128 0L30 256l98-60 98 60L128 0z"/>
    </svg>
  );
}

export function CanvaIconOfficial({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
      <circle cx="128" cy="128" r="128" fill="#00C4CC"/>
      <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fill="#fff" fontSize="100" fontWeight="bold">C</text>
    </svg>
  );
}

export function GranolaIconOfficial({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
      <rect width="256" height="256" rx="40" fill="#6B4E31"/>
      <path d="M50 128h156" stroke="#fff" strokeWidth="20" strokeLinecap="round"/>
    </svg>
  );
}

export function StravaIconOfficial({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
      <path fill="#FC4C02" d="M153.8 179.9l-31.1-61.4-31.1 61.4h62.2zm44.2-86.4L153.8 0l-44.2 93.5h88.4z"/>
    </svg>
  );
}

export function FitbitIconOfficial({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
      <circle cx="128" cy="128" r="28" fill="#00B0B9"/>
      <circle cx="128" cy="64" r="20" fill="#00B0B9"/>
      <circle cx="128" cy="192" r="20" fill="#00B0B9"/>
      <circle cx="64" cy="128" r="20" fill="#00B0B9"/>
      <circle cx="192" cy="128" r="20" fill="#00B0B9"/>
    </svg>
  );
}

export function OuraIconOfficial({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
      <circle cx="128" cy="128" r="110" fill="none" stroke="var(--text-primary)" strokeWidth="20"/>
      <path d="M128 18L128 48" stroke="var(--text-primary)" strokeWidth="20" strokeLinecap="round"/>
    </svg>
  );
}

export function WithingsIconOfficial({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
      <path fill="#000" d="M128 0C57.3 0 0 57.3 0 128s57.3 128 128 128 128-57.3 128-128S198.7 0 128 0zm0 40c48.6 0 88 39.4 88 88s-39.4 88-88 88-88-39.4-88-88 39.4-88 88-88z"/>
      <circle cx="128" cy="128" r="40" fill="#000"/>
    </svg>
  );
}

export function MercuryIconOfficial({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
      <rect width="256" height="256" rx="40" fill="#000"/>
      <path d="M60 196V60h136v40H100v36h80v40h-80v60z" fill="#fff"/>
    </svg>
  );
}

export function RampIconOfficial({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
      <path fill="#1DB954" d="M0 128L128 0l128 128-128 128z"/>
      <rect x="110" y="60" width="36" height="136" fill="#fff"/>
    </svg>
  );
}

export function NavanIconOfficial({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
      <circle cx="128" cy="128" r="128" fill="#FF4F00"/>
      <path d="M128 60l68 116H60z" fill="#fff"/>
    </svg>
  );
}




