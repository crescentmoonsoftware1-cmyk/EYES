import { ImageResponse } from 'next/og';

// Route segment config
export const runtime = 'edge';

// Image metadata
export const size = {
  width: 32,
  height: 32,
};
export const contentType = 'image/png';

// Favicon icon generation
export default function Icon() {
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
          borderRadius: '8px',
          border: '1px solid rgba(224, 106, 59, 0.4)',
        }}
      >
        {/* Simplified "E" logo icon */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          style={{ color: '#ffffff' }}
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
