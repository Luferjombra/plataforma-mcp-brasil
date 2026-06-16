'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  TrendingUp, BarChart2, Briefcase, MessageSquare,
  Activity, Sun, Moon, Landmark, ServerCog, LayoutDashboard,
} from 'lucide-react'

const links = [
  { href: '/indicadores', label: 'Indicadores',    icon: Activity,          tag: 'MACRO' },
  { href: '/rv',          label: 'Renda Variável', icon: TrendingUp,        tag: 'B3'    },
  { href: '/rf',          label: 'Renda Fixa',     icon: Landmark,          tag: 'TD'    },
  { href: '/fundos',      label: 'Fundos',         icon: Briefcase,         tag: 'CVM'   },
  { href: '/dashboard',   label: 'Dashboard',      icon: LayoutDashboard,   tag: 'NOVO'  },
  { href: '/copilot',     label: 'Chat Finance',   icon: MessageSquare,     tag: null    },
  { href: '/status',      label: 'Status ETL',     icon: ServerCog,         tag: null    },
]

export function Sidebar() {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  return (
    <aside className="flex-shrink-0 w-56 h-screen border-r border-border bg-background flex flex-col">
      {/* Logo clicável → home */}
      <Link
        href="/"
        className="px-5 py-5 border-b border-border block group hover:bg-accent/40 transition-colors"
        title="Ir para início"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary group-hover:scale-105 transition-transform">
            <BarChart2 className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <p className="font-bold text-sm leading-tight">MCP Brasil</p>
            <p className="text-[10px] text-muted-foreground leading-tight group-hover:text-primary transition-colors">← início</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-3">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
          </span>
          <span className="text-[10px] text-muted-foreground">Dados atualizados</span>
        </div>
      </Link>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="px-3 pb-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
          Mercados
        </p>
        {links.map(({ href, label, icon: Icon, tag }) => {
          const active = href === '/dashboard'
            ? pathname.startsWith('/dashboard')
            : pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'group flex items-center justify-between px-3 py-2 rounded-md text-sm transition-all',
                active
                  ? 'bg-primary text-primary-foreground font-medium shadow-sm'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <div className="flex items-center gap-2.5">
                <Icon className={cn('h-4 w-4', active ? 'text-primary-foreground' : '')} />
                <span>{label}</span>
              </div>
              {tag && (
                <span className={cn(
                  'text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wider',
                  active
                    ? 'bg-white/20 text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                )}>
                  {tag}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-border space-y-2">
        {mounted && (
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            {theme === 'dark' ? (
              <><Sun className="h-4 w-4" /><span>Modo claro</span></>
            ) : (
              <><Moon className="h-4 w-4" /><span>Modo escuro</span></>
            )}
          </button>
        )}
        <div className="px-3 pt-1">
          <p className="text-[10px] text-muted-foreground/60">Fontes públicas</p>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1">
            {['BCB', 'B3', 'CVM', 'Tesouro'].map(s => (
              <span key={s} className="text-[9px] font-medium text-muted-foreground border border-border rounded px-1 py-0.5">
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>
    </aside>
  )
}
