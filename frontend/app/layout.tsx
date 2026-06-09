import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { ClientLayout } from '@/components/ClientLayout'
import { ThemeProvider } from '@/components/ThemeProvider'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'MCP Brasil · Plataforma Financeira',
  description: 'Dados financeiros públicos brasileiros — BCB, CVM, B3 e Tesouro em um único painel',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={geist.className} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <ClientLayout>{children}</ClientLayout>
        </ThemeProvider>
      </body>
    </html>
  )
}
