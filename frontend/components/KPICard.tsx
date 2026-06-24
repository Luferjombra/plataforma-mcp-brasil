'use client'

import { Sparkline } from './Sparkline'

interface KPICardProps {
  label: string
  value: string
  delta?: number | null
  sparkData?: number[]
  color?: string
  source?: string
  onClick?: () => void
}

export function KPICard({ label, value, delta, sparkData, color = 'var(--cl-accent)', source, onClick }: KPICardProps) {
  const deltaColor =
    delta == null  ? 'var(--cl-ink3)'
    : delta > 0    ? 'var(--cl-up)'
    : delta < 0    ? 'var(--cl-down)'
    : 'var(--cl-ink3)'

  const deltaLabel =
    delta == null ? null
    : `${delta > 0 ? '+' : ''}${delta.toFixed(2)}%`

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--cl-card)',
        border: '1px solid var(--cl-line)',
        borderTop: `3px solid ${color}`,
        borderRadius: 'var(--cl-radius)',
        padding: 'var(--cl-card-pad)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow .15s',
      }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLElement).style.boxShadow = 'var(--cl-shadow-hover)' }}
      onMouseLeave={e => { if (onClick) (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}
    >
      <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--cl-ink3)', margin: 0 }}>
        {label}
      </p>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <p style={{
            fontFamily: 'var(--font-display, serif)',
            fontSize: 32,
            fontWeight: 700,
            color: 'var(--cl-ink)',
            margin: 0,
            lineHeight: 1.1,
          }}>
            {value}
          </p>
          {deltaLabel && (
            <p style={{ fontSize: 12, fontWeight: 600, color: deltaColor, margin: '4px 0 0' }}>
              {deltaLabel}
            </p>
          )}
        </div>

        {sparkData && sparkData.length > 1 && (
          <Sparkline data={sparkData} color={color} width={100} height={36} />
        )}
      </div>

      {source && (
        <p style={{ fontSize: 10, color: 'var(--cl-ink3)', margin: 0, letterSpacing: '.04em' }}>
          {source}
        </p>
      )}
    </div>
  )
}
