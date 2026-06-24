# Backlog — LibreChat (Épico B)

_Atualizado em 2026-06-24. Status: B.1 POC concluído. B.2 decidido: Koyeb + MongoDB Atlas._

---

## Status geral

| Épico | Item | Status |
|-------|------|--------|
| B.1 | POC local + MCP | ✅ Concluído |
| B.2 | Decisão de deploy | ✅ Decidido: Koyeb free + MongoDB Atlas free |
| B.3 | Deploy produção | ⚙️ Em andamento (Dockerfile + CI/CD prontos, configurar Koyeb) |
| B.4 | Agents pré-criados | 🔲 Pendente |
| B.5 | Google OAuth | ⚙️ Config externa pendente |
| B.6 | Branding | ⚙️ Config externa pendente |
| B.7 | RAG / PDF | 📅 Roadmap |
| B.8 | Rate limits | ✅ Configurado |
| B.9 | QA PESQUISA-01 | 🔲 Pendente |

---

## B.1 — POC LibreChat local + MCP ✅ CONCLUÍDO

**Critérios validados:**
- [x] LibreChat abre em `http://localhost:3080`
- [x] Tools MCP listadas (`plataforma-mcp-brasil` via streamable-http)
- [x] Tool call disparou: `get_historico_rv_historico__ticker__get`
- [x] Dados reais: PETR4 R$ 46,22 → R$ 38,57 (-16,55%) em 17/06
- [ ] RAM < 400MB — verificar com `docker stats --no-stream`

**Arquivos prontos no repo:**
- `librechat/docker-compose.yml`
- `librechat/librechat.yaml`
- `librechat/.env.example`

---

## B.2 — Decisão de deploy ✅ DECIDIDO

| Plataforma | Custo/mês | RAM | Cold start | Veredicto |
|------------|-----------|-----|------------|-----------|
| **Koyeb free** | R$ 0 | 512 MB | Não tem | ✅ Escolhido |
| Railway free | $5 crédito/mês consumível | 512 MB | Não tem | Não é gratuito de verdade |
| Render Pro | R$ 35 | 2 GB | Não tem | Caro para POC |
| Fly.io free | R$ 0 | 256 MB | Tem | RAM insuficiente |

**Decisão:** Koyeb free tier + MongoDB Atlas free tier (512MB).

- [x] Decisão documentada em `architecture.md`
- [ ] Criar conta Koyeb em koyeb.com
- [ ] Criar cluster MongoDB Atlas free (mongodb.com/atlas) e obter URI
- [ ] Definir hostname definitivo em `architecture.md`

**Esforço:** 30min (apenas configuração externa)

---

## B.3 — Deploy produção

**Pré-requisito:** B.2 decidido.

### B.3.1 — Dockerfile customizado (✅ pronto)
- [x] Criar `librechat/Dockerfile` — estende imagem base, copia `librechat.yaml` para dentro da imagem
- [x] Permite deploy sem montar volume: Koyeb roda a imagem diretamente

### B.3.2 — GitHub Action CI/CD (✅ pronto)
- [x] Criar `.github/workflows/deploy-librechat.yml`
- [x] Trigger: push em `main` com mudanças em `librechat/**`
- [x] Build Docker image → push para GHCR (`ghcr.io/luferjombra/librechat-mcp-brasil`)
- [x] Redeploy via Koyeb CLI (`koyeb service redeploy plataforma-mcp-brasil/librechat`)
- [ ] Adicionar secret `KOYEB_TOKEN` no GitHub (requer conta Koyeb)

### B.3.3 — Configurar app no Koyeb (você faz no painel, ~30min)

1. Criar conta em koyeb.com
2. New App → **Docker** → imagem: `ghcr.io/luferjombra/librechat-mcp-brasil:latest`
3. Nome do app: `plataforma-mcp-brasil`, nome do serviço: `librechat`
4. Porta: `3080`
5. Configurar variáveis de ambiente (copiar de `librechat/.env.example` e preencher):

Variáveis de ambiente no painel Koyeb:

| Variável | Valor |
|----------|-------|
| `MONGO_URI` | URI do MongoDB Atlas (ex: `mongodb+srv://user:pass@cluster.mongodb.net/LibreChat`) |
| `JWT_SECRET` | Gerar: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `JWT_REFRESH_SECRET` | Idem |
| `CREDS_KEY` | Idem |
| `CREDS_IV` | `node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"` |
| `APP_TITLE` | `Plataforma MCP Brasil` |
| `ALLOW_REGISTRATION` | `true` |
| `FILE_UPLOADS` | `true` |
| `MESSAGE_USER_MAX` | `20` |
| `MESSAGE_USER_WINDOW` | `60` |
| `GOOGLE_CLIENT_ID` | (do passo B.5) |
| `GOOGLE_CLIENT_SECRET` | (do passo B.5) |
| `GOOGLE_CALLBACK_URL` | `https://SEU_APP.koyeb.app/oauth/google/callback` |
| `DEEPSEEK_API_KEY` | Sua key |
| `GROQ_API_KEY` | Sua key |
| `CEREBRAS_API_KEY` | Sua key |
| `GLM_API_KEY` | Sua key |
| `TELEMETRY_ENABLED` | `false` |

6. Health check path: `/health`
7. Após deploy, testar `https://SEU_APP.koyeb.app/health`
8. Adicionar uptime monitor: UptimeRobot free tier (uptimerobot.com)
9. Gerar `KOYEB_TOKEN` em koyeb.com → Account → API → New Token → adicionar no GitHub Secrets

**Esforço total B.3:** ~1h (código pronto, só configuração no painel)

---

## B.4 — Agents pré-criados

**O que são:** Assistentes especializados configurados para o usuário já encontrar prontos ao fazer login.

**Como criar:** via painel Admin do LibreChat após deploy → Agents → New Agent.

### Agent 1 — Analista Quant
```
Nome: Analista Quant
Provider: DeepSeek / GLM
Model: deepseek-v4-flash / glm-4.7-flash
MCP Tools: get_historico_rv, get_indicadores, get_analise_carteira
System Prompt:
  Você é um analista quantitativo especializado em mercado brasileiro.
  Sempre use as ferramentas MCP para buscar dados reais antes de analisar.
  Calcule Sharpe, Sortino, Drawdown quando relevante.
  Responda em português, seja preciso com números e datas.
```

### Agent 2 — Analista Macro
```
Nome: Analista Macro
Provider: Groq
Model: llama-3.3-70b-versatile
MCP Tools: get_indicadores, get_historico_selic, get_ipca
System Prompt:
  Você é um economista especializado em macroeconomia brasileira.
  Sempre use ferramentas MCP para buscar SELIC, IPCA, PIB atuais.
  Compare cenários históricos. Responda em português com contexto
  macroeconômico claro para investidores não-economistas.
```

### Agent 3 — Analista Renda Variável
```
Nome: Analista RV
Provider: Cerebras
Model: qwen-3-32b
MCP Tools: get_historico_rv, get_ativos, search_ativos
System Prompt:
  Você é um analista de renda variável focado em ações brasileiras (B3).
  Sempre busque dados reais via ferramentas antes de opinar.
  Analise P/L, EV/EBITDA, ROE quando disponível.
  Nunca dê recomendação de compra/venda sem dados concretos.
```

- [ ] Criar os 3 agents via painel Admin após deploy
- [ ] Exportar configs como JSON e versionar em `librechat/agents/`

**Esforço:** 2h (manual no painel)

---

## B.5 — Google OAuth

**O que você precisa fazer (fora do código, ~15min):**

1. Acesse [console.cloud.google.com](https://console.cloud.google.com)
2. Crie um projeto → **APIs e Serviços → Credenciais**
3. Clique em **Criar Credencial → ID do cliente OAuth 2.0**
4. Tipo de aplicativo: **Aplicativo Web**
5. Nome: `Plataforma MCP Brasil`
6. URIs de redirecionamento autorizados:
   - Local: `http://localhost:3080/oauth/google/callback`
   - Produção: `https://SEU_DOMINIO/oauth/google/callback`
7. Copie o **Client ID** e **Client Secret**

**O que adicionar no `.env` local:**
```env
GOOGLE_CLIENT_ID=seu_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=seu_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3080/oauth/google/callback
```

**O que mudar no `docker-compose.yml`:**
```yaml
- ALLOW_SOCIAL_LOGIN=true   # trocar de false para true
```

**Status no código:** `librechat.yaml` já tem `registration.socialLogins: ["google"]` ✅

- [ ] Criar credencial no Google Cloud Console
- [ ] Adicionar vars ao `.env` local
- [ ] Mudar `ALLOW_SOCIAL_LOGIN=true` no `docker-compose.yml`
- [ ] Testar login Google em `localhost:3080`
- [ ] Adicionar vars de produção no Railway

**Esforço:** 30min

---

## B.6 — Branding visual

**Já feito no código:**
- [x] `APP_TITLE=Plataforma MCP Brasil` no `docker-compose.yml`
- [x] `interface.appTitle` no `librechat.yaml`

**Pendente (opcional):**
- [ ] Logo personalizado: colocar `logo.png` em `librechat/assets/` e mapear no volume Docker
- [ ] Favicon personalizado
- [ ] Cor primária customizada (requer build customizado do LibreChat — complexo, deixar para depois)

**Esforço:** 1h (se quiser logo)

---

## B.7 — RAG / Upload de PDFs (Roadmap)

**O que é:** usuário sobe PDF de relatório CVM/fundo e o Agent responde com base no conteúdo.

**Por que é complexo:**
- LibreChat precisa de um serviço separado `rag-api` (Python FastAPI)
- Requer banco vetorial: pgvector (Supabase já tem!) ou Meilisearch
- Requer modelo de embedding (e.g., `text-embedding-3-small` via OpenAI ou open-source)

**Caminho mais simples (usa Supabase pgvector que já temos):**

```
rag-api → FastAPI separado
       → usa pgvector do Supabase
       → embedding: GLM ou Cerebras (grátis)
       → LibreChat aponta RAG_API_URL para o serviço
```

- [ ] Pesquisar `librechat-rag-api` no GitHub
- [ ] Avaliar se pgvector do Supabase free tier suporta
- [ ] Adicionar `rag-api` ao `docker-compose.yml` como 3º serviço
- [ ] Configurar `RAG_API_URL` no LibreChat

**Esforço estimado:** 6h | **Priority:** baixa | **Blocker:** nenhum

---

## B.8 — Rate Limits ✅ CONFIGURADO

- [x] `MESSAGE_USER_MAX=20` — 20 mensagens por hora por usuário
- [x] `MESSAGE_USER_WINDOW=60` — janela de 60 minutos
- [x] `rateLimits.fileUploads` — 10 uploads/hora por usuário no `librechat.yaml`

---

## B.9 — QA Cenário PESQUISA-01

- [ ] Adicionar em `qa_run.py` Seção 9:
  - Chat consegue invocar tool MCP `get_historico_rv` via Agent
  - Resposta contém preços/datas reais (não alucinação)
  - Tempo de resposta < 10s (excluindo cold start do Render)
- [ ] Documentar prompts dos 3 agents em `references/agents/`

**Esforço:** 2h

---

## Sequência recomendada

```
Hoje:
  B.5 (15min) — OAuth Google: criar credencial e testar local
  B.2 (1h)    — Decidir Railway, criar conta

Próxima sessão:
  B.3 (2.5h)  — Deploy Railway completo + CI/CD
  B.4 (2h)    — Criar 3 Agents no painel Admin

Depois:
  B.6 (1h)    — Logo se quiser
  B.9 (2h)    — QA PESQUISA-01
  B.7 (6h)    — RAG PDF (roadmap)
```

**Total restante:** ~15h → 2 sessões de trabalho

---

## Checklist rápido — "o que EU preciso fazer"

> Tarefas que dependem de ações suas fora do código:

| # | Tarefa | Onde | Tempo |
|---|--------|------|-------|
| 1 | Criar credencial OAuth no Google Cloud | console.cloud.google.com | 15min |
| 2 | Criar conta Koyeb | koyeb.com | 5min |
| 3 | Criar cluster MongoDB Atlas free + obter URI | mongodb.com/atlas | 15min |
| 4 | Criar app no Koyeb + configurar variáveis de ambiente | painel Koyeb | 20min |
| 5 | Criar os 3 Agents no painel Admin | localhost:3080 ou produção | 30min |
| 6 | (Opcional) Fazer logo 512x512 PNG | Canva / Figma | 30min |
