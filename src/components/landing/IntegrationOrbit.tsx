'use client';

import React, { useRef, useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { IntegrationIcon, IntegrationType } from './IntegrationIcon';

interface NodeConfig {
  type: IntegrationType;
  x: number;      // Base relative X from center
  y: number;      // Base relative Y from center
  depth: number;  // Parallax depth multiplier (0.4 to 1.5)
}

const NODES: NodeConfig[] = [
  { type: 'Slack', x: -280, y: -60, depth: 1.2 },
  { type: 'Notion', x: -120, y: 80, depth: 0.8 },
  { type: 'GitHub', x: 0, y: -100, depth: 1.4 }, // Primary Source Node
  { type: 'Supabase', x: 140, y: -20, depth: 0.6 },
  { type: 'Gmail', x: 280, y: 80, depth: 1.1 },
  { type: 'Discord', x: -240, y: 100, depth: 0.7 },
  { type: 'Linear', x: 100, y: 120, depth: 1.3 },
  { type: 'ClickUp', x: 220, y: -120, depth: 0.9 }
];

const SOURCE_INDEX = 2; // GitHub index

const CONNECTIONS = [
  [0, 1], // Slack to Notion
  [1, 5], // Notion to Discord
  [5, 6], // Discord to Linear
  [6, 4], // Linear to Gmail
  [4, 3], // Gmail to Supabase
  [3, 7], // Supabase to ClickUp
  [7, 2], // ClickUp to GitHub
  [2, 0]  // GitHub to Slack
];

export default function IntegrationOrbit() {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLHeadingElement>(null);
  const subTextRef = useRef<HTMLParagraphElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);

  const cardsRef = useRef<(HTMLDivElement | null)[]>([]);
  const staticLinesRef = useRef<(SVGLineElement | null)[]>([]);
  const cursorLinesRef = useRef<(SVGLineElement | null)[]>([]);

  // Animated properties tracking for burst sequence
  const anims = useRef(NODES.map(() => ({
    x: NODES[SOURCE_INDEX].x,
    y: NODES[SOURCE_INDEX].y,
    scale: 0,
    opacity: 0
  })));

  const mouseCoords = useRef({
    targetX: 0,
    targetY: 0,
    currentX: 0,
    currentY: 0,
    active: false
  });

  useGSAP(() => {
    gsap.registerPlugin(ScrollTrigger);

    // Initial state for text
    gsap.set(textRef.current, { opacity: 0, y: 30, filter: 'blur(5px)' });
    if (subTextRef.current) {
      gsap.set(subTextRef.current.children, { opacity: 0, y: 15, filter: 'blur(3px)' });
    }

    // Header reveal
    gsap.to(textRef.current, {
      scrollTrigger: {
        trigger: containerRef.current,
        start: 'top 85%',
        toggleActions: 'play none none reverse'
      },
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      duration: 1,
      ease: 'power3.out',
    });

    if (subTextRef.current) {
      gsap.to(subTextRef.current.children, {
        scrollTrigger: {
          trigger: containerRef.current,
          start: 'top 80%',
          toggleActions: 'play none none reverse'
        },
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        duration: 0.6,
        stagger: 0.03,
        ease: 'power2.out',
      });
    }

    // --- Burst Sequence Animations ---
    const sourceNode = NODES[SOURCE_INDEX];
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: containerRef.current,
        start: 'top 70%',
        toggleActions: 'play none none reverse'
      }
    });

    // 1. Reveal the main source card (GitHub) first
    tl.to(anims.current[SOURCE_INDEX], {
      x: sourceNode.x,
      y: sourceNode.y,
      scale: 1,
      opacity: 1,
      duration: 0.8,
      ease: 'back.out(1.5)'
    });

    // 2. Burst all other cards out from behind the source card
    NODES.forEach((node, i) => {
      if (i === SOURCE_INDEX) return;

      tl.to(anims.current[i], {
        x: node.x,
        y: node.y,
        scale: 1,
        opacity: 1,
        duration: 1.2,
        ease: 'back.out(1.2)'
      }, '-=0.6'); // Staggered overlaps
    });

  }, { scope: containerRef });

  // Handle Mouse Coordinates relative to container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      mouseCoords.current.targetX = x;
      mouseCoords.current.targetY = y;
      mouseCoords.current.active = true;
    };

    const handleMouseLeave = () => {
      mouseCoords.current.active = false;
    };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  // Butter-Smooth Ticker Animation for 3D Parallax & Constellation Rendering
  useEffect(() => {
    let animId: number;

    const tick = () => {
      const container = containerRef.current;
      const scene = sceneRef.current;
      if (!container || !scene) {
        animId = requestAnimationFrame(tick);
        return;
      }

      const rect = scene.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const isMobile = window.innerWidth < 768;
      const layoutScale = isMobile ? 0.5 : 1.0;

      const coords = mouseCoords.current;

      // Smoothly interpolate mouse coords towards target with spring lag
      if (coords.active) {
        coords.currentX += (coords.targetX - coords.currentX) * 0.1;
        coords.currentY += (coords.targetY - coords.currentY) * 0.1;
      } else {
        // Slowly float back to center if inactive
        coords.currentX += (centerX + rect.left - rect.left - coords.currentX) * 0.05;
        coords.currentY += (centerY + rect.top - rect.top - coords.currentY) * 0.05;
      }

      // Track absolute positions of nodes for line rendering
      const actualNodePositions: ({ x: number; y: number; opacity: number } | null)[] = new Array(NODES.length).fill(null);
 
      NODES.forEach((node, i) => {
        const card = cardsRef.current[i];
        if (!card) return;
 
        const anim = anims.current[i];
 
        // Base coordinates animated by GSAP from center source card
        const bx = anim.x * layoutScale;
        const by = anim.y * layoutScale;
 
        // Parallax offset proportional to node depth (only active once revealed)
        const offsetX = (coords.currentX - centerX) * node.depth * 0.08 * anim.opacity;
        const offsetY = (coords.currentY - centerY) * node.depth * 0.08 * anim.opacity;
 
        const currentX = centerX + bx + offsetX;
        const currentY = centerY + by + offsetY;
 
        actualNodePositions[i] = { x: currentX, y: currentY, opacity: anim.opacity };
 
        // Apply transformations directly to the DOM for max performance
        gsap.set(card, {
          x: bx + offsetX,
          y: by + offsetY,
          opacity: anim.opacity,
          scale: anim.scale * (0.9 + node.depth * 0.15),
          zIndex: Math.round(100 + node.depth * 10)
        });
      });
 
      // Update Static Constellation Lines in SVG
      CONNECTIONS.forEach((pair, idx) => {
        const line = staticLinesRef.current[idx];
        if (!line) return;
 
        const p1 = actualNodePositions[pair[0]];
        const p2 = actualNodePositions[pair[1]];
        if (p1 && p2) {
          line.setAttribute('x1', p1.x.toString());
          line.setAttribute('y1', p1.y.toString());
          line.setAttribute('x2', p2.x.toString());
          line.setAttribute('y2', p2.y.toString());
 
          // Connect line opacity to node reveal values
          const opacityVal = p1.opacity * p2.opacity * 0.6;
          line.setAttribute('opacity', opacityVal.toString());
        }
      });
 
      // Update Dynamic Active Magnetic Cursor Lines (connect to nearest 3 nodes)
      if (coords.active && actualNodePositions.some(p => p !== null)) {
        // Compute distances to cursor for defined positions
        const distances = actualNodePositions
          .map((pos, idx) => {
            if (!pos) return null;
            const dx = pos.x - coords.currentX;
            const dy = pos.y - coords.currentY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            return { idx, dist, pos };
          })
          .filter((item): item is { idx: number; dist: number; pos: { x: number; y: number; opacity: number } } => item !== null);
 
        // Sort to get 3 closest nodes
        distances.sort((a, b) => a.dist - b.dist);
 
        for (let i = 0; i < 3; i++) {
          const line = cursorLinesRef.current[i];
          if (!line) continue;
 
          const match = distances[i];
          if (!match) {
            line.setAttribute('opacity', '0');
            continue;
          }
          const maxDistance = isMobile ? 200 : 350;
          const proximity = Math.max(0, 1 - match.dist / maxDistance);
 
          // Only show connection if node is mostly visible/revealed
          const finalOpacity = proximity * 0.75 * match.pos.opacity;
 
          line.setAttribute('x1', coords.currentX.toString());
          line.setAttribute('y1', coords.currentY.toString());
          line.setAttribute('x2', match.pos.x.toString());
          line.setAttribute('y2', match.pos.y.toString());
          line.setAttribute('opacity', finalOpacity.toString());
        }
 
        // Hide unused cursor lines if any
        for (let i = 3; i < cursorLinesRef.current.length; i++) {
          const line = cursorLinesRef.current[i];
          if (line) line.setAttribute('opacity', '0');
        }
      } else {
        // Fade out all cursor lines when inactive
        cursorLinesRef.current.forEach((line) => {
          if (line) {
            const currentOpacity = parseFloat(line.getAttribute('opacity') || '0');
            if (currentOpacity > 0.01) {
              line.setAttribute('opacity', (currentOpacity * 0.85).toString());
            } else {
              line.setAttribute('opacity', '0');
            }
          }
        });
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full bg-[var(--bg-primary)] text-[var(--text-primary)] relative z-10 pt-20 pb-20 flex flex-col items-center overflow-hidden transition-colors duration-300 select-none"
    >
      {/* Background Glows for Constellation Nebula */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-[radial-gradient(ellipse_at_center,rgba(224,106,59,0.06),transparent_60%)] pointer-events-none z-0" />
      <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-[radial-gradient(circle,rgba(0,163,184,0.04),transparent_70%)] pointer-events-none z-0" />

      {/* ── Top Text Block ── */}
      <h2
        ref={textRef}
        className="text-[clamp(44px,5.5vw,72px)] md:text-[clamp(52px,7.5vw,88px)] font-sans text-[var(--text-primary)] tracking-[-0.03em] leading-[1.05] font-light text-center z-10"
      >
        <em className="font-serif italic text-[#E06A3B]">Integrations.</em>
      </h2>

      <p
        ref={subTextRef}
        className="font-serif text-[16px] md:text-[22px] text-[var(--text-secondary)] text-center max-w-[680px] leading-[1.6] flex flex-wrap justify-center gap-x-[6px] px-4 mt-4 mb-16 z-10"
      >
        {"Show me [X], and I'll show you [Y]. Turn back the pages. The answers are all there, you just couldn't see the ending when you were lost in the story.".split(" ").map((word, i) => (
          <React.Fragment key={i}>
            <span className="inline-block">{word}</span>
            {" "}
          </React.Fragment>
        ))}
      </p>

      {/* ── Interactive Constellation Board ── */}
      <div
        ref={sceneRef}
        className="w-full max-w-[1200px] h-[380px] md:h-[480px] relative flex items-center justify-center pointer-events-auto"
      >
        {/* SVG Drawing Canvas for Constellation Links */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
          <defs>
            {/* Active connection glow filter */}
            <filter id="active-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>

            {/* Neural line gradients */}
            <linearGradient id="static-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--border-primary)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="var(--border-subtle)" stopOpacity="0.1" />
            </linearGradient>
          </defs>

          {/* Static Background Constellation Lines */}
          {CONNECTIONS.map((_, idx) => (
            <line
              key={`static-${idx}`}
              ref={(el) => { staticLinesRef.current[idx] = el; }}
              className="stroke-[url(#static-grad)] stroke-[1px]"
            />
          ))}

          {/* Dynamic Active Magnetic Cursor Lines (Max 3 closest nodes) */}
          {Array.from({ length: 3 }).map((_, idx) => (
            <line
              key={`cursor-${idx}`}
              ref={(el) => { cursorLinesRef.current[idx] = el; }}
              className="stroke-[#E06A3B] stroke-[1.5px] opacity-0"
              filter="url(#active-glow)"
              strokeDasharray="4 2"
            />
          ))}
        </svg>

        {/* Constellation Integration Nodes */}
        {NODES.map((node, i) => (
          <div
            key={i}
            ref={(el) => { cardsRef.current[i] = el; }}
            className="absolute top-1/2 left-1/2 w-[120px] h-[120px] md:w-[150px] md:h-[150px] origin-center pointer-events-auto"
            style={{
              marginLeft: '-75px',
              marginTop: '-75px',
              willChange: 'transform, opacity'
            }}
          >
            <div
              className="w-full h-full rounded-[24px] md:rounded-[30px] border border-[var(--border-primary)] bg-[var(--bg-card)] backdrop-blur-md flex flex-col items-center justify-center transition-all duration-300 hover:border-[#E06A3B] hover:shadow-[0_16px_40px_rgba(224,106,59,0.12)] cursor-pointer group"
              style={{ boxShadow: '0 12px 36px rgba(0,0,0,0.04)' }}
            >
              <div className="flex flex-col items-center justify-center gap-3">
                <IntegrationIcon
                  type={node.type}
                  className="w-10 h-10 md:w-14 md:h-14 transition-transform duration-300 group-hover:scale-110"
                  active={true}
                />
                <span className="text-[var(--text-primary)] font-sans text-xs md:text-sm font-semibold tracking-wide opacity-80 group-hover:opacity-100 transition-opacity">
                  {node.type}
                </span>
              </div>

              {/* Subtle pulsing glow for constellation stars */}
              <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#E06A3B] opacity-40 group-hover:opacity-100 transition-opacity">
                <div className="absolute inset-0 rounded-full bg-[#E06A3B] animate-ping opacity-75" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
