'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import './scrollytelling.css';

export default function ScrollyTelling() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const heroRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subRef = useRef<HTMLParagraphElement>(null);

  const ctaRef = useRef<HTMLElement>(null);
  const ctaEyebrowRef = useRef<HTMLDivElement>(null);
  const ctaTitleRef = useRef<HTMLHeadingElement>(null);
  const ctaBodyRef = useRef<HTMLParagraphElement>(null);
  const ctaButtonsRef = useRef<HTMLDivElement>(null);

  const [activeStep, setActiveStep] = useState(1);

  useGSAP(() => {
    gsap.registerPlugin(ScrollTrigger);

    // Set initial states
    gsap.set([titleRef.current, subRef.current], {
      opacity: 0,
      y: 40
    });

    ScrollTrigger.create({
      trigger: heroRef.current,
      start: 'top 80%',
      onEnter: () => {
        gsap.to([titleRef.current, subRef.current], {
          opacity: 1,
          y: 0,
          duration: 1,
          stagger: 0.25,
          ease: 'power3.out'
        });
      },
      onLeaveBack: () => {
        gsap.to([titleRef.current, subRef.current], {
          opacity: 0,
          y: 40,
          duration: 0.5,
          ease: 'power3.in'
        });
      }
    });

    // Animate the children of each .st-step when it scrolls into view
    const stepsElements = gsap.utils.toArray<HTMLDivElement>('.st-step');
    stepsElements.forEach((step) => {
      const children = step.children;
      gsap.set(children, { opacity: 0, y: 30 });

      ScrollTrigger.create({
        trigger: step,
        start: 'top 85%',
        onEnter: () => {
          gsap.to(children, {
            opacity: 1,
            y: 0,
            duration: 0.8,
            stagger: 0.15,
            ease: 'power3.out'
          });
        },
        onLeaveBack: () => {
          gsap.to(children, {
            opacity: 0,
            y: 30,
            duration: 0.5,
            ease: 'power3.in'
          });
        }
      });
    });

    // Animate the final CTA section
    gsap.set([ctaEyebrowRef.current, ctaTitleRef.current, ctaBodyRef.current, ctaButtonsRef.current], {
      opacity: 0,
      y: 40
    });

    ScrollTrigger.create({
      trigger: ctaRef.current,
      start: 'top 85%',
      onEnter: () => {
        gsap.to([ctaEyebrowRef.current, ctaTitleRef.current, ctaBodyRef.current, ctaButtonsRef.current], {
          opacity: 1,
          y: 0,
          duration: 1,
          stagger: 0.15,
          ease: 'power3.out'
        });
      },
      onLeaveBack: () => {
        gsap.to([ctaEyebrowRef.current, ctaTitleRef.current, ctaBodyRef.current, ctaButtonsRef.current], {
          opacity: 0,
          y: 40,
          duration: 0.5,
          ease: 'power3.in'
        });
      }
    });

  }, { scope: wrapperRef });

  // Custom Cursor Logic
  useEffect(() => {
    const cursor = cursorRef.current;
    const ring = ringRef.current;
    if (!cursor || !ring) return;

    let mx = 0, my = 0, rx = 0, ry = 0;
    let animationFrameId: number;

    const onMouseMove = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
    };

    document.addEventListener('mousemove', onMouseMove);

    const animCursor = () => {
      rx += (mx - rx) * 0.14;
      ry += (my - ry) * 0.14;
      cursor.style.left = mx + 'px';
      cursor.style.top = my + 'px';
      ring.style.left = rx + 'px';
      ring.style.top = ry + 'px';
      animationFrameId = requestAnimationFrame(animCursor);
    };

    animCursor();

    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // Ambient Canvas Logic
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = 0, H = 0;
    let particles: { x: number; y: number; r: number; vx: number; vy: number; o: number }[] = [];
    let animationFrameId: number;

    const resize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', resize);
    resize();

    particles = Array.from({ length: 70 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.5 + 0.4,
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.18,
      o: Math.random() * 0.5 + 0.1
    }));

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = W;
        if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H;
        if (p.y > H) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(224,106,59,${p.o})`;
        ctx.fill();
      });
      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // Intersection Observer for steps
  useEffect(() => {
    const steps = document.querySelectorAll('.st-step');

    const obs = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const n = parseInt(entry.target.getAttribute('data-step') || '1', 10);
        setActiveStep(n);
        if (sceneRef.current) {
          sceneRef.current.className = `st-scene st-state-${n}`;
        }
      });
    }, { rootMargin: '-40% 0px -40% 0px', threshold: 0.15 });

    steps.forEach(s => obs.observe(s));

    return () => {
      obs.disconnect();
    };
  }, []);

  return (
    <div className="scrollytelling-wrapper z-20" ref={wrapperRef}>
      {/* Ambient canvas */}
      <canvas ref={canvasRef} className="st-bg-canvas"></canvas>

      {/* Custom cursor */}
      <div ref={cursorRef} className="st-cursor"></div>
      <div ref={ringRef} className="st-cursor-ring"></div>

      {/* HERO */}
      <section className="st-hero" ref={heroRef}>
        <h1 className="st-hero-title" ref={titleRef}>Your Sanctum comes <br /> to life <em>in 3 steps</em></h1>
        <p className="st-hero-sub" ref={subRef}>{"We've replaced tedious prompting with an intuitive background process. EYES learns who you are across your digital life."}</p>
      </section>

      {/* SCROLLY SECTION */}
      <div className="st-container">
        {/* Left text */}
        <div className="st-text-column">

          {/* Step 1 */}
          <div className={`st-step ${activeStep === 1 ? 'is-active' : ''}`} data-step="1">
            <div className="st-step-tag">01 / Connection</div>
            <h2 className="st-step-title">Connect <br /> your apps</h2>
            <p className="st-step-body">Securely link your favourite services — from Slack to Notion. EYES gathers your context quietly in the background, never exposing your raw data to the cloud.</p>
            <div className="st-step-stat">
              <span className="st-num">12+</span>
              <span className="st-label">integrations available</span>
            </div>
            <div className="st-term-log">
              <div className="st-tl"><span className="st-em">$</span><span className="st-dim">eyes connect --all</span></div>
              <div className="st-tl"><span className="st-ok">✓</span><span className="st-dim">Slack authenticated</span></div>
              <div className="st-tl"><span className="st-ok">✓</span><span className="st-dim">Notion authenticated</span></div>
              <div className="st-tl"><span className="st-ok">✓</span><span className="st-dim">GitHub authenticated</span></div>
              <div className="st-tl"><span className="st-em">$</span><span className="st-dim">Syncing <span className="st-term-cursor-blink"></span></span></div>
            </div>
          </div>

          {/* Step 2 */}
          <div className={`st-step ${activeStep === 2 ? 'is-active' : ''}`} data-step="2">
            <div className="st-step-tag">02 / Synthesis</div>
            <h2 className="st-step-title">Train your <br /> Memory</h2>
            <p className="st-step-body">Refine your context passively. It evolves with your changing projects and priorities, becoming more like your second brain with every interaction.</p>
            <div className="st-step-stat">
              <span className="st-num">3.4M</span>
              <span className="st-label">nodes indexed</span>
            </div>
            <div className="st-progress-bar-wrap">
              <label>Indexing progress</label>
              <div className="st-progress-track"><div className="st-progress-fill" style={{ width: '78%' }}></div></div>
            </div>
            <div className="st-progress-bar-wrap" style={{ marginTop: '12px' }}>
              <label>Relationship mapping</label>
              <div className="st-progress-track"><div className="st-progress-fill" style={{ width: '91%', animationDelay: '0.2s' }}></div></div>
            </div>
            <div className="st-progress-bar-wrap" style={{ marginTop: '12px' }}>
              <label>Context weighting</label>
              <div className="st-progress-track"><div className="st-progress-fill" style={{ width: '63%', animationDelay: '0.4s' }}></div></div>
            </div>
          </div>

          {/* Step 3 */}
          <div className={`st-step ${activeStep === 3 ? 'is-active' : ''}`} data-step="3">
            <div className="st-step-tag">03 / Interaction</div>
            <h2 className="st-step-title">Unlock <br /> experiences</h2>
            <p className="st-step-body">Experience proactive curation. EYES instantly recalls exact citations, lost links, and important files before you even have to search for them.</p>
            <div className="st-step-stat">
              <span className="st-num">&lt;0.3s</span>
              <span className="st-label">avg recall latency</span>
            </div>
          </div>
        </div>

        {/* Right visual */}
        <div className="st-visual-column">


          <div ref={sceneRef} className={`st-scene st-state-${activeStep}`}>
            {/* Bottom layer: memory grid */}
            <div className="st-layer st-layer-bottom">
              <div className="st-memory-grid">
                <svg viewBox="0 0 300 300" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <pattern id="dots" x="0" y="0" width="30" height="30" patternUnits="userSpaceOnUse">
                      <circle cx="15" cy="15" r="1.5" fill="rgba(224,106,59,0.25)" />
                    </pattern>
                  </defs>
                  <rect width="300" height="300" fill="url(#dots)" />
                  <circle cx="45" cy="45" r="5" fill="rgba(224,106,59,0.5)" />
                  <circle cx="255" cy="45" r="5" fill="rgba(224,106,59,0.5)" />
                  <circle cx="150" cy="150" r="8" fill="var(--orange)" />
                  <circle cx="45" cy="255" r="5" fill="rgba(224,106,59,0.5)" />
                  <circle cx="255" cy="255" r="5" fill="rgba(224,106,59,0.5)" />
                  <line x1="45" y1="45" x2="150" y2="150" stroke="rgba(224,106,59,0.2)" strokeWidth="1" strokeDasharray="4 4" />
                  <line x1="255" y1="45" x2="150" y2="150" stroke="rgba(224,106,59,0.2)" strokeWidth="1" strokeDasharray="4 4" />
                  <line x1="45" y1="255" x2="150" y2="150" stroke="rgba(224,106,59,0.2)" strokeWidth="1" strokeDasharray="4 4" />
                  <line x1="255" y1="255" x2="150" y2="150" stroke="rgba(224,106,59,0.2)" strokeWidth="1" strokeDasharray="4 4" />
                </svg>
              </div>
            </div>

            {/* Mid layer: core + wires */}
            <div className="st-layer st-layer-mid">
              <div className="st-wire st-wire-1"></div>
              <div className="st-wire st-wire-2"></div>
              <div className="st-wire st-wire-3"></div>
              <div className="st-wire st-wire-4"></div>
              <div className="st-core-node">
                <svg viewBox="0 0 24 24">
                  <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
                </svg>
                <div className="st-core-ring-1"></div>
                <div className="st-core-ring-2"></div>
              </div>
            </div>

            {/* Top layer: app icons */}
            <div className="st-layer st-layer-top">
              <div className="st-app-icon st-app-notion">
                <svg viewBox="13.38 3.2 485.44 505.7" fill="currentColor">
                  <path d="m186.84 13.95c-79.06 5.85-146.27 11.23-149.43 11.86-8.86 1.58-16.92 7.59-20.71 15.5l-3.32 6.96.32 165.88.47 165.88 5.06 10.28c2.85 5.69 22.14 32.26 43.17 59.61 41.59 53.92 44.59 56.93 60.4 58.51 4.59.47 39.06-1.11 76.38-3.32 37.48-2.37 97.56-6.01 133.62-8.06 154.01-9.35 146.1-8.56 154.95-16.15 11.07-9.17 10.28 5.85 10.75-195.76.32-170.94.16-182.16-2.37-187.38-3-5.85-8.38-9.96-78.59-59.3-46.96-32.89-50.28-34.63-71.32-34.95-8.69-.31-80.48 4.43-159.38 10.44zm177.73 21.66c6.64 3 55.19 36.84 62.3 43.33 1.9 1.9 2.53 3.48 1.58 4.43-2.21 1.9-302.66 19.77-311.35 18.5-3.95-.63-9.8-3-13.12-5.22-13.76-9.33-47.91-37.32-47.91-39.37 0-5.38-1.11-5.38 132.83-15.02 25.62-1.74 67.68-4.9 93.3-6.96 55.49-4.43 72.1-4.27 82.37.31zm95.51 86.5c2.21 2.21 4.11 6.48 4.74 10.59.47 3.8.79 74.64.47 157.18-.47 141.68-.63 150.54-3.32 154.65-1.58 2.53-4.74 5.22-7.12 6.01-6.63 2.69-321.46 20.56-327.94 18.66-3-.79-7.12-3.32-9.33-5.53l-3.8-4.11-.47-152.75c-.32-107.21 0-154.65 1.27-158.92.95-3.16 3.32-6.96 5.38-8.22 2.85-1.9 21.51-3.48 85.71-7.27 45.07-2.53 114.8-6.8 154.81-9.17 95.17-5.86 94.86-5.86 99.6-1.12z"/>
                  <path d="m375.48 174.45c-17.08 1.11-32.26 2.69-34 3.64-5.22 2.69-8.38 7.12-9.01 12.18-.47 5.22 1.11 5.85 18.18 7.91l7.43.95v67.52c0 40.16-.63 66.73-1.42 65.94-.79-.95-23.24-35.1-49.97-75.9-26.72-40.95-48.86-74.64-49.18-74.95-.32-.32-17.71.63-38.58 2.06-25.62 1.74-39.69 3.32-42.54 4.9-4.59 2.37-9.65 10.75-9.65 16.29 0 3.32 6.01 5.06 18.66 5.06h6.64v194.18l-10.75 3.32c-8.38 2.53-11.23 4.11-12.65 7.27-2.53 5.38-2.37 10.28.16 10.28.95 0 18.82-1.11 39.37-2.37 40.64-2.37 45.22-3.48 49.49-11.86 1.27-2.53 2.37-5.22 2.37-6.01 0-.63-5.53-2.53-12.18-4.11-6.8-1.58-13.6-3.16-15.02-3.48-2.69-.79-2.85-5.69-2.85-73.69v-72.9l48.07 75.43c50.44 79.06 56.77 88.08 64.52 92.03 9.65 5.06 34.16 1.58 46.49-6.48l3.8-2.37.32-107.84.47-108 8.38-1.58c9.96-1.9 14.55-6.48 14.55-14.39 0-5.06-.32-5.38-5.06-5.22-2.83.13-19.12 1.08-36.04 2.19z"/>
                </svg>
                <span className="st-icon-label">Notion</span>
              </div>
              <div className="st-app-icon st-app-gmail">
                <svg viewBox="0 0 256 193" preserveAspectRatio="xMidYMid">
                  <path fill="#4285f4" d="M58.2 192V93.1L27.5 65.1 0 49.5v125.1c0 9.7 7.8 17.5 17.5 17.5h40.7z"/>
                  <path fill="#34a853" d="M197.8 192h40.7c9.7 0 17.5-7.8 17.5-17.5V49.5l-31.2 17.8-27 25.8V192z"/>
                  <path fill="#ea4335" d="M58.2 93.1V17.5L128 70l69.8-52.5v75.6L128 145.5l-69.8-52.4z"/>
                  <path fill="#fbbc04" d="M197.8 17.5V93.1l58.2-43.6V26.2c0-21.6-24.6-33.9-41.9-20.9l-16.3 12.2z"/>
                  <path fill="#c5221f" d="M0 49.5l26.8 20.1 31.4 23.5V17.5L41.9 5.3C24.6-7.7 0 4.6 0 26.2v23.3z"/>
                </svg>
                <span className="st-icon-label">Gmail</span>
              </div>
              <div className="st-app-icon st-app-discord">
                <svg viewBox="0 0 24 24" fill="#7289DA"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" /></svg>
                <span className="st-icon-label">Discord</span>
              </div>
              <div className="st-app-icon st-app-github">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.418 22 12c0-5.523-4.477-10-10-10z" /></svg>
                <span className="st-icon-label">GitHub</span>
              </div>
            </div>

            {/* Output cards (state 3) */}
            <div className="st-output-card st-card-1">
              <div className="st-card-icon">🗓️</div>
              <div><div className="st-card-title">Meeting queued</div><div className="st-card-sub">Calendar · just now</div></div>
            </div>
            <div className="st-output-card st-card-2">
              <div className="st-card-icon">📄</div>
              <div><div className="st-card-title">Citation surfaced</div><div className="st-card-sub">Slack · #design</div></div>
            </div>
            <div className="st-output-card st-card-3">
              <div className="st-card-icon">📁</div>
              <div><div className="st-card-title">Design file</div><div className="st-card-sub">Notion · yesterday</div></div>
            </div>
            <div className="st-output-card st-card-4">
              <div className="st-card-icon">🔗</div>
              <div><div className="st-card-title">Issue link</div><div className="st-card-sub">GitHub · #247</div></div>
            </div>

            {/* Step pips */}
            <div className="st-step-hud">
              <div className={`st-step-pip ${activeStep === 1 ? 'active' : ''}`}></div>
              <div className={`st-step-pip ${activeStep === 2 ? 'active' : ''}`}></div>
              <div className={`st-step-pip ${activeStep === 3 ? 'active' : ''}`}></div>
            </div>

          </div>
        </div>
      </div>

      {/* CLOSING CTA */}
      <section className="st-cta-section" ref={ctaRef}>
        <div className="st-cta-eyebrow" ref={ctaEyebrowRef}>Ready to begin?</div>
        <h2 className="st-cta-title" ref={ctaTitleRef}>Your second brain <br /> is <em>waiting for you</em></h2>
        <p className="st-cta-body" ref={ctaBodyRef}>Join the waitlist and be the first to experience proactive recall built around how you actually think and work.</p>
        <div ref={ctaButtonsRef}>
          <a href="#" className="st-cta-btn">Get early access</a>
          <a href="#" className="st-cta-ghost">See how it works</a>
        </div>
      </section>
    </div>
  );
}
