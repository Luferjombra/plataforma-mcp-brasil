'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { TrendingUp, Landmark, MessageSquare, Home } from 'lucide-react'

const TABS = [
  { href: '/',        label: 'Início', icon: Home        },
  { href: '/rv',      label: 'Ações',  icon: TrendingUp  },
  { href: '/rf',      label: 'Fixa',   icon: Landmark    },
  { href: '/copilot', label: 'Chat',   icon: MessageSquare },
]

export function MobileTabBar() {
  const pathname = usePathname()
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 60,
      height: 64, display: 'flex', alignItems: 'center',
      background: 'var(--cl-card)',
      borderTop: '1px solid var(--cl-line)',
      backdropFilter: 'blur(12px)',
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
        return (
          <Link key={href} href={href} style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 3,
            textDecoration: 'none', paddingTop: 6,
            color: active ? 'var(--cl-accent)' : 'var(--cl-ink3)',
            transition: 'color 0.15s',
          }}>
            <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
            <span style={{ fontSize: 10, fontWeight: active ? 700 : 400 }}>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
