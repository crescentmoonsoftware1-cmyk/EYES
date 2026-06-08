'use client';

import React, { useEffect, useState } from 'react';

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  format?: 'number' | 'percent';
}

export function AnimatedNumber({ value, duration = 1500, format = 'number' }: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let startTimestamp: number | null = null;
    const startValue = displayValue;
    const endValue = value;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      
      // Easing function (easeOutQuart) for that cinematic slow-down at the end
      const easeProgress = 1 - Math.pow(1 - progress, 4);
      
      setDisplayValue(Math.floor(startValue + (endValue - startValue) * easeProgress));
      
      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        setDisplayValue(endValue);
      }
    };

    window.requestAnimationFrame(step);
  }, [value, duration]); // We intentionally leave displayValue out of deps to allow chaining

  const formatted = format === 'percent' 
    ? `${displayValue}%`
    : displayValue.toLocaleString();

  return <span>{formatted}</span>;
}
