'use client';

import React from 'react';

interface EyesLogoProps {
  width?: number | string;
  height?: number | string;
  className?: string;
  glowColor?: string;
  showFlare?: boolean;
}

export default function EyesLogo({
  width = '100%',
  height = '100%',
  className = '',
  glowColor = '#3b82f6',
  showFlare = true,
}: EyesLogoProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 100 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    >
      <defs>
        {/* Glow filter for the lens flare spark */}
        <filter id="eyes-logo-flare" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        
        {/* Radial gradient for the flare background glow */}
        <radialGradient id="eyes-logo-glow-grad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="20%" stopColor={glowColor} stopOpacity="0.8" />
          <stop offset="60%" stopColor={glowColor} stopOpacity="0.2" />
          <stop offset="100%" stopColor={glowColor} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* --- Letter E (1) --- */}
      {/* Top Bar */}
      <path d="M 1 3 H 21 L 18.2 6 H 1 Z" fill="currentColor" />
      {/* Middle Bar */}
      <path d="M 1 10.5 H 21 L 18.2 13.5 H 1 Z" fill="currentColor" />
      {/* Bottom Bar */}
      <path d="M 1 18 H 21 L 18.2 21 H 1 Z" fill="currentColor" />

      {/* --- Letter Y --- */}
      {/* Left Branch */}
      <path d="M 27.5 3 H 30.5 L 38.5 12.5 H 35.5 Z" fill="currentColor" />
      {/* Right Branch */}
      <path d="M 46.5 3 H 49.5 L 41.5 12.5 H 38.5 Z" fill="currentColor" />
      {/* Stem */}
      <path d="M 38.5 12.5 H 41.5 V 21 H 38.5 Z" fill="currentColor" />

      {/* --- Letter E (2) --- */}
      {/* Top Bar */}
      <path d="M 53 3 H 73 L 70.2 6 H 53 Z" fill="currentColor" />
      {/* Middle Bar */}
      <path d="M 53 10.5 H 73 L 70.2 13.5 H 53 Z" fill="currentColor" />
      {/* Bottom Bar */}
      <path d="M 53 18 H 73 L 70.2 21 H 53 Z" fill="currentColor" />

      {/* --- Letter S --- */}
      <path
        d="M 79.5 3 H 99 V 6 H 80 V 10.5 H 99 V 18 L 96.2 21 H 77 V 18 H 96.2 V 13.5 H 77 V 6 L 79.5 3 Z"
        fill="currentColor"
      />

      {/* --- Lens Flare Spark at bottom of Y --- */}
      {showFlare && (
        <>
          {/* Outer glow aura */}
          <circle cx="40" cy="21.2" r="4.5" fill="url(#eyes-logo-glow-grad)" />
          {/* Core bright spark */}
          <circle cx="40" cy="21.2" r="0.8" fill="#ffffff" filter="url(#eyes-logo-flare)" />
        </>
      )}
    </svg>
  );
}
