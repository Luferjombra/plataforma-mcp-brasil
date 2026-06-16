# Status — Plataforma Investimento

_Atualizado em: 2026-06-07_

---

## ✅ Atividades Realizadas

1. **Fix no ETL de Renda Variável** (`etl/rv_historico.py`) — parâmetros `startDate`/`endDate` corrigidos; removido `range=5y` que causava erro 400 na brapi.

2. **Análise comparativa brapi vs Tesouro Transparente (Renda Fixa)** — conclusão: a fonte oficial (Tesouro Transparente) é superior: gratuita, histórico desde 2002, sem rate limit. brapi descartada para RF.

3. **Análise de arquitetura MCP** — decisão de adotar `fastapi-mcp` para expor as rotas FastAPI existentes como ferramentas MCP via endpoint `/mcp` no mesmo serviço Render. Zero reescrita necessária.

4. **Criação da skill "Arquiteto" no Cowork** — skill especializada em decisões de arquitetura de dados: pipelines ETL, dashboards, integração com fontes públicas brasileiras (CVM, BCB, B3, mcp-brasil) e Supabase.

5. **ETLs estruturados** para as quatro famílias de produto:
   - Renda Variável — brapi
   - Renda Fixa — Tesouro Transparente
   - Fundos
   - Indicadores macroeconômicos

---

## 🔜 Próximos Passos

1. **Implementar MCP no FastAPI** — `pip install fastapi-mcp` + ~10 linhas em `main.py`; expor endpoint `/mcp` no Render.

2. **Estabilizar ETLs restantes** (Fundos, Indicadores) — auditar erros similares ao corrigido em `rv_historico.py`; garantir que todos os ETLs rodam sem falhas.

3. **Dashboard de histórico e cotação atual** — uma visão por família de produto (RV, RF, Fundos) com série histórica e valor mais recente.

4. **Abas por família de produto no frontend** — separar navegação entre RV, RF, Fundos e Indicadores.

5. **Feed RSS de novidades do mercado financeiro** — integrar fonte(s) confiável(is) para exibir notícias relevantes na plataforma.

6. **Módulo Carteira** — rastreamento de posições e cálculo de performance por ativo e por carteira.

7. **Assistente de pesquisa** — interface conversacional sobre dados históricos, com outputs estruturados de estudos e análises.
