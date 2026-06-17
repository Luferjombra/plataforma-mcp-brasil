---
name: tool-design
description: >
  Design de ferramentas MCP e endpoints FastAPI para a Plataforma MCP Brasil.
  Use este skill quando o usuário pedir para criar ou revisar rotas FastAPI,
  escrever descriptions de endpoints, desenhar a interface de uma nova rota,
  nomear tools no MCP, ou consolidar endpoints redundantes. Também dispare
  quando o usuário mencionar "nova rota", "endpoint", "tool do MCP", "como o
  copilot vai chamar", "descrição da rota" no contexto do projeto.
---

# Tool Design — Plataforma MCP Brasil

Você é um especialista em design de APIs e ferramentas MCP. Neste projeto,
**toda rota FastAPI é automaticamente uma tool MCP** via `fastapi-mcp` — o que
significa que a description do endpoint é literalmente o que o LLM lê para
decidir se e como chamar aquela ferramenta.

**Regra de ouro:** escreva descriptions como se estivesse instruindo um agente
autônomo, não documentando para um humano.

---

## 1 — Anatomia de uma boa tool MCP

```python
@router.get("/carteira/analise")
def get_analise_carteira(
    session_id: str = Query(..., description="ID da sessão do usuário"),
    periodo_dias: int = Query(252, description="Período de análise em dias úteis. 252 = 1 ano."),
):
    """
    Retorna análise completa de performance da carteira do usuário: P&L realizado
    e não-realizado, rentabilidade vs CDI e IBOV, e métricas de risco profissionais
    (Sharpe, Sortino, Calmar, max drawdown, win rate).

    Use quando o usuário perguntar sobre performance da carteira, rentabilidade,
    comparação com benchmarks, ou quiser saber "como está minha carteira".

    Retorna: { posicoes, pl_total, rentabilidade_pct, vs_cdi, vs_ibov,
               sharpe, sortino, calmar, drawdown_max, win_rate }
    """
```

**O que faz uma boa description:**
1. **O que retorna** — campos concretos, não "dados da carteira"
2. **Quando usar** — frases que o usuário diria ("como está minha carteira")
3. **Unidades e defaults** — `252 = 1 ano útil`, não só `252`
4. **Sem jargão técnico** — o LLM lê isso, não um dev

---

## 2 — Naming conventions MCP

| Padrão | Exemplo bom | Exemplo ruim |
|---|---|---|
| Verbo + substantivo no path | `GET /carteira/analise` | `GET /getAnaliseCarteira` |
| Recurso no plural para listas | `GET /rv/ativos` | `GET /rv/ativo` |
| Parâmetro obrigatório no path | `GET /rv/historico/{ticker}` | `GET /rv/historico?ticker=X` |
| Filtros opcionais como query | `GET /noticias?categoria=Macro` | `GET /noticias/Macro` |
| Prefixo do domínio | `/carteira/*`, `/rf/*`, `/rv/*` | `/api/v1/portfolio/*` |

**Tags FastAPI** — sempre definir para agrupar no MCP:
```python
router = APIRouter(prefix="/carteira", tags=["Carteira"])
```

---

## 3 — Checklist de qualidade de tool

Para cada endpoint novo, verificar:

```
[ ] Description tem ≥ 2 frases (o que faz + quando usar)?
[ ] Parâmetros têm description com unidade/default explicado?
[ ] Retorno está documentado (campos principais)?
[ ] Path segue naming conventions (seção 2)?
[ ] Tag definida no router?
[ ] Erro 422 (parâmetro inválido) retorna mensagem útil?
[ ] Endpoint idempotente? (GET nunca muda estado)
[ ] Registrado no main.py com include_router?
```

---

## 4 — Consolidação de endpoints redundantes

Antes de criar um endpoint novo, verificar se já existe algo parecido:

```python
# Ruim: dois endpoints quase iguais
GET /rv/historico/{ticker}     # retorna 252 pontos
GET /rv/historico/{ticker}/ano # retorna 252 pontos também ???

# Bom: um endpoint com parâmetro
GET /rv/historico/{ticker}?limit=252  # padrão = 1 ano
GET /rv/historico/{ticker}?limit=20   # últimos 20 dias
```

**Regra:** se dois endpoints diferem só pelo `limit` ou por um filtro simples,
consolidar em um com parâmetro opcional.

---

## 5 — Padrão de resposta do projeto

Todo endpoint deve retornar no formato:

```python
# Lista
{"data": [...], "total": N}

# Item único
{"codigo": "PETR4", "data": [...]}

# Com metadado
{"data": [...], "total": N, "data_referencia": "2026-06-17"}

# Erro de negócio (não 500)
{"detail": "Ticker XPTO não encontrado"}  # status 404
```

Nunca retornar lista diretamente na raiz — dificulta versionamento e
quebra o parsing do copilot.

---

## 6 — Tools que o copilot usa hoje

Mapa atual das tools disponíveis via `/mcp`:

| Tool (path) | Descrição curta | Quando o LLM chama |
|---|---|---|
| `GET /` | health check | raramente |
| `GET /indicadores` | SELIC, IPCA, CDI, PIB | "qual a SELIC hoje?" |
| `GET /rv/ativos` | lista tickers B3 | "quais ações disponíveis?" |
| `GET /rv/historico/{ticker}` | série histórica de preços | "histórico da PETR4" |
| `GET /fundos` | lista fundos CVM | "quais fundos disponíveis?" |
| `GET /fundos/historico/{cnpj}` | cotas do fundo | "performance do Verde" |
| `GET /rf/titulos` | Tesouro Direto atual | "taxas do Tesouro" |
| `GET /rf/historico/{codigo}` | histórico de taxas RF | "histórico do Tesouro IPCA+" |
| `GET /noticias` | feed RSS financeiro | "últimas notícias" |
| `POST /copilot/pergunta` | pergunta ao Gemini | loop interno |

**Novos endpoints do Épico A** que serão adicionados:

| Tool (path) | Descrição curta | Quando o LLM deve chamar |
|---|---|---|
| `POST /carteira/posicoes` | adicionar posição | "comprei 100 PETR4 a R$38" |
| `GET /carteira/posicoes` | listar posições | "quais são minhas posições?" |
| `DELETE /carteira/posicoes/{id}` | remover posição | "remover VALE3 da carteira" |
| `GET /carteira/analise` | P&L + métricas risco | "como está minha carteira?" |

---

## 7 — Armadilhas comuns

**Description vaga** (ruim):
```python
"""Retorna dados da carteira."""
```

**Description acionável** (bom):
```python
"""
Retorna posições abertas da carteira identificada por session_id,
com preço médio, quantidade, valor atual e P&L não realizado por posição.

Use quando o usuário perguntar "minhas posições", "o que tenho na carteira",
ou quiser ver P&L de posições individuais (não consolidado).
"""
```

**Parâmetro sem contexto** (ruim):
```python
limit: int = Query(252)
```

**Parâmetro autoexplicativo** (bom):
```python
limit: int = Query(252, description="Número de pontos de dados. 252 ≈ 1 ano útil de pregões.")
```
