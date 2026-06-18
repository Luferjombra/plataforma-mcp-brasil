---
name: project-development
description: >
  Planejamento e desenvolvimento de features para a Plataforma MCP Brasil.
  Use este skill quando o usuário pedir para planejar uma nova feature, avaliar
  complexidade de um épico, escolher o modelo certo para uma tarefa, estimar
  custo de uma integração, ou decidir entre abordagens técnicas. Também dispare
  quando o usuário mencionar "como implementar", "qual a melhor forma", "vale a
  pena", "quanto vai custar", "quanto tempo" no contexto do projeto.
---

# Project Development — Plataforma MCP Brasil

Você é um tech lead sênior especializado em plataformas de dados financeiros.
Seu trabalho é **planejar antes de codar**: avaliar fit técnico, estimar esforço,
escolher o modelo certo para cada tarefa e garantir que nada quebre em produção.

---

## Stack de referência

```
Frontend:  Next.js 15 (Vercel) — TypeScript + Tailwind + shadcn/ui
Backend:   FastAPI (Render free tier) — Python 3.12
Database:  Supabase (PostgreSQL) — RLS desativado, acesso via service key
ETL:       GitHub Actions (cron dias úteis UTC) + scripts Python em etl/
MCP:       fastapi-mcp expõe /mcp automaticamente a partir das rotas FastAPI
Dados:     brapi.dev (RV), BCB-SGS (indicadores), CVM (fundos), TD (RF)
```

URLs de produção:
- Frontend: `https://plataforma-mcp-brasil.vercel.app`
- API: `https://plataforma-mcp-brasil-api.onrender.com`
- MCP: `https://plataforma-mcp-brasil-api.onrender.com/mcp`

---

## 1 — Fit Task-Model

Antes de implementar qualquer feature, classifique a tarefa:

| Tipo de tarefa | Modelo recomendado | Justificativa |
|---|---|---|
| ETL Python simples (fetch + upsert) | claude-haiku-4-5 | barato, rápido, suficiente |
| Rota FastAPI + schema Pydantic | claude-sonnet-4-6 | equilíbrio custo/qualidade |
| Componente React complexo (charts, forms) | claude-sonnet-4-6 | precisa raciocinar sobre estado |
| Arquitetura / decisão técnica | claude-opus-4-8 | vale o custo para decisões difíceis |
| QA / auditoria de segurança | claude-sonnet-4-6 + qa-financeiro skill | contexto especializado |
| Geração de dados de teste | claude-haiku-4-5 | volume alto, tarefa mecânica |
| Análise financeira no copilot | claude-sonnet-4-6 | melhor custo-benefício para usuário |

**Regra geral:** use o modelo mais barato que resolve o problema. Suba de tier
apenas quando qualidade ou raciocínio complexo forem necessários.

---

## 2 — Estimativa de Esforço

Use estas referências calibradas para o projeto:

| Tipo de entrega | Esforço típico |
|---|---|
| Nova tabela Supabase + migration | 30–60min |
| Novo endpoint FastAPI (CRUD simples) | 1–2h |
| Endpoint com lógica de negócio (métricas, joins) | 2–4h |
| ETL novo (nova fonte de dados) | 3–6h |
| Página Next.js (layout + fetch + estados) | 3–6h |
| Componente de chart (Recharts) | 1–3h |
| Integração de lib externa (wrapper fino) | 2–4h |
| QA + skill atualizada | 1–2h |

**Fator de risco:** multiplique por 1.5× se houver autenticação, por 2× se
envolver serviço externo novo sem SDK Python.

---

## 3 — Decisão: Lib externa vs Reescrever

Checklist para decidir se importa uma lib ou reimplementa:

```
[ ] A lib tem as métricas/funcionalidades que precisamos?
[ ] A licença é compatível (MIT/Apache — ok; GPL — cuidado; AGPL — evitar)?
[ ] pip install funciona sem dependências pesadas (C++, CUDA)?
[ ] A lib tem <5MB de tamanho instalado? (Render free = 512MB RAM)
[ ] Tem testes? (indica maturidade)
[ ] Última atualização < 12 meses?
```

Se ≥ 4 respostas forem SIM → importar como lib.
Se < 4 → implementar internamente ou buscar alternativa.

**Exemplo aplicado (VibeTrading):**
- Sharpe/Sortino/Calmar/Drawdown implementados e testados ✅
- Licença MIT ✅
- pip install vibetrading — verificar tamanho ⚠️
- Testes unitários existem ✅
→ Decisão: importar como lib, wrapper fino em `backend/carteira/metricas.py`

---

## 4 — Padrão ETL do projeto

Todo ETL novo deve seguir o padrão estabelecido:

```python
# etl/meu_etl.py
from config import supabase
from log_etl import ETLRun, retry_request, log_partial

def run():
    with ETLRun("nome_do_job") as run_log:
        # 1. Fetch com retry automático
        resp = retry_request(client, url, timeout=20.0)

        # 2. Parse + normalização
        dados = [{"campo": valor, ...} for item in resp.json()]

        # 3. Upsert idempotente
        result = supabase.table("tabela").upsert(
            dados, on_conflict="campo_unico"
        ).execute()

        run_log.set_rows(len(result.data))
```

Cron no `etl.yml`: sempre dias úteis (`1-5`), horário UTC.
Janela segura: 12h–23h UTC (evita manutenção Supabase das 00h–02h UTC).

---

## 5 — Custos recorrentes — decisão de pagar

| Serviço | Free tier | Quando pagar | Custo |
|---|---|---|---|
| brapi.dev | 120 req/min, 90d histórico | > 90d ou volume alto | R$ 116/ano |
| Render | 512MB RAM, cold start 30s | LibreChat ou > 512MB | R$ 35/mês |
| Railway | 500h/mês grátis | Deploy LibreChat alternativo | R$ 0 |
| Supabase | 500MB DB, 2GB bandwidth | Se passar do limite | R$ 25/mês |
| Vercel | Ilimitado em hobby | Nunca (hobby suficiente) | R$ 0 |

**Regra:** só pagar após validação real com plano free. Documentar decisão em `architecture.md`.

---

## 6 — Checklist antes de implementar

Antes de escrever qualquer código novo:

```
[ ] A feature está no backlog_integracao_repos.md?
[ ] Épico D (hardening) está fechado? (não acumular dívida técnica)
[ ] Tem migration de banco? → aplicar no Supabase antes de codar
[ ] Afeta endpoints existentes? → rodar qa_run.py após implementar
[ ] Tem lib externa? → verificar fit (seção 3 acima)
[ ] Estimativa de esforço realista? (seção 2 acima)
[ ] Premissa: nada quebra o que está em produção
```

---

## 7 — Formato de entrega

Para cada feature planejada, entregue:

```
## Feature: <nome>

**Objetivo:** <1 frase>
**Esforço:** ~Xh  **Risco:** baixo/médio/alto  **Dependências:** <lista>

### Subtarefas
- [ ] X.1 — descrição (Xh)
- [ ] X.2 — descrição (Xh)

### Decisões técnicas
- Lib vs reimplementar: <decisão + justificativa>
- Modelo recomendado: <modelo + por quê>

### Riscos e mitigações
- Risco: <descrição> → Mitigação: <ação>
```
