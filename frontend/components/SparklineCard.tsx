'use client'

import { LineChart, Line, ResponsiveContainer } from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface SparklineCardProps {
  titulo: string
  valor: string
  variacao?: number | null
  sparkData: number[]
  cor: string
  icone: React.ReactNode
  tag?: string
  onClick?: () => void
}

export function SparklineCard({
  titulo,
  valor,
  variacao,
  sparkData,
  cor,
  icone,
  tag,
  onClick,
}: SparklineCardProps) {
  const chartData = sparkData.map((v, i) => ({ i, v }))

  const VarIcon =
    variacao == null ? Minus
    : variacao > 0   ? TrendingUp
    : TrendingDown

  const varColor =
    variacao == null ? 'text-muted-foreground'
    : variacao > 0   ? 'text-[var(--cl-up)]'
    : 'text-[var(--cl-down)]'

  return (
    <Card
      className={[
        'transition-all',
        onClick ? 'cursor-pointer hover:shadow-md hover:border-primary/50' : '',
      ].join(' ')}
      style={{ borderLeft: `3px solid ${cor}` }}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{icone}</span>
            <span className="text-sm font-medium">{titulo}</span>
          </div>
          {tag && (
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">
              {tag}
            </Badge>
          )}
        </div>

        <div className="flex items-end justify-between">
          <div>
            <p className="text-2xl font-bold font-mono tracking-tight">{valor}</p>
            {variacao != null && (
              <div className={`flex items-center gap-1 mt-1 text-xs ${varColor}`}>
                <VarIcon className="h-3 w-3" />
                <span>{variacao > 0 ? '+' : ''}{variacao.toFixed(2)}%</span>
              </div>
            )}
          </div>

          {chartData.length > 1 && (
            <div className="h-12 w-24">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <Line
                    type="monotone"
                    dataKey="v"
                    stroke={cor}
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {onClick && (
          <p className="text-[10px] text-muted-foreground mt-3 text-right">
            Clique para detalhes →
          </p>
        )}
      </CardContent>
    </Card>
  )
}
