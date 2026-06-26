'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import {
  TrendingUp, BarChart2, Briefcase, MessageSquare,
  Activity, Sun, Moon, Landmark, ServerCog, LayoutDashboard, Newspaper,
  BriefcaseBusiness, Building2,
} from 'lucide-react'

const links = [
  { href: '/indicadores',  label: 'Indicadores',     icon: Activity,          tag: 'MACRO'  },
  { href: '/rv',           label: 'Renda Variável',  icon: TrendingUp,        tag: 'B3'     },
  { href: '/rf',           label: 'Tesouro Direto',  icon: Landmark,          tag: 'TD'     },
  { href: '/renda-fixa',   label: 'Renda Fixa',      icon: Building2,         tag: 'ANBIMA' },
  { href: '/fundos',       label: 'Fundos',          icon: Briefcase,         tag: 'CVM'    },
  { href: '/carteira',    label: 'Carteira',       icon: BriefcaseBusiness,   tag: 'NOVO'  },
  { href: '/dashboard',   label: 'Dashboard',      icon: LayoutDashboard,     tag: null    },
  { href: '/noticias',    label: 'Notícias',       icon: Newspaper,           tag: 'RSS'   },
  { href: '/copilot',     label: 'Chat Finance',   icon: MessageSquare,       tag: null    },
  { href: '/status',      label: 'Status ETL',     icon: ServerCog,           tag: null    },
]

export function Sidebar() {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, []) // eslint-disable-line react-hooks/set-state-in-effect

  return (
    <aside style={{
      flexShrink: 0, width: 220, height: '100vh',
      borderRight: '1px solid var(--cl-line)',
      background: 'var(--cl-card)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Logo */}
      <Link href="/" style={{ textDecoration: 'none', display: 'block' }}>
        <div style={{
          padding: '18px 18px 14px',
          borderBottom: '1px solid var(--cl-line)',
          cursor: 'pointer',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{
              width: 28, height: 28, background: 'var(--cl-navy)',
              borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <BarChart2 size={15} color="#fff" />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--cl-ink)', lineHeight: 1.2 }}>MCP Brasil</p>
              <p style={{ fontSize: 10, color: 'var(--cl-ink3)', lineHeight: 1 }}>← início</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ position: 'relative', display: 'inline-flex', width: 8, height: 8 }}>
              <span style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                background: 'var(--cl-up)', opacity: 0.6,
                animation: 'cl-fadeup 1.5s ease infinite',
              }} />
              <span style={{
                position: 'relative', display: 'inline-flex', width: 8, height: 8,
                borderRadius: '50%', background: 'var(--cl-up)',
              }} />
            </span>
            <span style={{ fontSize: 10, color: 'var(--cl-ink3)' }}>Dados atualizados</span>
          </div>
        </div>
      </Link>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '10px 10px', overflowY: 'auto' }}>
        <p style={{
          padding: '0 8px 8px', fontSize: 10, fontWeight: 700,
          color: 'var(--cl-ink3)', textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>Mercados</p>
        {links.map(({ href, label, icon: Icon, tag }) => {
          const active = href === '/dashboard'
            ? pathname.startsWith('/dashboard')
            : pathname === href
          return (
            <Link key={href} href={href} style={{ textDecoration: 'none', display: 'block' }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 10px', borderRadius: 'var(--cl-radius-sm)', marginBottom: 2,
                background: active ? 'var(--cl-navy)' : 'transparent',
                cursor: 'pointer', transition: 'background 0.15s',
              }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--cl-line2)' }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon size={15} color={active ? '#fff' : 'var(--cl-ink3)'} />
                  <span style={{ fontSize: 13, color: active ? '#fff' : 'var(--cl-ink)', fontWeight: active ? 600 : 400 }}>{label}</span>
                </div>
                {tag && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                    padding: '2px 6px', borderRadius: 4,
                    background: active ? 'rgba(255,255,255,.18)' : 'var(--cl-line2)',
                    color: active ? '#fff' : 'var(--cl-ink3)',
                  }}>{tag}</span>
                )}
              </div>
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '10px 10px', borderTop: '1px solid var(--cl-line)' }}>
        {mounted && (
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '8px 10px', borderRadius: 'var(--cl-radius-sm)',
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: 13, color: 'var(--cl-ink3)', transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--cl-line2)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
          >
            {theme === 'dark'
              ? <><Sun size={14} /><span>Modo claro</span></>
              : <><Moon size={14} /><span>Modo escuro</span></>}
          </button>
        )}
        <div style={{ padding: '6px 10px 2px' }}>
          <p style={{ fontSize: 10, color: 'var(--cl-ink3)', opacity: 0.6, marginBottom: 4 }}>Fontes públicas</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {['BCB', 'B3', 'CVM', 'Tesouro'].map(s => (
              <span key={s} style={{
                fontSize: 9, fontWeight: 600, color: 'var(--cl-ink3)',
                border: '1px solid var(--cl-line)', borderRadius: 4, padding: '1px 6px',
              }}>{s}</span>
            ))}
          </div>
        </div>
      </div>
    </aside>
  )
}
