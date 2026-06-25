'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import styles from './onboarding.module.css';

const ROLES = [
  { id: 'engineering', label: 'Engineering', icon: '💻' },
  { id: 'product', label: 'Product', icon: '📱' },
  { id: 'marketing', label: 'Marketing', icon: '📈' },
  { id: 'sales', label: 'Sales', icon: '🤝' },
  { id: 'executive', label: 'Executive', icon: '👔' },
  { id: 'design', label: 'Design', icon: '🎨' },
];

const GOALS = [
  { id: 'action_items', label: 'Auto-extract Action Items' },
  { id: 'missed_messages', label: 'Catch Urgent Messages I Missed' },
  { id: 'daily_summary', label: 'Get Daily Briefs & Summaries' },
  { id: 'search', label: 'Search Across All My Apps' },
];

const PERSONAS = [
  {
    id: 'brief',
    title: 'Direct & Brief ⚡',
    desc: 'Just the facts. Bullet points and bottom-line summaries.'
  },
  {
    id: 'analytical',
    title: 'Detailed & Analytical 🧠',
    desc: 'Deep dives. Give me the full context and reasoning.'
  }
];

const ROLE_CONNECTORS: Record<string, { id: string, label: string, icon: string }[]> = {
  engineering: [
    { id: 'github', label: 'GitHub', icon: '🐙' },
    { id: 'slack', label: 'Slack', icon: '💬' },
  ],
  product: [
    { id: 'notion', label: 'Notion', icon: '📓' },
    { id: 'linear', label: 'Linear', icon: '⚡' },
  ],
  marketing: [
    { id: 'twitter', label: 'X (Twitter)', icon: '🐦' },
    { id: 'notion', label: 'Notion', icon: '📓' },
  ],
  sales: [
    { id: 'google', label: 'Google Workspace', icon: '📧' },
    { id: 'slack', label: 'Slack', icon: '💬' },
  ],
  executive: [
    { id: 'google', label: 'Google Workspace', icon: '📧' },
    { id: 'notion', label: 'Notion', icon: '📓' },
  ],
  design: [
    { id: 'canva', label: 'Canva', icon: '🎨' },
    { id: 'slack', label: 'Slack', icon: '💬' },
  ]
};

export default function SandboxOnboarding() {
  const { supabase, updateUser } = useAuth();
  const [step, setStep] = useState(1);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null);
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  React.useEffect(() => {
    const savedStep = localStorage.getItem('onboarding_step');
    if (savedStep) setStep(parseInt(savedStep, 10));
    const role = localStorage.getItem('onboarding_role');
    if (role) setSelectedRole(role);
    const goals = localStorage.getItem('onboarding_goals');
    if (goals) setSelectedGoals(JSON.parse(goals));
    const persona = localStorage.getItem('onboarding_persona');
    if (persona) setSelectedPersona(persona);

    if (sessionStorage.getItem('eyes-post-connect')) {
       sessionStorage.removeItem('eyes-post-connect');
       if (!savedStep || savedStep === '1') setStep(2);
    }
    sessionStorage.setItem('eyes-is-onboarding', 'true');
    
    const fetchConnections = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const { data } = await supabase.from('auth_tokens').select('platform').eq('user_id', session.user.id);
      if (data) {
        setConnectedPlatforms(data.map((d: any) => d.platform));
      }
    };
    fetchConnections();
  }, [supabase]);

  React.useEffect(() => { localStorage.setItem('onboarding_step', step.toString()); }, [step]);
  React.useEffect(() => { if (selectedRole) localStorage.setItem('onboarding_role', selectedRole); }, [selectedRole]);
  React.useEffect(() => { localStorage.setItem('onboarding_goals', JSON.stringify(selectedGoals)); }, [selectedGoals]);
  React.useEffect(() => { if (selectedPersona) localStorage.setItem('onboarding_persona', selectedPersona); }, [selectedPersona]);

  const toggleGoal = (id: string) => {
    setSelectedGoals(prev => 
      prev.includes(id) 
        ? prev.filter(g => g !== id)
        : prev.length < 3 ? [...prev, id] : prev
    );
  };

  const router = useRouter();

  const handleNext = async () => {
    if (step < 4) {
      setStep(step + 1);
    } else {
      try {
        setIsSubmitting(true);
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        if (!token) throw new Error('No auth token found locally');

        const res = await fetch('/api/user/onboarding', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          credentials: 'include',
          body: JSON.stringify({ role: selectedRole, goals: selectedGoals, persona: selectedPersona })
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`API Error: ${res.status} - ${text}`);
        }
        
        // Clear local caches
        localStorage.removeItem('onboarding_step');
        localStorage.removeItem('onboarding_role');
        localStorage.removeItem('onboarding_goals');
        localStorage.removeItem('onboarding_persona');
        localStorage.removeItem('eyes-user-profile-v1');
        sessionStorage.removeItem('eyes-is-onboarding');

        // Smooth transition
        await updateUser({ onboardingCompleted: true });
        router.replace('/?view=readiness');
      } catch (err) {
        console.error('Save failed:', err);
        alert(`Failed to save preferences. See console for details.`);
        setIsSubmitting(false);
      }
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const isNextDisabled = () => {
    if (step === 1) return !selectedRole;
    if (step === 3) return selectedGoals.length === 0;
    if (step === 4) return !selectedPersona;
    return false;
  };

  const progress = (step / 4) * 100;

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.progressBar} style={{ width: `${progress}%` }} />
        
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div className={styles.header}>
                <h1 className={styles.title}>What is your primary domain?</h1>
                <p className={styles.subtitle}>This helps us prioritize the right data for you.</p>
              </div>

              <div className={styles.grid}>
                {ROLES.map(role => (
                  <div
                    key={role.id}
                    className={`${styles.optionCard} ${selectedRole === role.id ? styles.selected : ''}`}
                    onClick={() => setSelectedRole(role.id)}
                  >
                    <span className={styles.icon}>{role.icon}</span>
                    <span className={styles.label}>{role.label}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2_connectors"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div className={styles.header}>
                <h1 className={styles.title}>Connect your main tools</h1>
                <p className={styles.subtitle}>Let's start indexing your digital life securely in the background.</p>
              </div>

              <div className={styles.grid}>
                {selectedRole && ROLE_CONNECTORS[selectedRole]?.map(conn => {
                  const isConnected = connectedPlatforms.includes(conn.id);
                  return (
                  <button
                    key={conn.id}
                    className={`${styles.optionCard}`}
                    style={{ 
                      justifyContent: 'center', 
                      gap: '8px',
                      cursor: isConnected ? 'default' : 'pointer',
                      border: isConnected ? '1px solid #4ade80' : undefined,
                      background: isConnected ? 'rgba(74, 222, 128, 0.05)' : undefined 
                    }}
                    onClick={() => { if (!isConnected) window.location.href = `/api/connect/${conn.id}/start`; }}
                  >
                    <span className={styles.icon}>{isConnected ? '✓' : conn.icon}</span>
                    <span className={styles.label} style={{ color: isConnected ? '#15803d' : undefined }}>
                      {isConnected ? 'Connected' : `Connect ${conn.label}`}
                    </span>
                  </button>
                  );
                })}
              </div>
              <p style={{ marginTop: '24px', fontSize: '13px', color: '#666', textAlign: 'center' }}>
                You can always connect more tools later. Feel free to connect one and click Continue.
              </p>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3_goals"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div className={styles.header}>
                <h1 className={styles.title}>What do you want EYES to do?</h1>
                <p className={styles.subtitle}>Select up to 3 core superpowers.</p>
              </div>

              <div className={styles.goalList}>
                {GOALS.map(goal => (
                  <label
                    key={goal.id}
                    className={`${styles.goalRow} ${selectedGoals.includes(goal.id) ? styles.selected : ''}`}
                  >
                    <input 
                      type="checkbox"
                      className={styles.nativeCheckbox}
                      checked={selectedGoals.includes(goal.id)}
                      onChange={() => toggleGoal(goal.id)}
                    />
                    <span className={styles.goalText}>{goal.label}</span>
                  </label>
                ))}
              </div>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div
              key="step4_persona"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div className={styles.header}>
                <h1 className={styles.title}>Choose your AI's style</h1>
                <p className={styles.subtitle}>How should your assistant communicate with you?</p>
              </div>

              <div className={styles.personaGrid}>
                {PERSONAS.map(persona => (
                  <div
                    key={persona.id}
                    className={`${styles.personaCard} ${selectedPersona === persona.id ? styles.selected : ''}`}
                    onClick={() => setSelectedPersona(persona.id)}
                  >
                    <h3 className={styles.personaTitle}>{persona.title}</h3>
                    <p className={styles.personaDesc}>{persona.desc}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className={styles.actions}>
          {step > 1 ? (
            <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={handleBack}>
              Back
            </button>
          ) : (
            <div /> // Spacer
          )}
          
          <button 
            className={`${styles.btn} ${styles.btnPrimary}`} 
            onClick={handleNext}
            disabled={isNextDisabled() || isSubmitting}
          >
            {isSubmitting ? 'Securing your sanctum...' : step === 4 ? 'Finish Setup' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
