# Erros & Soluções — Plataforma MCP Brasil

Registro de todos os erros encontrados durante o desenvolvimento (Semanas 1–4) e como foram resolvidos.

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
