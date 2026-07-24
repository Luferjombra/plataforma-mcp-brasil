---
name: guardiao-merge
description: >
  Guardião de merge para a Plataforma MCP Brasil. Use SEMPRE antes de abrir um
  PR, mergear, ou "subir os ajustes pra main / produção" — e sempre que o
  usuário disser "sobe pra main", "sobe pra prod", "abre o PR", "faz o merge",
  "manda pra produção", ou pedir pra publicar/deployar qualquer mudança.
  Também dispare no início de qualquer tarefa que vá modificar código do repo,
  pra confirmar que a branch de trabalho não está desatualizada em relação à
  main antes de construir em cima dela. O objetivo é impedir que a gente perca
  ajustes ou REVERTA trabalho que já está em produção por causa de uma branch
  divergente — a dor real que ocorreu quando a branch de trabalho estava
  baseada num estado antigo da main e um merge teria desfeito PRs já mergeados.
---

# Guardião de Merge — Plataforma MCP Brasil

Você é o guardião que roda **antes de subir qualquer coisa pra `main`**. Seu
trabalho é garantir que o merge **adiciona** o trabalho pretendido sem
**reverter** nada que já está em produção, e que nenhum ajuste se perca.

## Por que essa skill existe (o incidente que a motivou)

Numa sessão, o trabalho foi construído numa branch (`claude/…`) que tinha
divergido da `main` fazia tempo. Enquanto isso, a `main` recebeu vários PRs
(reescrita do Copiloto de Gemini→proxy LibreChat, #16–21). Como a branch de
trabalho não tinha esses commits, o `git diff origin/main..HEAD` mostrava que
mergear **deletaria** `librechat_client.py`, reverteria o `orchestrator.py` e
recriaria arquivos que a main já tinha removido — ou seja, o merge **quebraria
o chat de produção**. Foi pego por acaso, olhando o diff antes de mergear.

**A regra que nasce disso:** antes de abrir PR ou mergear, sempre rode o
protocolo abaixo. Divergência de branch é silenciosa — o CI fica verde, o PR
fica "mergeable", e mesmo assim você reverte produção.

## Protocolo obrigatório (rode na ordem)

### 1. Atualize a referência da main
```bash
git fetch origin main
```

### 2. A branch está atrás da main? (o sinal mais importante)
```bash
git log HEAD..origin/main --oneline
```
- **Vazio** → a branch tem toda a main. Bom, siga.
- **Qualquer commit listado** → 🔴 **PARE**. A branch está desatualizada: a
  main andou pra frente e seu trabalho não tem esses commits. Mergear/rebasar
  sem cuidado pode reverter esses PRs. Vá pra "Se divergiu" abaixo.

### 3. O que o merge REALMENTE faria? (procure reversões)
```bash
git diff origin/main..HEAD --stat
```
Leia a lista com desconfiança. 🔴 **Bandeiras vermelhas:**
- Arquivos **deletados** (`D` / linhas `-NNN`) que **você não deletou de
  propósito** — especialmente arquivos que você nem reconhece (foram criados
  por outro PR recente).
- Arquivos que voltam a um estado antigo (muitas remoções num arquivo que
  outra pessoa reescreveu).
- Qualquer arquivo fora do escopo da sua mudança aparecendo no diff.

Se algo assim aparecer, inspecione: `git show origin/main:<arquivo>` vs a sua
versão. Confirme que a diferença é **intencional**, não uma reversão cega.

### 4. Quão velha é a base da branch?
```bash
git merge-base HEAD origin/main   # onde a branch saiu da main
git log --oneline -1 origin/main  # onde a main está hoje
```
Se a base for muito anterior ao HEAD da main (vários PRs no meio), trate como
divergência — mesmo que o passo 2 pareça ok.

### 5. Confirme o estado de merge no PR
Ao ler o PR (`pull_request_read` method `get`), cheque `mergeable_state`:
- `"clean"` → ok.
- `"dirty"` / `"behind"` → 🔴 conflito ou branch atrás. Não mergeie; reconcilie.

## Se divergiu (passos 2/3/4 acusaram)

**Não mergeie a branch como está.** Escolha:

- **Reconciliação simples** (a main só avançou, sem conflito com seu trabalho):
  recrie a branch a partir da main atual e reaplique seus commits em cima:
  ```bash
  git fetch origin main
  git checkout -B <sua-branch> origin/main
  # traga seus arquivos/commits — cherry-pick ou reaplicar as edições
  ```
- **Reconciliação arquitetural** (a main mudou algo que seu trabalho também
  mexe — ex: duas implementações do mesmo módulo): **pare e alinhe com o
  usuário** antes de reconciliar. Mostre o que a main tem hoje vs o que você
  construiu, e confirme a direção (substituir? coexistir?). Só então reaplique
  seu trabalho **sobre a main atual**, arquivo por arquivo, verificando com
  `git show origin/main:<arquivo>` que nada de produção está sendo revertido
  sem intenção.

Depois de reconciliar, rode o protocolo de novo desde o passo 1.

## Regras de ouro

- **CI verde ≠ merge seguro.** O `qa_run.py` roda contra produção; ele não vê
  que seu PR reverteria código. A verificação de reversão é só o diff.
- **`mergeable: true` ≠ merge seguro.** Um PR pode mergear limpo e ainda assim
  desfazer trabalho, se a branch simplesmente não tinha aqueles commits.
- **Nunca mergeie com o usuário dizendo "tem algo errado"** — investigue o
  diff contra a main primeiro.
- **Confirme antes de subir pra produção.** Merge pra `main` dispara redeploy
  (Render/Vercel). É outward-facing: confirme a direção com o usuário antes,
  ainda que ele já tenha pedido "sobe" — divergência muda o que "subir"
  significa.
- **Toda mudança sobe por PR + pair-review**, nunca commit direto na `main`
  (convenção do projeto).

## Saída esperada

Depois de rodar o protocolo, reporte em uma linha cada:
- Commits da main faltando na branch (passo 2): quantos, quais.
- Reversões suspeitas no diff (passo 3): nenhuma / lista.
- Veredito: **SEGURO SUBIR** / **DIVERGIU — reconciliar antes** / **PARAR —
  decisão do usuário necessária**.
