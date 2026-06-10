'use client'

import { useState, useRef, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { perguntarCopilot, APIError } from '@/lib/api'
import { Send, Bot, User, Loader2 } from 'lucide-react'

interface Mensagem {
  role: 'user' | 'assistant'
  content: string
  cached?: boolean
}

const SUGESTOES = [
  'Como está o IPCA nos últimos 12 meses?',
  'Qual o desempenho da PETR4 no ano?',
  'Compare SELIC e CDI historicamente.',
  'Explique o conceito de Sharpe ratio.',
]

export default function CopilotPage() {
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [input, setInput] = useState('')
  const [carregando, setCarregando] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens])

  async function enviar(pergunta?: string) {
    const texto = (pergunta ?? input).trim()
    if (!texto || carregando) return

    setInput('')
    setMensagens(prev => [...prev, { role: 'user', content: texto }])
    setCarregando(true)

    try {
      const res = await perguntarCopilot(texto)
      setMensagens(prev => [...prev, {
        role: 'assistant',
        content: res.resposta,
        cached: res.cached,
      }])
    } catch (e) {
      const detail = e instanceof APIError && e.detail ? e.detail : null
      setMensagens(prev => [...prev, {
        role: 'assistant',
        content: detail ?? 'Ocorreu um erro ao processar sua pergunta. Tente novamente.',
      }])
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Chat Finance</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Copilot financeiro com dados reais do Supabase · Powered by IA
        </p>
      </div>

      {/* Área de chat */}
      <Card className="min-h-[480px] flex flex-col">
        <CardContent className="flex-1 flex flex-col p-4 gap-4">
          {mensagens.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-6">
              <div className="text-center">
                <Bot className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium">Como posso ajudar?</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Pergunte sobre indicadores, ações ou fundos do mercado brasileiro.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 w-full max-w-md">
                {SUGESTOES.map(s => (
                  <button
                    key={s}
                    onClick={() => enviar(s)}
                    className="text-left text-xs px-3 py-2 rounded-lg border border-border hover:bg-accent transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 space-y-4 overflow-y-auto">
              {mensagens.map((m, i) => (
                <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                    m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  }`}>
                    {m.role === 'user' ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                  </div>
                  <div className={`flex-1 ${m.role === 'user' ? 'text-right' : ''}`}>
                    <div className={`inline-block text-sm px-4 py-2.5 rounded-2xl max-w-[85%] text-left ${
                      m.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-tr-sm'
                        : 'bg-muted rounded-tl-sm'
                    }`}>
                      {m.content}
                    </div>
                    {m.role === 'assistant' && m.cached && (
                      <div className="mt-1">
                        <Badge variant="secondary" className="text-xs">cached</Badge>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {carregando && (
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                    <Bot className="h-3.5 w-3.5" />
                  </div>
                  <div className="bg-muted px-4 py-2.5 rounded-2xl rounded-tl-sm flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Analisando...</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}

          {/* Input */}
          <div className="flex gap-2 mt-auto pt-4 border-t border-border">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && enviar()}
              placeholder="Pergunte sobre IPCA, PETR4, fundos..."
              disabled={carregando}
              className="flex-1 text-sm px-4 py-2.5 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
            <Button onClick={() => enviar()} disabled={!input.trim() || carregando} size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
