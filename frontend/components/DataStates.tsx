'use client'

import React from 'react'

export function SkeletonShimmer({ h, w, style }: { h: number; w?: string | number; style?: React.CSSProperties }) {
  return (
    <div style={{
      height: h, width: w ?? '100%',
      borderRadius: 'var(--cl-radius-sm)',
      background: 'linear-gradient(90deg, var(--cl-line2) 25%, var(--cl-line) 50%, var(--cl-line2) 75%)',
      backgroundSize: '200% 100%',
      animation: 'cl-shimmer 1.5s infinite',
      ...style,
    }} />
  )
}

export function ErrorState({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 14, padding: '48px 24px', textAlign: 'center',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%',
        background: 'var(--cl-down-soft)', border: '1px solid var(--cl-down)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20, color: 'var(--cl-down)', fontWeight: 700,
      }}>!</div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--cl-ink)', marginBottom: 4 }}>
          Não foi possível carregar
        </div>
        <div style={{ fontSize: 12, color: 'var(--cl-ink3)', maxWidth: 280 }}>{msg}</div>
      </div>
      <button onClick={onRetry} style={{
        padding: '8px 20px', borderRadius: 'var(--cl-radius-sm)',
        background: 'var(--cl-navy)', color: '#fff', border: 'none',
        fontSize: 13, fontWeight: 600, cursor: 'pointer',
      }}>↻ Tentar novamente</button>
    </div>
  )
}

export function EmptyState({ msg, hint }: { msg?: string; hint?: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 8, padding: '48px 24px', textAlign: 'center',
    }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, color: 'var(--cl-ink3)', lineHeight: 1 }}>—</div>
      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cl-ink3)' }}>{msg ?? 'Sem dados no período'}</div>
      {hint && <div style={{ fontSize: 11, color: 'var(--cl-ink3)', opacity: 0.7 }}>{hint}</div>}
    </div>
  )
}
