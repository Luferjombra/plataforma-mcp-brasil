'use client'

import { useId } from 'react'

interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  color?: string
  filled?: boolean
  /** Cor do preenchimento, se diferente de `color` -- vira um bloco sólido
   * (opacidade 1) em vez do degradê padrão (usado quando o design pede um
   * tom "soft" fixo, não um rastro que desvanece). */
  fillColor?: string
  showDot?: boolean
  strokeWidth?: number
  dotRadius?: number
  /** Margem interna do desenho dentro de `width`/`height`. */
  padding?: number
}

export function Sparkline({
  data,
  width = 120,
  height = 40,
  color = 'var(--cl-accent)',
  filled = true,
  fillColor,
  showDot = true,
  strokeWidth = 1.5,
  dotRadius = 3,
  padding = 3,
}: SparklineProps) {
  // id único por instância (não derivado da cor) -- achado de revisão: com
  // um id baseado só na cor, várias sparklines da mesma cor numa lista
  // (comum em /indicadores e /renda-fixa) geravam o mesmo id de gradiente
  // duplicado no DOM (lookup de url(#id) é global, não escopado ao <svg>).
  // Sanitizado porque o formato de useId() (ex: ":r0:") tem ":" -- não é
  // seguro dentro de um url(#...) em todos os browsers.
  const gradId = `sg-${useId().replace(/[^a-zA-Z0-9]/g, '')}`

  if (data.length < 2) return <svg width={width} height={height} style={{ display: 'block' }} />

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const pad = padding
  const w = width - pad * 2
  const h = height - pad * 2

  const px = (i: number) => pad + (i / (data.length - 1)) * w
  const py = (v: number) => pad + h - ((v - min) / range) * h

  const points = data.map((v, i) => `${px(i)},${py(v)}`).join(' ')

  const lastX = px(data.length - 1)
  const lastY = py(data[data.length - 1])

  const areaPoints = `${pad},${pad + h} ${points} ${lastX},${pad + h}`
  const corPreenchimento = fillColor ?? color

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible', display: 'block' }}>
      {filled && (
        <>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={corPreenchimento} stopOpacity={fillColor ? 1 : 0.25} />
              <stop offset="100%" stopColor={corPreenchimento} stopOpacity={fillColor ? 1 : 0} />
            </linearGradient>
          </defs>
          <polygon
            points={areaPoints}
            fill={`url(#${gradId})`}
          />
        </>
      )}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {showDot && <circle cx={lastX} cy={lastY} r={dotRadius} fill={color} />}
    </svg>
  )
}
