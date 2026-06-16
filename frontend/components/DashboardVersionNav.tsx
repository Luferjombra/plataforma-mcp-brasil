'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const VERSOES = [
  { href: '/dashboard/v1', label: 'V1 — Painel Unificado', desc: 'Timeline sobreposta' },
  { href: '/dashboard/v2', label: 'V2 — Grid + Drawer',    desc: 'Cards com drill-down' },
  { href: '/dashboard/v3', label: 'V3 — Multi-Panel',      desc: 'Análise detalhada' },
]

export function DashboardVersionNav() {
  const pathname = usePathname()

  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard Histórico</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Histórico unificado por família de produto — 3 versões navegáveis
        </p>
      </div>
      <div className="flex gap-2">
        {VERSOES.map(v => (
          <Link
            key={v.href}
            href={v.href}
            className={[
              'px-3 py-2 rounded-lg text-xs font-medium transition-all border',
              pathname.startsWith(v.href)
                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                : 'border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            ].join(' ')}
          >
            <span className="block font-semibold">{v.label}</span>
            <span className="block text-[10px] opacity-70 mt-0.5">{v.desc}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
