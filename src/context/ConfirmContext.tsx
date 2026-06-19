'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'danger' | 'default';
  /** If set, user must type this exact string to enable the confirm button */
  requireTyping?: string;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

interface ConfirmContextType {
  openConfirm: (options: ConfirmOptions) => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const ConfirmContext = createContext<ConfirmContextType | null>(null);

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────

interface State {
  isOpen: boolean;
  options: ConfirmOptions | null;
  typedValue: string;
  isExecuting: boolean;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({
    isOpen: false,
    options: null,
    typedValue: '',
    isExecuting: false,
  });

  const openConfirm = useCallback((options: ConfirmOptions) => {
    setState({ isOpen: true, options, typedValue: '', isExecuting: false });
  }, []);

  const handleCancel = useCallback(() => {
    state.options?.onCancel?.();
    setState({ isOpen: false, options: null, typedValue: '', isExecuting: false });
  }, [state.options]);

  const handleConfirm = useCallback(async () => {
    if (!state.options) return;
    setState(s => ({ ...s, isExecuting: true }));
    try {
      await state.options.onConfirm();
    } finally {
      setState({ isOpen: false, options: null, typedValue: '', isExecuting: false });
    }
  }, [state.options]);

  const canConfirm =
    !state.isExecuting &&
    (!state.options?.requireTyping || state.typedValue === state.options.requireTyping);

  return (
    <ConfirmContext.Provider value={{ openConfirm }}>
      {children}

      {/* ── Modal overlay ───────────────────────────────────────────────────── */}
      {state.isOpen && state.options && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 99999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(8px)',
            animation: 'confirmFadeIn 0.15s ease-out',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) handleCancel(); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            style={{
              background: 'var(--bg-card, #111)',
              border: state.options.confirmVariant === 'danger'
                ? '1px solid rgba(239, 68, 68, 0.3)'
                : '1px solid var(--border-primary, rgba(255,255,255,0.1))',
              borderRadius: '16px',
              padding: '28px 32px',
              maxWidth: '420px',
              width: '90vw',
              boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
              animation: 'confirmSlideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {/* Header */}
            <h3
              id="confirm-title"
              style={{
                margin: '0 0 10px',
                fontSize: '17px',
                fontWeight: 700,
                color: state.options.confirmVariant === 'danger'
                  ? '#ef4444'
                  : 'var(--text-primary, #fff)',
                letterSpacing: '-0.01em',
              }}
            >
              {state.options.title}
            </h3>

            {/* Description */}
            <p style={{
              margin: '0 0 20px',
              fontSize: '13.5px',
              color: 'var(--text-secondary, #9ca3af)',
              lineHeight: 1.6,
            }}>
              {state.options.description}
            </p>

            {/* Typing confirmation field */}
            {state.options.requireTyping && (
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: 'var(--text-secondary, #9ca3af)',
                  marginBottom: '8px',
                  textTransform: 'uppercase',
                }}>
                  Type <strong style={{ color: '#ef4444' }}>{state.options.requireTyping}</strong> to confirm
                </label>
                <input
                  autoFocus
                  type="text"
                  value={state.typedValue}
                  onChange={(e) => setState(s => ({ ...s, typedValue: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter' && canConfirm) handleConfirm(); if (e.key === 'Escape') handleCancel(); }}
                  placeholder={`Type "${state.options.requireTyping}" here…`}
                  style={{
                    width: '100%',
                    background: 'var(--bg-secondary, rgba(255,255,255,0.05))',
                    border: state.typedValue === state.options.requireTyping
                      ? '1px solid rgba(239,68,68,0.5)'
                      : '1px solid var(--border-primary, rgba(255,255,255,0.1))',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    color: 'var(--text-primary, #fff)',
                    fontSize: '13px',
                    fontFamily: 'var(--font-mono, monospace)',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s',
                  }}
                />
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={handleCancel}
                disabled={state.isExecuting}
                style={{
                  padding: '9px 20px',
                  background: 'transparent',
                  border: '1px solid var(--border-primary, rgba(255,255,255,0.1))',
                  borderRadius: '8px',
                  color: 'var(--text-secondary, #9ca3af)',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {state.options.cancelLabel || 'Cancel'}
              </button>

              <button
                onClick={handleConfirm}
                disabled={!canConfirm}
                style={{
                  padding: '9px 20px',
                  background: state.options.confirmVariant === 'danger'
                    ? (canConfirm ? '#ef4444' : 'rgba(239,68,68,0.3)')
                    : (canConfirm ? 'var(--text-primary, #fff)' : 'rgba(255,255,255,0.2)'),
                  border: 'none',
                  borderRadius: '8px',
                  color: state.options.confirmVariant === 'danger'
                    ? '#fff'
                    : 'var(--bg-primary, #000)',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: canConfirm ? 'pointer' : 'not-allowed',
                  transition: 'all 0.2s',
                  opacity: canConfirm ? 1 : 0.5,
                  letterSpacing: '0.02em',
                }}
              >
                {state.isExecuting
                  ? 'Processing...'
                  : (state.options.confirmLabel || 'Confirm')}
              </button>
            </div>
          </div>

          <style>{`
            @keyframes confirmFadeIn {
              from { opacity: 0; }
              to   { opacity: 1; }
            }
            @keyframes confirmSlideUp {
              from { opacity: 0; transform: translateY(16px) scale(0.97); }
              to   { opacity: 1; transform: translateY(0) scale(1); }
            }
          `}</style>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
