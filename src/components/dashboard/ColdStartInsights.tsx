import React from 'react';
import { PatternMatchResult } from '../../services/ai/pattern-matcher';
import styles from './ColdStartInsights.module.css';

interface Props {
  insights: PatternMatchResult[];
}

export const ColdStartInsights: React.FC<Props> = ({ insights }) => {
  if (!insights || insights.length === 0) {
    return null;
  }

  return (
    <div className={styles.container}>
      <h3 className={styles.header}>EYES Initial Graph Analysis</h3>
      <p className={styles.subtext}>
        Based on your first sync, I have detected a few structural shapes in your workflow. 
        These are early hypotheses—tell me if they land.
      </p>

      <div className={styles.grid}>
        {insights.map((match, index) => {
          const isSensitive = match.pattern.sensitivity === 'SENSITIVE';

          return (
            <div key={index} className={`${styles.card} ${isSensitive ? styles.sensitive : ''}`}>
              <div className={styles.cardHeader}>
                <span className={styles.patternName}>{match.pattern.name}</span>
                <span className={styles.confidence}>
                  {(match.confidence * 100).toFixed(0)}% Match
                </span>
              </div>
              
              <p className={styles.read}>&quot;{match.pattern.coldStartRead}&quot;</p>
              
              <div className={styles.evidenceBox}>
                <strong>Receipts (Anchors):</strong>
                <ul>
                  {match.evidence.map((ev, i) => (
                    <li key={i}>{ev}</li>
                  ))}
                </ul>
              </div>

              {isSensitive && (
                <div className={styles.sensitiveWarning}>
                  <em>Note: This is a sensitive read. EYES does not judge; it only reflects.</em>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
