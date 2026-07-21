import type { Metadata } from 'next'
import { Inter, Source_Serif_4, Space_Mono } from 'next/font/google'
import './globals.css'
import { ClientLayout } from '@/components/ClientLayout'
import { ThemeProvider } from '@/components/ThemeProvider'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

// Fonte de destaque ("papel editorial") — usada em todo o produto via
// var(--font-display), não só na landing.
const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  style: ['normal', 'italic'],
  weight: ['400', '500', '600', '700'],
})

const spaceMono = Space_Mono({
  subsets: ['latin'],
  variable: '--font-mono-editorial',
  display: 'swap',
  weight: ['400', '700'],
})

export const metadata: Metadata = {
  title: 'MCP Brasil · Plataforma Financeira',
  description: 'Dados financeiros públicos brasileiros — BCB, CVM, B3 e Tesouro em um único painel',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${sourceSerif.variable} ${spaceMono.variable}`} suppressHydrationWarning>
      <body className="bg-background text-foreground antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <ClientLayout>{children}</ClientLayout>
        </ThemeProvider>
      </body>
    </html>
  )
}
