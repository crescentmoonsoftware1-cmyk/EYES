'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './LandingPage.module.css';
import IntegrationOrbit from './IntegrationOrbit';
import ScrollyTelling from './ScrollyTelling';
import Footer from './Footer';
import EyesLogo from '../common/EyesLogo';

const ease: [number, number, number, number] = [0.16, 1, 0.3, 1]; // Premium smooth ease

const navVariants = {
  hidden: { opacity: 0, y: -20 },
  visible: { opacity: 1, y: 0, transition: { duration: 1.2, ease } }
};

const textReveal = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 1.2, ease } }
};

const emReveal = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 1.2, ease, delay: 0.2 } }
};

const pillVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: { opacity: 1, y: 0, transition: { duration: 1.0, ease } }
};

const mockupVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 1.6, ease, delay: 0.1 } }
};

const cardVariants = {
  hidden: { opacity: 0, scale: 0.9, y: 15 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 1.2, ease } }
};

const sandboxCards = [
  { id: '1', type: 'MEETING', title: 'Product Sync', desc: 'Your team aligned on Q3 goals. You mentioned needing more time.', time: '2 hours ago', relevance: 98 },
  { id: '2', type: 'CODE', title: 'Auth Logic', desc: 'Snippet from last Tuesday matches your current problem.', time: '1 day ago', relevance: 94 },
  { id: '3', type: 'IDEA', title: 'Marketing Campaign', desc: 'You jotted this down at 2 AM last week. Ready to expand?', time: '3 days ago', relevance: 88 },
  { id: '4', type: 'DOCUMENT', title: 'Q3 Product Brief', desc: 'Detailed specifications for the memory extraction service API.', time: '4 days ago', relevance: 85 },
  { id: '5', type: 'CHAT', title: 'Design Handoff', desc: 'Sarah shared the Figma links for the new landing page styles.', time: '5 days ago', relevance: 82 },
  { id: '6', type: 'NOTE', title: 'Waitlist Launch Plan', desc: 'Checklist for the beta campaign. Limit spots to 100 on day one.', time: '6 days ago', relevance: 78 }
];

export default function LandingPage() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [searchQuery, setSearchQuery] = useState('');
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [scrolled, setScrolled] = useState(false);
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [logoHovered, setLogoHovered] = useState(false);

  // Monitor scroll for sticky navbar
  useEffect(() => {
    const handleScroll = () => {
      const scrollPos = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      
      // Toggle scrolled class
      setScrolled(scrollPos > 20);

      const diff = scrollPos - lastScrollY.current;

      // Only change visibility if the scroll movement is significant (prevents jitter)
      if (Math.abs(diff) > 5) {
        if (diff > 0 && scrollPos > 100) {
          setVisible(false); // scrolling down
        } else if (diff < 0) {
          setVisible(true); // scrolling up
        }
      }

      // Always show navbar at the very top of the page
      if (scrollPos <= 20) {
        setVisible(true);
      }
      
      lastScrollY.current = scrollPos;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // Load saved theme on hydration
  useEffect(() => {
    const savedTheme = localStorage.getItem('eyes-theme') as 'light' | 'dark';
    if (savedTheme) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
      const systemTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
      setTheme(systemTheme);
      document.documentElement.setAttribute('data-theme', systemTheme);
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('eyes-theme', nextTheme);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: x * 8, y: y * -8 }); // Subtler 3D parallax
  };

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 });
  };

  const filteredCards = sandboxCards.filter(card => 
    card.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    card.desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
    card.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className={styles.loginPageContainer}>
      {/* Background Mesh and Grid Overlays */}
      <div className={styles.meshCanvas} />
      <div className={styles.gridOverlay} />

      {/* Top Navigation */}
      <div className={`${styles.navWrapper} ${scrolled ? styles.navWrapperScrolled : ''} ${visible ? '' : styles.navWrapperHidden}`}>
        <motion.nav 
          className={`${styles.topNav} ${scrolled ? styles.topNavScrolled : ''}`}
          variants={navVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <div 
            className={styles.logoRow}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            style={{ cursor: 'pointer', color: 'var(--text-primary)' }}
          >
            <EyesLogo width={92} height={22} />
          </div>
          
          <div className={styles.navLinks} onMouseLeave={() => setHoveredLink(null)}>
            {[
              { name: 'Sanctum', href: '#sanctum', id: 'sanctum' },
              { name: 'Integrations', href: '#integrations', id: 'integrations' },
              { name: 'Process', href: '#process', id: 'process' }
            ].map((link) => (
              <a
                key={link.id}
                href={link.href}
                className={styles.navLinkItem}
                onMouseEnter={() => setHoveredLink(link.id)}
              >
                {hoveredLink === link.id && (
                  <motion.span
                    layoutId="navHoverPill"
                    className={styles.hoverPill}
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <span className={styles.navLinkLabel}>{link.name}</span>
              </a>
            ))}
          </div>

          <div className={styles.navActions}>
            <button 
              onClick={toggleTheme} 
              className={styles.themeToggle} 
              aria-label="Toggle Theme"
            >
              {theme === 'dark' ? (
                // Sun Icon
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                   <circle cx="12" cy="12" r="5"></circle>
                   <line x1="12" y1="1" x2="12" y2="3"></line>
                   <line x1="12" y1="21" x2="12" y2="23"></line>
                   <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                   <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                   <line x1="1" y1="12" x2="3" y2="12"></line>
                   <line x1="21" y1="12" x2="23" y2="12"></line>
                   <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                   <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                </svg>
              ) : (
                // Moon Icon
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                </svg>
              )}
            </button>
            <Link href="/login" className={styles.navBtn}>Get EYES</Link>
          </div>
        </motion.nav>
      </div>

      {/* Hero Section */}
      <section className={styles.heroSection} id="sanctum">
        <motion.div 
          className={styles.heroContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={{
            hidden: { opacity: 0 },
            visible: { opacity: 1, transition: { staggerChildren: 0.15 } }
          }}
        >

          {/* Main Cinematic Heading */}
          <motion.h1 className={styles.megaHeroTitle} variants={textReveal}>
            Build your <br />
            <motion.em variants={emReveal}>digital memory</motion.em>
          </motion.h1>

          <motion.p className={styles.heroSubText} variants={textReveal}>
            EYES learns from the apps you use and the context you share, so it can proactively recall conversations, notes, ideas, and files. Zero prompting required.
          </motion.p>

          {/* Call to Actions */}
          <motion.div className={styles.heroCtaRow} variants={pillVariants}>
            <Link href="/login" className={styles.heroPrimaryBtn}>Get early access</Link>
            <a href="#how-it-works" className={styles.heroSecondaryBtn}>See how it works</a>
          </motion.div>

          {/* Core Interactive Mockup Sandbox */}
          <motion.div 
            className={styles.mockupSandbox}
            onMouseMove={handleMouseMove} 
            onMouseLeave={handleMouseLeave}
            variants={mockupVariants}
          >
            {/* Interactive Search Console */}
            <div className={styles.sandboxConsole}>
              <div className={styles.consoleHeader}>
                <div className={styles.consoleDots}>
                  <span />
                  <span />
                  <span />
                </div>
                <div className={styles.consoleTitle}>EYES Sanctum Console</div>
                <div className={styles.consoleStatus}>
                  <span className={styles.statusDot} />
                  Active Curation
                </div>
              </div>

              {/* Main Panel View */}
              <div className={styles.consoleBody}>
                {/* Search Bar Input */}
                <div className={styles.consoleSearchRow}>
                  <div className={styles.searchBar}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8"></circle>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input 
                      type="text" 
                      placeholder="Search anything from your past... (e.g. 'auth logic', 'marketing')" 
                      className={styles.searchInput}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>

                {/* Dashboard Grid & Sidebar Mock */}
                <div className={styles.sanctumInterface}>
                  {/* Left Sidebar Mock */}
                  <div className={styles.sanctumSidebar}>
                    <div className={`${styles.sidebarItem} ${styles.sidebarItemActive}`} style={{ width: '80%' }} />
                    <div className={styles.sidebarItem} style={{ width: '60%' }} />
                    <div className={styles.sidebarItem} style={{ width: '70%' }} />
                    <div className={styles.sidebarItem} style={{ width: '50%' }} />
                  </div>

                  {/* Main Grid showing Dynamic Card Curation */}
                  <div className={styles.sanctumMain}>
                    <div className={styles.sanctumGrid}>
                      <AnimatePresence mode="popLayout">
                        {filteredCards.slice(0, 6).map((card) => (
                          <motion.div 
                            key={card.id} 
                            className={styles.sandboxCard}
                            layout
                            initial={{ opacity: 0, scale: 0.9, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: -10 }}
                            transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                          >
                            <div className={styles.cardHeaderRow}>
                              <span className={styles.cardTag}>{card.type}</span>
                              <span className={styles.cardTime}>{card.time}</span>
                            </div>
                            <h4 className={styles.cardTitle}>{card.title}</h4>
                            <p className={styles.cardDesc}>{card.desc}</p>
                            <div className={styles.cardFooter}>
                              <span className={styles.cardScore}>Relevance {card.relevance}%</span>
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Hover Floating Context Cards */}
            <motion.div 
              className={styles.floatingContextWrapper} 
              style={{ 
                transform: `perspective(1000px) rotateX(${tilt.y}deg) rotateY(${tilt.x}deg)` 
              }}
            >
              <motion.div className={`${styles.floatingCard} ${styles.fc1}`} variants={cardVariants}>
                <div className={styles.fcHeader}>MEETING</div>
                <div className={styles.fcTitle}>Product Sync</div>
                <div className={styles.fcSub}>Your team aligned on Q3 goals. You mentioned needing more time.</div>
              </motion.div>
              
              <motion.div className={`${styles.floatingCard} ${styles.fc2}`} variants={cardVariants}>
                <div className={styles.fcHeader}>CODE</div>
                <div className={styles.fcTitle}>Auth Logic</div>
                <div className={styles.fcSub}>Snippet from last Tuesday matches your current problem.</div>
              </motion.div>
              
              <motion.div className={`${styles.floatingCard} ${styles.fc3}`} variants={cardVariants}>
                <div className={styles.fcHeader}>IDEA</div>
                <div className={styles.fcTitle}>Marketing Campaign</div>
                <div className={styles.fcSub}>You jotted this down at 2 AM last week. Ready to expand?</div>
              </motion.div>
            </motion.div>
          </motion.div>
        </motion.div>
      </section>

      {/* Orbital Interactions & Scrollytelling Sections */}
      <div id="integrations"><IntegrationOrbit /></div>
      <div id="process"><ScrollyTelling /></div>

      {/* Footer */}
      <Footer />
    </div>
  );
}
