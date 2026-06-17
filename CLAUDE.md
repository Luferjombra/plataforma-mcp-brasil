# Plataforma MCP Brasil

Plataforma de dados financeiros brasileiros (CVM, BCB/BACEN, B3) com stack Next.js + FastAPI + Supabase.

## Stack
- **Frontend**: Next.js (TypeScript)
- **Backend**: FastAPI (Python)
- **Database**: Supabase (PostgreSQL)
- **ETL**: Python scripts + GitHub Actions
- **Dados**: CVM, BCB/BACEN, B3, brapi.dev, yfinance

## Estrutura
- `frontend/` — Next.js app
- `backend/` — FastAPI + ETL scripts
- `database/` — schemas e migrations
- `etl/` — pipelines de ingestão de dados
- `monitoring/` — scripts de monitoramento

## Convenções
- `venv/` deve estar no `.gitignore` — nunca commitar

## Skills disponíveis

### UI & Design
- `.claude/skills/ui-ux-pro-max/` — 67 estilos UI, 161 paletas de cores, 57 font pairings, 25 tipos de charts

### Context Engineering
- `.claude/skills/context-fundamentals/` — fundamentos: janela de contexto, atenção, princípios
- `.claude/skills/context-degradation/` — diagnóstico de falhas: lost-in-middle, poisoning, distraction
- `.claude/skills/context-compression/` — compressão de contexto, summarization de sessões longas
- `.claude/skills/context-optimization/` — KV-cache, observation masking, partitioning, budgets
- `.claude/skills/multi-agent-patterns/` — supervisor, swarm, hierárquico, isolamento de contexto
- `.claude/skills/memory-systems/` — Mem0, Zep/Graphiti, Letta, Cognee — memória cross-session
- `.claude/skills/tool-design/` — design de ferramentas, descriptions, consolidação, MCP naming
- `.claude/skills/filesystem-context/` — scratchpads, offloading, sub-agent communication
- `.claude/skills/latent-briefing/` — KV cache sharing entre orquestrador e workers
- `.claude/skills/evaluation/` — avaliação de agentes, rubrics, LLM-as-judge, pipelines de qualidade
- `.claude/skills/advanced-evaluation/` — direct scoring, pairwise comparison, bias mitigation
- `.claude/skills/harness-engineering/` — loops de pesquisa autônoma, superfícies locked/editable
- `.claude/skills/project-development/` — fit task-model, pipelines batch, estimativa de custos
- `.claude/skills/bdi-mental-states/` — modelagem BDI: beliefs, desires, intentions, RDF
- `.claude/skills/hosted-agents/` — infraestrutura de agentes hosted, warm pools, sandboxes
