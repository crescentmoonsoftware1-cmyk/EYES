'use client';

import { useEffect, useState } from 'react';

type Alert = {
  id: string;
  alert_type: string;
  title: string;
  body: string;
  created_at: string;
};

export function AlertsBanner() {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    const load = () =>
      fetch('/api/alerts')
        .then(r => r.json())
        .then(d => setAlerts(d.alerts ?? []))
        .catch(() => {});
    load();
    const interval = setInterval(load, 30000); // poll every 30s
    return () => clearInterval(interval);
  }, []);

  const dismiss = async (id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
    await fetch('/api/alerts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
  };

  if (!alerts.length) return null;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: '6px',
      padding: '8px 16px', background: 'rgba(255,165,0,0.07)',
      borderBottom: '1px solid rgba(255,165,0,0.2)',
    }}>
      {alerts.map(a => (
        <div key={a.id} style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: '12px', fontSize: '13px', color: '#e8d5a3',
        }}>
          <div>
            <strong style={{ color: '#fbbf24' }}>{a.title}</strong>
            <span style={{ color: '#9ca3af', marginLeft: '8px' }}>{a.body}</span>
          </div>
          <button
            onClick={() => dismiss(a.id)}
            style={{
              background: 'none', border: 'none', color: '#6b7280',
              cursor: 'pointer', fontSize: '16px', lineHeight: 1, flexShrink: 0,
            }}
            aria-label="Dismiss alert"
          >×</button>
        </div>
      ))}
    </div>
  );
}
