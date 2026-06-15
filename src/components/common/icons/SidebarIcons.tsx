import React from 'react';

// Dual-layer icons: Outline (default) and Filled (hover)
export const ChatIcon = () => (
  <div className="icon-stack">
    <svg className="icon-outline" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 4v10a2 2 0 0 1-2 2h-5l-2 4-2-4H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <line x1="7" y1="6" x2="17" y2="6" />
      <line x1="7" y1="9" x2="17" y2="9" />
      <line x1="7" y1="12" x2="17" y2="12" />
      <line x1="3" y1="22" x2="13" y2="22" />
      <line x1="16" y1="22" x2="21" y2="22" />
    </svg>
    <svg className="icon-filled" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 4v10a2 2 0 0 1-2 2h-5l-2 4-2-4H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <line x1="7" y1="6" x2="17" y2="6" />
      <line x1="7" y1="9" x2="17" y2="9" />
      <line x1="7" y1="12" x2="17" y2="12" />
      <line x1="3" y1="22" x2="13" y2="22" />
      <line x1="16" y1="22" x2="21" y2="22" />
    </svg>
  </div>
);

export const ConnectorsIcon = () => (
  <div className="icon-stack">
    <svg className="icon-outline" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
    </svg>
    <svg className="icon-filled" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
    </svg>
  </div>
);

export const HistoryIcon = () => (
  <div className="icon-stack">
    <svg className="icon-outline" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8" />
      <path d="M8 7h8" />
      <path d="M8 12h4" />
      <circle cx="16.5" cy="16.5" r="3.5" />
      <line x1="19" y1="19" x2="22" y2="22" />
    </svg>
    <svg className="icon-filled" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8" />
      <path d="M8 7h8" />
      <path d="M8 12h4" />
      <circle cx="16.5" cy="16.5" r="3.5" />
      <line x1="19" y1="19" x2="22" y2="22" />
    </svg>
  </div>
);

export const PlusIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>
);

export const EyeIconSmall = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>
);

export const NodesIcon = () => (
  <div className="icon-stack">
    <svg className="icon-outline" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 3a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3Z"></path>
      <path d="M6 15a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3Z"></path>
      <path d="M18 15a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3Z"></path>
      <path d="M9 18h6"></path>
      <path d="M18 9v6"></path>
      <path d="M15 6 9 15"></path>
    </svg>
    <svg className="icon-filled" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 3a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3Z"></path>
      <path d="M6 15a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3Z"></path>
      <path d="M18 15a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3Z"></path>
      <path d="M9 18h6"></path>
      <path d="M18 9v6"></path>
      <path d="M15 6 9 15"></path>
    </svg>
  </div>
);
