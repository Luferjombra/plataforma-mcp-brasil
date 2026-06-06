# Plano — Renda Fixa (branch `feature/renda-fixa`)

Documento de arquitetura e checklist de implementação da feature de Renda Fixa.
Gerado automaticamente — revise antes de criar o Pull Request.

---

## Decisões de arquitetura

### Fonte de dados escolhida: Tesouro Transparente

| Alternativa | Veredicto | Motivo |
|---|---|---|
| mcp-brasil `bacen` | ❌ Descartado | Conflito de dependências com supabase-py (httpx version clash) |
| mcp-brasil `bcb_olinda` | ❌ Descartado | Mesmo conflito |
| API Tesouro Direto (B3) | ⚠️ Secundária | JSON em tempo real, sem histórico |
| **Tesouro Transparente CSV** | ✅ **Escolhida** | API pública, sem WAF, histórico completo desde 2002 |

**URL da fonte:**
```
https://www.tesourotransparente.gov.br/ckan/dataset/
  df56aa42-484a-4a59-8184-7676580c81e3/resource/
  796d2059-14e9-44e3-80a7-2dff9833f879/download/PrecoTaxaTesouroDireto.csv
```

**Campos do CSV:**
- `Tipo Titulo` — ex: "Tesouro Selic 2029", "Tesouro IPCA+ 2035"
- `Data Vencimento` — DD/MM/YYYY
- `Data Base` — DD/MM/YYYY (data de pregão)
- `Taxa Compra Manha` / `Taxa Venda Manha` — % a.a. (decimal vírgula)
- `PU Compra Manha` / `PU Venda Manha` — R$ (preço unitário)
- `PU Base Manha` — PU de referência

**Frequência sugerida de ETL:** diária, em dia útil após 13h BRT

---

### Princípio arquitetural (Arquiteto)

```
Tesouro Transparente CSV
        ↓  (ETL: etl/rf_tesouro.py)
  Supabase PostgreSQL
  ├── rf_titulos      (cadastro dos títulos)
  └── rf_historico    (taxa e PU diários)
        ↓  (API: backend/routes/rf.py)
  FastAPI /rf/titulos
  FastAPI /rf/historico/{codigo}
        ↓  (fetch: frontend/lib/api.ts)
  Next.js frontend/app/rf/page.tsx
```

O frontend **nunca** chama o Tesouro Transparente diretamente.

---

## Tabelas de banco (existentes + migration)

### Tabelas existentes (`database/schema.sql`)

```sql
rf_titulos (
  codigo          VARCHAR(30) UNIQUE,   -- ex: "LFT_2029-03-01"
  nome            VARCHAR(200),          -- ex: "Tesouro Selic 2029"
  emissor         VARCHAR(100),
  tipo            VARCHAR(30),           -- "Tesouro"
  indexador       VARCHAR(20),           -- "SELIC" | "IPCA" | "PRE"
  data_vencimento DATE,
  ...
)

rf_historico (
  codigo        VARCHAR(30) FK rf_titulos,
  data          DATE,
  pu_mercado    NUMERIC(18,6),          -- PU Venda Manhã
  taxa_mercado  NUMERIC(10,6),          -- Taxa Venda Manhã (yield do investidor)
  UNIQUE (codigo, data)
)
```

### Migration necessária (`database/schema_rf_migration.sql`)

```sql
ALTER TABLE rf_historico
  ADD COLUMN IF NOT EXISTS taxa_compra NUMERIC(10,6),  -- Taxa Compra Manhã
  ADD COLUMN IF NOT EXISTS pu_compra   NUMERIC(18,6);  -- PU Compra Manhã

ALTER TABLE rf_titulos
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE;
```

**⚠️ Executar no Supabase SQL Editor ANTES de rodar o ETL.**

---

## Mapeamento de códigos

| Nome no CSV | `codigo` gerado | `indexador` | `nome_display` |
|---|---|---|---|
| Tesouro Selic 2029 | LFT_2029-03-01 | SELIC | Tesouro Selic |
| Tesouro IPCA+ 2035 | IPCA_2035-05-15 | IPCA | Tesouro IPCA+ |
| Tesouro IPCA+ com Juros Semestrais 2055 | IPCAS_2055-05-15 | IPCA | Tesouro IPCA+ Juros Sem. |
| Tesouro Prefixado 2031 | PRE_2031-01-01 | PRE | Tesouro Prefixado |
| Tesouro Prefixado com Juros Semestrais 2033 | PRES_2033-01-01 | PRE | Tesouro Prefixado Juros Sem. |
| Tesouro RendA+ 2045 | RENDA_2045-12-15 | IPCA | Tesouro RendA+ |
| Tesouro Educa+ 2045 | EDUCA_2045-12-15 | IPCA | Tesouro Educa+ |

---

## Arquivos criados/alterados

| Arquivo | Tipo | Status |
|---|---|---|
| `database/schema_rf_migration.sql` | SQL migration | ✅ Criado |
| `etl/rf_tesouro.py` | ETL Python | ✅ Criado |
| `backend/routes/rf.py` | FastAPI route | ✅ Criado |
| `backend/main.py` | Registro do router | ✅ Alterado |
| `frontend/lib/api.ts` | Tipos e funções de API | ✅ Alterado |
| `frontend/app/rf/page.tsx` | Página Renda Fixa | ✅ Criada |
| `frontend/components/Sidebar.tsx` | Link "Renda Fixa" | ✅ Alterado |
| `docs/plano_renda_fixa.md` | Este documento | ✅ Criado |

---

## Rotas de API

### `GET /rf/titulos`

Retorna todos os títulos Tesouro com taxa mais recente.

```json
{
  "data": [
    {
      "codigo": "LFT_2029-03-01",
      "nome": "Tesouro Selic 2029",
      "nome_display": "Tesouro Selic",
      "indexador": "SELIC",
      "tipo_curto": "LFT",
      "cor": "#10b981",
      "data_vencimento": "2029-03-01",
      "ativo": true,
      "taxa_atual": 14.87,
      "pu_atual": 14870.33,
      "data_taxa": "2026-06-05"
    }
  ],
  "total": 12,
  "data_referencia": "2026-06-05"
}
```

### `GET /rf/historico/{codigo}?limit=252`

Retorna histórico de taxa e PU para um título.

```json
{
  "codigo": "LFT_2029-03-01",
  "data": [
    {
      "codigo": "LFT_2029-03-01",
      "data": "2026-06-05",
      "taxa_mercado": 14.87,
      "pu_mercado": 14870.33,
      "taxa_compra": 14.89,
      "pu_compra": 14876.56
    }
  ]
}
```

---

## Checklist de execução (para quando acordar)

### 1. Criar a branch e commitar os arquivos

```powershell
cd C:\Users\lufer\Claude\Projects\plataforma-mcp-brasil

# Criar e mudar para a branch
git checkout -b feature/renda-fixa

# Adicionar todos os novos arquivos RF
git add database/schema_rf_migration.sql
git add etl/rf_tesouro.py
git add backend/routes/rf.py
git add backend/main.py
git add frontend/lib/api.ts
git add frontend/app/rf/
git add frontend/components/Sidebar.tsx
git add docs/plano_renda_fixa.md

# Commit
git commit -m "feat: add Renda Fixa feature (Tesouro Direto)

- ETL etl/rf_tesouro.py via Tesouro Transparente CSV API
- FastAPI routes /rf/titulos e /rf/historico/{codigo}
- Frontend page /rf matching MVP style
- Sidebar updated with Renda Fixa link
- DB migration: taxa_compra, pu_compra, ativo columns
- Planning doc in docs/plano_renda_fixa.md"

# Push da branch
git push -u origin feature/renda-fixa
```

### 2. Executar migration no Supabase

No painel do Supabase → SQL Editor, executar o conteúdo de:
```
database/schema_rf_migration.sql
```

### 3. Executar o ETL localmente

```powershell
cd etl
.\venv\Scripts\Activate.ps1
python rf_tesouro.py
```

**Saída esperada:**
```
ETL Tesouro Direto
[1/4] Baixando CSV do Tesouro Transparente...
  ✓ ~3.500 KB baixados
[2/4] Processando CSV...
  ~200.000 linhas · colunas: [Tipo Titulo, Data Vencimento, ...]
  ~50.000 linhas após filtro 2020+
[3/4] Atualizando rf_titulos...
  ✓ ~15 títulos
[4/4] Atualizando rf_historico...
  50.000/50.000 (100%)
  ✓ rf_historico — 50.000 registros
ETL Tesouro Direto concluído
```

> ⚠️ **Se der erro de coluna (taxa_compra não existe):** confirme que executou a migration do passo 2.

### 4. Testar o backend localmente

```powershell
cd backend
.\venv\Scripts\Activate.ps1
uvicorn main:app --reload
```

Testar em http://localhost:8000/rf/titulos — deve retornar JSON com os títulos.

### 5. Testar o frontend localmente

```powershell
cd frontend
npm run dev
```

Acessar http://localhost:3000/rf — deve mostrar a lista de títulos com taxas e gráfico histórico.

### 6. Criar o Pull Request

Após validação local, criar PR de `feature/renda-fixa` → `main`.

---

## Riscos e mitigações

| Risco | Probabilidade | Mitigação |
|---|---|---|
| CSV com encoding diferente | Média | ETL tenta UTF-8-BOM e faz fallback para latin-1 |
| Colunas renomeadas no CSV | Baixa | ETL valida colunas e mostra mensagem de erro clara |
| rf_titulos com `codigo` VARCHAR(30) pequeno | Baixa | Formato `TIPO_YYYY-MM-DD` cabe (máx 16 chars) |
| `taxa_compra` coluna inexistente | Alta (antes da migration) | ETL falha graciosamente; migration resolve |
| Tesouro Transparente fora do ar | Baixa | Tentar novamente após alguns minutos |
| Dados de ontem/anteontem (feriado) | Normal | O backend retorna `data_referencia` para o frontend exibir |

---

## Próximos passos (pós-merge)

1. **GitHub Actions** — agendar ETL diário às 14h BRT (após pregão)
2. **Taxas bancárias** — adicionar CDB médio, LCI, LCA via BCB SGS em venv isolado
3. **Comparativo** — mostrar Tesouro Selic vs CDI vs IPCA no mesmo gráfico
4. **Spread IPCA+** — exibir spread sobre IPCA (ex: "IPCA + 6,5%")
5. **Alertas** — notificar quando taxa IPCA+ atingir threshold definido pelo usuário
