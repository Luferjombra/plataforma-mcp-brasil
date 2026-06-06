'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  TrendingUp,
  BarChart2,
  Briefcase,
  MessageSquare,
  Activity,
  Sun,
  Moon,
  Landmark,
} from 'lucide-react'

const links = [
  { href: '/indicadores', label: 'Indicadores',    icon: Activity   },
  { href: '/rv',          label: 'Renda Variável', icon: TrendingUp },
  { href: '/rf',          label: 'Renda Fixa',     icon: Landmark   },
  { href: '/fundos',      label: 'Fundos',          icon: Briefcase  },
  { href: '/copilot',     label: 'Chat Finance',    icon: MessageSquare },
]

export function Sidebar() {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 border-r border-border bg-background flex flex-col">
      <div className="px-5 py-5 border-b border-border">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-5 w-5 text-primary" />
          <span className="font-semibold text-sm">MCP Brasil</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">Plataforma Financeira</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
              pathname === href
                ? 'bg-accent text-accent-foreground font-medium'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-border space-y-3">
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
        <p className="text-xs text-muted-foreground px-3">Dados: BCB · B3 · CVM · Tesouro</p>
      </div>
    </aside>
  )
}
