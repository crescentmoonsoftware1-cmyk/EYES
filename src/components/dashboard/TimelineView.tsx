'use client';

import React from 'react';
import styles from '../MainContent.module.css';

interface TimelineViewProps {
  onBack: () => void;
}

export function TimelineView({ onBack }: TimelineViewProps) {
  const [data, setData] = React.useState<{ year: string; count: number }[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch('/api/timeline-stats');
        const json = await response.json();
        if (json.timelineData) {
          setData(json.timelineData);
        }
      } catch (err) {
        console.error('Failed to load timeline:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  const maxCount = Math.max(...data.map(d => d.count), 100);
  const barWidth = 60;
  const gap = 40;
  const startX = 100;
  const graphHeight = 300;

  const formatNumber = (num: number) => {
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
  };

  return (
    <div className={styles.soloView}>
      <h2 className={styles.soloTitle}>TIME LINE</h2>
      
      {loading ? (
        <div className={styles.timelineLoading}>Indexing in progress...</div>
      ) : (
        <div className={styles.graphContainer}>
          <div className={styles.yAxisLabel}>Items Indexed</div>
          
          <svg viewBox="0 0 1000 350" className={styles.svgGraph}>
             <defs>
                <linearGradient id="barG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity="0.6" />
                </linearGradient>
             </defs>

             {/* Grid Lines */}
             <line x1="80" y1="20" x2="980" y2="20" stroke="var(--border-subtle)" strokeDasharray="4 4" />
             <line x1="80" y1="120" x2="980" y2="120" stroke="var(--border-subtle)" strokeDasharray="4 4" />
             <line x1="80" y1="220" x2="980" y2="220" stroke="var(--border-subtle)" strokeDasharray="4 4" />

             {/* Y-Axis Scale */}
             <text x="70" y="25" textAnchor="end" className={styles.axisScaleText}>{formatNumber(maxCount)}</text>
             <text x="70" y="125" textAnchor="end" className={styles.axisScaleText}>{formatNumber(maxCount * 0.66)}</text>
             <text x="70" y="225" textAnchor="end" className={styles.axisScaleText}>{formatNumber(maxCount * 0.33)}</text>
             <text x="70" y="325" textAnchor="end" className={styles.axisScaleText}>0</text>

             <line x1="80" y1="20" x2="80" y2="320" stroke="var(--border-primary)" strokeWidth="1" />
             <line x1="80" y1="320" x2="980" y2="320" stroke="var(--border-primary)" strokeWidth="1" />

             {/* Dynamic Bar Series */}
             {data.map((d, i) => {
                const h = (d.count / maxCount) * graphHeight;
                return (
                  <rect 
                    key={d.year}
                    x={startX + i * (barWidth + gap)} 
                    y={320 - h} 
                    width={barWidth} 
                    height={h} 
                    rx="4" 
                    fill="url(#barG)" 
                  />
                )
             })}
          </svg>
          <div className={styles.xAxisLabel}>Indexing Timeline (Year)</div>
          <div className={styles.timelineLabels}>
             {data.map((d) => (
                <span key={d.year} className={styles.timelineLabelItem}>
                  {d.year}
                </span>
             ))}
          </div>
        </div>
      )}
    </div>
  );
}

