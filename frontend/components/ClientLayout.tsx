'use client'

import { usePathname } from 'next/navigation'
import { Sidebar } from './Sidebar'

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isLanding = pathname === '/'

  if (isLanding) {
    return <>{children}</>
  }

  return (
    <>
      <Sidebar />
      <main className="ml-56 min-h-screen p-8">{children}</main>
    </>
  )
}
