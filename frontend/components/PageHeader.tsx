interface PageHeaderProps {
  title: string
  description?: string
  sourceBadge?: string
  action?: React.ReactNode
}

export function PageHeader({ title, description, sourceBadge, action }: PageHeaderProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
      marginBottom: 28,
    }}>
      <div>
        <h1 style={{
          fontFamily: 'var(--font-display, serif)',
          fontSize: 28,
          fontWeight: 600,
          color: 'var(--cl-ink)',
          margin: 0,
          lineHeight: 1.2,
        }}>
          {title}
        </h1>
        {description && (
          <p style={{
            fontSize: 13,
            color: 'var(--cl-ink3)',
            margin: '6px 0 0',
            lineHeight: 1.5,
          }}>
            {description}
          </p>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, paddingTop: 4 }}>
        {sourceBadge && (
          <span style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: '.08em',
            textTransform: 'uppercase' as const,
            color: 'var(--cl-accent)',
            background: 'var(--cl-accent-soft)',
            border: '1px solid rgba(31,111,235,.18)',
            borderRadius: 'var(--cl-radius-xs)',
            padding: '3px 10px',
          }}>
            {sourceBadge}
          </span>
        )}
        {action}
      </div>
    </div>
  )
}
