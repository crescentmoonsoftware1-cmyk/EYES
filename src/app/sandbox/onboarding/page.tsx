'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

export default function SandboxOnboarding() {
  const [step, setStep] = useState(1);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null);

  const toggleGoal = (id: string) => {
    setSelectedGoals(prev => 
      prev.includes(id) 
        ? prev.filter(g => g !== id)
        : prev.length < 3 ? [...prev, id] : prev
    );
  };

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
    else {
      // Final submission (mocked for now)
      alert(`Onboarding Complete!\n\nRole: ${selectedRole}\nGoals: ${selectedGoals.join(', ')}\nPersona: ${selectedPersona}`);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const isNextDisabled = () => {
    if (step === 1) return !selectedRole;
    if (step === 2) return selectedGoals.length === 0;
    if (step === 3) return !selectedPersona;
    return false;
  };

  const progress = (step / 3) * 100;

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
              key="step2"
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
                  <div
                    key={goal.id}
                    className={`${styles.goalRow} ${selectedGoals.includes(goal.id) ? styles.selected : ''}`}
                    onClick={() => toggleGoal(goal.id)}
                  >
                    <div className={styles.goalCheck} />
                    <span className={styles.goalText}>{goal.label}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
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
            disabled={isNextDisabled()}
          >
            {step === 3 ? 'Finish Setup' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
