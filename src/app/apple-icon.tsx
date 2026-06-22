import { ImageResponse } from 'next/og';

// Route segment config
export const runtime = 'edge';

// Image metadata
export const size = {
  width: 180,
  height: 180,
};
export const contentType = 'image/png';

// Apple Touch Icon generation
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#050505',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          position: 'relative',
        }}
      >
        {/* Glow behind logo */}
        <div
          style={{
            position: 'absolute',
            width: '140px',
            height: '140px',
            background: 'radial-gradient(circle, rgba(224, 106, 59, 0.12) 0%, rgba(224, 106, 59, 0) 70%)',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
          }}
        />

        {/* Small border frame */}
        <div
          style={{
            position: 'absolute',
            inset: '10px',
            border: '1px solid rgba(224, 106, 59, 0.15)',
            borderRadius: '24px',
            display: 'flex',
          }}
        />

        {/* Simplified "E" logo icon */}
        <svg
          width="90"
          height="90"
          viewBox="0 0 24 24"
          fill="none"
          style={{ color: '#ffffff', zIndex: 10 }}
        >
          <path d="M 2 4 H 22 L 19 8 H 2 Z" fill="currentColor" />
          <path d="M 2 10 H 22 L 19 14 H 2 Z" fill="currentColor" />
          <path d="M 2 16 H 22 L 19 20 H 2 Z" fill="currentColor" />
        </svg>
      </div>
    ),
    {
      ...size,
    }
  );
}
