# Erros & Soluções — Plataforma MCP Brasil

Registro de todos os erros encontrados durante o desenvolvimento (Semanas 1–5) e como foram resolvidos.

---

## Setup e ambiente

### Python 3.14 — pydantic-core sem wheels pré-compilados

**Erro:**
```
error: Microsoft Visual C++ 14.0 or greater is required
Building wheel for pydantic-core (pyproject.toml) ... error
```

**Causa:** Python 3.14 é muito recente — `pydantic-core` e outras dependências nativas ainda não têm wheels pré-compilados para 3.14 no Windows. Sem o Visual C++ Build Tools instalado, a compilação falha.

**Solução:** Instalar Python 3.12 e criar o venv com ele:
```powershell
py -3.12 -m venv venv
```

---

### PowerShell — ExecutionPolicy bloqueia ativação do venv

**Erro:**
```
.\venv\Scripts\Activate.ps1 cannot be loaded because running scripts is disabled on this system.
```

**Solução:** Liberar scripts para o usuário atual:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

---

### supabase-py — "Invalid API key" com chaves novas

**Erro:**
```
supabase.lib.client_options.ClientOptions
Invalid API key
```

**Causa:** `supabase-py 2.4.6` não suporta o novo formato de chave do Supabase (`sb_publishable_...` e `sb_secret_...`). Aceita apenas chaves JWT legadas.

**Solução:** No Supabase → Settings → API → seção **"Legacy anon, service_role API keys"** → copiar as chaves JWT (começam com `eyJ...`).

---

### websockets — ModuleNotFoundError

**Erro:**
```
ModuleNotFoundError: No module named 'websockets.asyncio'
```

**Solução:**
```powershell
pip install --upgrade websockets
```

---

## Git e controle de versão

### venv commitado acidentalmente (3.077 arquivos, 19MB)

**Causa:** `.gitignore` não incluía `venv/` antes do primeiro `git add .`.

**Solução:** Remover do índice Git (sem apagar os arquivos locais):
```powershell
git rm -r --cached backend/venv/
git commit -m "fix: remove venv do tracking do git"
git push
```

**Prevenção:** Sempre adicionar `venv/` e `.venv/` ao `.gitignore` **antes** do primeiro commit.

---

### git push falha — URL com placeholder

**Erro:**
```
remote: Repository not found
fatal: repository 'https://github.com/SEU_USUARIO/...' not found
```

**Causa:** URL do remote tinha o placeholder `SEU_USUARIO` em vez do usuário real.

**Solução:**
```powershell
git remote set-url origin https://github.com/Luferjombra/plataforma-mcp-brasil.git
```

---

### git — index.lock no sandbox Linux

**Causa:** Tentar rodar `git` no sandbox Linux sobre um caminho montado NTFS do Windows. O Git não funciona corretamente nesse contexto.

**Solução:** Todos os comandos git devem ser executados no **PowerShell do Windows**, não no terminal Linux/sandbox.

---

## ETL — Indicadores Econômicos

### PIB — NUMERIC overflow

**Erro:**
```
numeric field overflow — value with 16 digits before decimal point
```

**Causa:** Série BCB 4380 retorna o PIB em valor absoluto (R$ bilhões nominais — ex: 2.600.000.000.000), que excede o campo `NUMERIC(12,6)`.

**Solução:** Trocar para a série **7326** (variação percentual trimestral — ex: `0.9`), que cabe perfeitamente no campo.

---

## ETL — Renda Variável

### yfinance — NaN causa erro no PostgreSQL

**Erro:**
```
invalid input syntax for type numeric: "NaN"
```

**Causa:** yfinance retorna `float('nan')` para campos sem dados. O JSON serializa como `NaN` (sem aspas), que é inválido em PostgreSQL.

**Solução:** Função `safe_float()` que converte NaN/Inf para `None`:
```python
def safe_float(value) -> float | None:
    try:
        f = float(value)
        return None if math.isnan(f) or math.isinf(f) else round(f, 4)
    except (TypeError, ValueError):
        return None
```

---

### ELET3 — ação delistada

**Comportamento:** yfinance retorna DataFrame vazio para ELET3 (delistada).

**Solução implementada:** Detectar quando o último pregão foi há mais de 30 dias → marcar como `status = 'delisted'` na tabela `rv_ativos`. O histórico disponível é salvo normalmente.

---

## ETL — Fundos de Investimento (CVM)

### CVM — HTTP 403 Forbidden (Cloudflare WAF)

**Erro:**
```
HTTP 403 — resposta HTML da Cloudflare
```

**Causa:** `dados.cvm.gov.br` usa Cloudflare WAF que bloqueia todas as requisições HTTP automatizadas, independente de headers, User-Agent, Referer ou follow_redirects.

**Solução:** Baixar os arquivos **manualmente no navegador** e salvá-los em `etl/data/cvm/`. O script lê os arquivos locais.

**Links:**
- Cotas diárias: https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS/
- Cadastro: https://dados.cvm.gov.br/dados/FI/CAD/DADOS/cad_fi.csv

---

### mcp-brasil — conflito de dependências

**Causa:** `mcp-brasil` exige `httpx>=0.28.1` e `starlette>=1.2.1`, incompatíveis com `supabase-py 2.4.6` (`httpx<0.24`) e `fastapi 0.111.0` (`starlette<=0.37.2`).

**Solução:** Desinstalar mcp-brasil e reinstalar as dependências originais:
```powershell
pip uninstall mcp-brasil fastmcp fastmcp-slim starlette uvicorn -y
pip install -r ..\backend\requirements.txt
```

**Conclusão:** mcp-brasil não é adequado para ETL em ambiente compartilhado com FastAPI. Para pós-MVP, usar em venv isolado ou container Docker separado.

---

### CVM — Coluna CNPJ_FUNDO renomeada

**Erro:**
```
KeyError: 'CNPJ_FUNDO'
```

**Causa:** Arquivos CVM de 2024+ usam `CNPJ_FUNDO_CLASSE` em vez de `CNPJ_FUNDO` (mudança de schema da CVM).

**Solução:** Detectar e normalizar:
```python
col_cnpj = "CNPJ_FUNDO_CLASSE" if "CNPJ_FUNDO_CLASSE" in df.columns else "CNPJ_FUNDO"
df = df.rename(columns={col_cnpj: "CNPJ_FUNDO"})
```

---

### CVM — CNPJs duplicados no upsert

**Erro:**
```
postgrest.exceptions.APIError: ON CONFLICT DO UPDATE command cannot affect row a second time
```

**Causa:** `cad_fi.csv` e os arquivos `inf_diario_fi_*.csv/.zip` podem conter linhas duplicadas para o mesmo CNPJ (cadastro) ou CNPJ+data (histórico).

**Solução:** `drop_duplicates()` antes de cada upsert:
```python
# No cadastro:
df = df.drop_duplicates(subset=["CNPJ_FUNDO"], keep="first")

# No histórico:
df = df.drop_duplicates(subset=["CNPJ_FUNDO", "DT_COMPTC"], keep="first")
```

---

### CVM — CNPJs alvo não encontrados na base

**Problema:** Os CNPJs inicialmente escolhidos não existiam nos arquivos de cotas diárias (fundos cancelados ou inexistentes).

**Diagnóstico:** Cruzar `cad_fi.csv` com os CNPJs presentes nos arquivos de cotas para encontrar apenas fundos com dados reais recentes.

**Solução:** Script `etl/cruzar_cnpjs.py` que:
1. Carrega todos os CNPJs presentes nos últimos 3 meses de cotas
2. Filtra o `cad_fi.csv` por esse conjunto
3. Busca por termos (Verde, SPX, Kinea, etc.) apenas entre os com dados reais

---

### ETL log — formato de data inválido

**Erro:**
```
invalid input syntax for type date: "202401.-01"
invalid input syntax for type date: "202401-01"
```

**Causa 1:** Arquivo `.zip` — a extensão `.zip` não estava sendo removida, resultando em `"202401."[:7]` → `"202401."` → `"202401.-01"`.

**Causa 2:** Após remover `.zip`, o resultado `"202401"` tem 6 chars — o formato esperado é `YYYY-MM-DD`, não `YYYYMM-DD`.

**Solução final:**
```python
yyyymm = nome.replace("inf_diario_fi_", "").replace(".csv", "").replace(".zip", "")
data_inicio = f"{yyyymm[:4]}-{yyyymm[4:6]}-01"
```

---

## Variáveis de ambiente

### ANTHROPIC_API_KEY com formato errado (UUID)

**Causa:** Chave copiada incorretamente — era o ID de sessão (UUID) em vez da API Key real.

**Formato correto:** `sk-ant-api03-...` (gerada em console.anthropic.com → API Keys → Create Key)

---

---

## Frontend — Deploy e Build

### Vercel — TypeScript error: Recharts Tooltip formatter

**Erro:**
```
Type error: Type '(v: number) => [string, string]' is not assignable to type
'Formatter<ValueType, NameType>'
Types of parameters 'v' and 'value' are incompatible.
Type 'ValueType | undefined' is not assignable to type 'number'.
```

**Causa:** O tipo do parâmetro `v` no `formatter` do Recharts `<Tooltip>` é `ValueType | undefined`, não `number`. O TypeScript rejeita quando o parâmetro é tipado como `number` diretamente.

**Solução:** Usar guard de tipo antes de chamar métodos de número:
```tsx
formatter={(v) => [typeof v === 'number' ? `${v.toFixed(2)}%` : '—', 'Label']}
```

---

### Vercel — build usa commit antigo após push

**Sintoma:** Vercel continua falhando com o erro antigo mesmo após aplicar o fix localmente.

**Causa:** O fix foi editado nos arquivos locais mas não foi commitado/enviado antes do push anterior. O Vercel está buildando o commit antigo.

**Diagnóstico:** Rodar `git status` — se mostrar "nothing to commit, working tree clean" E o Vercel ainda falha, significa que o Vercel está buildando um deploy enfileirado antes do push.

**Solução:** Forçar novo build com commit vazio:
```powershell
git commit --allow-empty -m "chore: trigger vercel redeploy"
git push
```

---

### Render — Python 3.14 no deploy (pydantic-core sem build)

**Erro:**
```
error: Microsoft Visual C++ 14.0 or greater is required
Building wheel for pydantic-core (pyproject.toml) ... error
```

**Causa:** `runtime.txt` com `python-3.12.0` não é suficiente no Render — ele ignora o arquivo e usa Python 3.14 por padrão.

**Solução:** Adicionar variável de ambiente no painel do Render:
```
PYTHON_VERSION = 3.12.0
```

---

### Render — Root Directory vazio e typo no Start Command

**Erro:** Deploy falha sem logs claros.

**Causas identificadas:**
1. Campo "Root Directory" estava vazio (deve ser `backend`)
2. Start Command com typo: `vicorn` em vez de `uvicorn`

**Solução:** No painel Render → Settings → verificar:
- Root Directory: `backend`
- Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`

---

## Frontend — Fundos

### Fundos — lista mostra todos os fundos do banco, não só os 8 alvos

**Causa:** A rota `GET /fundos/` sem filtro retorna todos os registros de `fundos_cadastro`, que inclui fundos extras inseridos por engano ou testes.

**Solução:** Filtrar no backend pelos 8 CNPJs alvo:
```python
query = supabase.table("fundos_cadastro").select("*").in_("cnpj", CNPJS_ALVO)
```

---

### Fundos — nomes CVM ilegíveis (ex: "HEDGING-GRIFFO VERDE LI FUNDO DE APLICAC")

**Causa:** O campo `nome_abreviado` da CVM vem vazio para a maioria dos fundos. O fallback `f.nome.slice(0, 40)` corta o nome oficial em posição aleatória.

**Solução:** Mapa de nomes de exibição hardcoded no frontend indexado por CNPJ:
```typescript
const NOME_CURTO: Record<string, string> = {
  "04.222.368/0001-55": "Verde PVT Multimercado",
  // ...
}
```

---

### Fundos — "Sem dados históricos" para todos os fundos

**Causa raiz:** O CNPJ contém `/` (ex: `04.222.368/0001-55`). A URL gerada era `/fundos/historico/04.222.368/0001-55` — o FastAPI interpretava `0001-55` como segmento separado de rota e não encontrava o endpoint, retornando 404.

**Solução em dois arquivos:**

Backend — aceitar `/` no path parameter:
```python
@router.get("/historico/{cnpj:path}")
```

Frontend — URL-encode o CNPJ:
```typescript
fetch(`/fundos/historico/${encodeURIComponent(cnpj)}`)
```

---

## Frontend — Gráficos Recharts

### Recharts — labels dos eixos invisíveis no dark mode

**Causa:** Recharts renderiza os ticks como atributos SVG (`fill="..."`). Atributos SVG **não resolvem CSS custom properties** (`hsl(var(--muted-foreground))`). Apenas propriedades CSS aplicadas via stylesheet resolvem variáveis CSS. Por isso, `tick={{ fill: 'hsl(var(--muted-foreground))' }}` não funciona dentro de SVG no Recharts.

**Solução:** Usar `useTheme` do `next-themes` e passar cor literal baseada no tema atual:
```tsx
const { theme } = useTheme()
const tickColor = theme === 'dark' ? '#9ca3af' : '#6b7280'

<XAxis tick={{ fontSize: 10, fill: tickColor }} />
<YAxis tick={{ fontSize: 10, fill: tickColor }} />
```

---

### Recharts — eixo X e Y sobrepostos (labels espremidos)

**Causa:** Sem margem explícita no `<LineChart>`, sem `height` no `<XAxis>` e sem `width` no `<YAxis>`, o Recharts comprime o espaço e os labels ficam sobrepostos.

**Solução:**
```tsx
<LineChart margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
  <XAxis height={32} tickLine={false} />
  <YAxis width={56} tickLine={false} />
```

---

### Recharts — YAxis começando em 0 com muito espaço vazio

**Causa:** O domínio padrão do YAxis é `[0, 'auto']`, iniciando sempre do zero. Para séries como SELIC (14.5%), o gráfico fica com 90% de espaço vazio abaixo da linha.

**Solução:** `domain={['auto', 'auto']}` no YAxis para que o eixo se ajuste ao range real dos dados.

---

## ETL — Renda Fixa (Tesouro Direto)

### CSV do Tesouro Transparente — URL com 404

**Erro:**
```
HTTP 404 — arquivo não encontrado
```

**Causa:** O resource ID do CKAN mudou. A URL antiga usava `796d2059-14e9-44e3-80a7` (desatualizado).

**Solução:** Verificar URL atual em `tesourotransparente.gov.br/ckan/dataset/taxas-dos-titulos-ofertados-pelo-tesouro-direto`. URL correta (junho/2026):
```
https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-.../resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv
```

---

### ETL Tesouro Direto — taxas com valores absurdos (749%, 1072%)

**Sintoma:** Frontend exibe taxas impossíveis (ex: 749% a.a. para Tesouro IPCA+).

**Causa:** A função `safe_float()` fazia `.replace(".", "")` sobre valores já convertidos pelo pandas. O valor `7.49` (float) virava string `"7.49"`, o ponto decimal era removido → `"749"` → `float("749")` = 749.0.

**Solução:** Remover manipulação de string — pandas com `decimal=","` já entrega float correto:
```python
# ERRADO
v = float(str(val).replace(".", "").replace(",", "."))

# CORRETO
v = float(val)
```

---

## Referências rápidas

| Problema | Arquivo afetado | Solução |
|---|---|---|
| Python 3.14 sem wheels | venv | Usar `py -3.12 -m venv venv` |
| ExecutionPolicy | PowerShell | `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser` |
| Supabase Invalid API key | .env | Usar chaves JWT legadas (não sb_publishable_) |
| PIB overflow | etl/indicadores.py | Série 7326, não 4380 |
| NaN do yfinance | etl/rv_historico.py | Usar `safe_float()` |
| CVM 403 Cloudflare | etl/fundos.py | Download manual + leitura local |
| CNPJ_FUNDO renomeado | etl/fundos.py | Detectar e renomear coluna |
| Duplicatas no upsert | etl/fundos.py | `drop_duplicates()` antes do upsert |
| venv no git | .gitignore | Adicionar `venv/` antes do primeiro commit |
| Vercel TS error formatter | frontend/app/*/page.tsx | `typeof v === 'number'` guard |
| CNPJ com / quebra rota | backend/routes/fundos.py | `{cnpj:path}` + `encodeURIComponent` |
| Recharts ticks invisíveis | frontend/app/*/page.tsx | `useTheme` + cor literal |
| Labels eixos sobrepostos | frontend/app/*/page.tsx | `height`, `width`, `margin` no LineChart |
| YAxis começa em 0 | frontend/app/*/page.tsx | `domain={['auto', 'auto']}` |
| Tesouro CSV URL 404 | etl/rf_tesouro.py | Atualizar resource ID no CKAN |
| Taxas RF absurdas | etl/rf_tesouro.py | Remover `.replace(".")` — pandas já parseou decimal |
