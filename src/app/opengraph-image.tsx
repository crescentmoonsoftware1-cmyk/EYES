import { ImageResponse } from 'next/og';

// Route segment config
export const runtime = 'edge';

// Image metadata
export const alt = 'EYES - Everything You Ever Said';
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

// Image generation
export default async function Image() {
  return new ImageResponse(
    (
      // Image HTML element matching EYES premium dark brand identity
      <div
        style={{
          background: '#050505',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          position: 'relative',
        }}
      >
        {/* Sleek radial background glow matching the Ember theme accent */}
        <div
          style={{
            position: 'absolute',
            width: '800px',
            height: '800px',
            background: 'radial-gradient(circle, rgba(224, 106, 59, 0.08) 0%, rgba(224, 106, 59, 0) 70%)',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
          }}
        />

        {/* Outer frame styling for premium finish */}
        <div
          style={{
            position: 'absolute',
            inset: '40px',
            border: '1px solid rgba(224, 106, 59, 0.1)',
            borderRadius: '16px',
            display: 'flex',
          }}
        />
        
        {/* Main Logo Container */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 10 }}>
          {/* EYES Logo SVG */}
          <svg
            width="420"
            height="100"
            viewBox="0 0 100 24"
            fill="none"
            style={{ color: '#ffffff' }}
          >
            {/* --- Letter E (1) --- */}
            <path d="M 1 3 H 21 L 18.2 6 H 1 Z" fill="currentColor" />
            <path d="M 1 10.5 H 21 L 18.2 13.5 H 1 Z" fill="currentColor" />
            <path d="M 1 18 H 21 L 18.2 21 H 1 Z" fill="currentColor" />

            {/* --- Letter Y --- */}
            <path d="M 27.5 3 H 30.5 L 38.5 12.5 H 35.5 Z" fill="currentColor" />
            <path d="M 46.5 3 H 49.5 L 41.5 12.5 H 38.5 Z" fill="currentColor" />
            <path d="M 38.5 12.5 H 41.5 V 21 H 38.5 Z" fill="currentColor" />

            {/* --- Letter E (2) --- */}
            <path d="M 53 3 H 73 L 70.2 6 H 53 Z" fill="currentColor" />
            <path d="M 53 10.5 H 73 L 70.2 13.5 H 53 Z" fill="currentColor" />
            <path d="M 53 18 H 73 L 70.2 21 H 53 Z" fill="currentColor" />

            {/* --- Letter S --- */}
            <path
              d="M 79.5 3 H 99 V 6 H 80 V 10.5 H 99 V 18 L 96.2 21 H 77 V 18 H 96.2 V 13.5 H 77 V 6 L 79.5 3 Z"
              fill="currentColor"
            />
            
            {/* Lens flare spark at bottom of Y in white/amber */}
            <circle cx="40" cy="21.2" r="1.2" fill="#E06A3B" />
            <circle cx="40" cy="21.2" r="0.6" fill="#ffffff" />
          </svg>

          {/* Premium Tagline */}
          <div
            style={{
              fontSize: 22,
              fontWeight: 400,
              color: '#d9cbc4',
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
              marginTop: 28,
              fontFamily: 'sans-serif',
              opacity: 0.85,
            }}
          >
            Everything You Ever Said
          </div>
        </div>

        {/* Small brand element at the bottom */}
        <div
          style={{
            position: 'absolute',
            bottom: '70px',
            fontSize: '12px',
            color: 'rgba(255, 255, 255, 0.25)',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            zIndex: 10,
          }}
        >
          Your Digital Memory Dashboard
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
