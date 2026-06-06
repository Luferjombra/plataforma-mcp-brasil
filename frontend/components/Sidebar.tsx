'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  TrendingUp,
  BarChart2,
  Briefcase,
  MessageSquare,
  Activity,
} from 'lucide-react'

const links = [
  { href: '/indicadores', label: 'Indicadores', icon: Activity },
  { href: '/rv', label: 'Renda Variável', icon: TrendingUp },
  { href: '/fundos', label: 'Fundos', icon: Briefcase },
  { href: '/copilot', label: 'Chat Finance', icon: MessageSquare },
]

export function Sidebar() {
  const pathname = usePathname()

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

      <div className="px-5 py-4 border-t border-border">
        <p className="text-xs text-muted-foreground">
          Dados: BCB · B3 · CVM
        </p>
      </div>
    </aside>
  )
}
