'use client'

interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  color?: string
  filled?: boolean
}

export function Sparkline({
  data,
  width = 120,
  height = 40,
  color = 'var(--cl-accent)',
  filled = true,
}: SparklineProps) {
  if (data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const pad = 3
  const w = width - pad * 2
  const h = height - pad * 2

  const px = (i: number) => pad + (i / (data.length - 1)) * w
  const py = (v: number) => pad + h - ((v - min) / range) * h

  const points = data.map((v, i) => `${px(i)},${py(v)}`).join(' ')

  const lastX = px(data.length - 1)
  const lastY = py(data[data.length - 1])

  const areaPoints = `${pad},${pad + h} ${points} ${lastX},${pad + h}`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible', display: 'block' }}>
      <defs>
        <linearGradient id={`sg-${color.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {filled && (
        <polygon
          points={areaPoints}
          fill={`url(#sg-${color.replace(/[^a-z0-9]/gi, '')})`}
        />
      )}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={lastX} cy={lastY} r={3} fill={color} />
    </svg>
  )
}
