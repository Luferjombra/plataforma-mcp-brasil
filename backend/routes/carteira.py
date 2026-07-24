"""
Rotas de Carteira — rastreamento de posições e métricas de performance.
POST   /carteira/posicoes           → adicionar posição
POST   /carteira/posicoes/importar  → importar posições em lote via CSV ou XLSX (extrato de outra corretora)
GET    /carteira/posicoes           → listar posições com preço atual e P&L
DELETE /carteira/posicoes/{id}      → remover posição
GET    /carteira/analise            → P&L consolidado + métricas de risco
"""
import asyncio
import csv
import io
import logging
import zipfile
from collections import defaultdict
from datetime import date

import defusedxml.ElementTree as ET

from fastapi import APIRouter, File, HTTPException, Path, Query, UploadFile
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field

from carteira.importacao import (
    COLUNAS_OBRIGATORIAS,
    decodificar_csv,
    extrair_linhas_xlsx,
    validar_linha,
)
from carteira.metricas import calcular_todas
from db import supabase

logger = logging.getLogger(__name__)
router = APIRouter()


class PosicaoCreate(BaseModel):
    ticker: str = Field(..., description="Ticker B3 (ex: PETR4, VALE3, MXRF11)")
    tipo: str = Field(..., description="Tipo do ativo: 'acao', 'fii' ou 'etf'")
    quantidade: float = Field(..., gt=0, description="Quantidade de cotas/ações compradas")
    preco_medio: float = Field(..., gt=0, description="Preço médio de compra em R$")
    data_entrada: str = Field(
        default_factory=lambda: date.today().isoformat(),
        description="Data de entrada no formato YYYY-MM-DD. Padrão: hoje.",
    )


@router.post("/posicoes", status_code=201, tags=["Carteira Escrita"])
def add_posicao(
    body: PosicaoCreate,
    session_id: str = Query(..., description="ID da sessão. Isola carteiras entre usuários."),
):
    """
    Adiciona uma posição de ativo à carteira da sessão informada.
    Aceita ações, FIIs e ETFs listados na B3.

    Use quando o usuário disser "comprei", "adicionei", "tenho X ações/cotas de Y",
    "entrada em", ou fornecer ticker + quantidade + preço médio de compra.

    Retorna: { id, session_id, ticker, tipo, quantidade, preco_medio, data_entrada }
    """
    # Não enviar "id" no payload: deixa o banco gerar (funciona com UUID DEFAULT e BIGSERIAL)
    posicao = {
        "session_id":   session_id,
        "ticker":       body.ticker.upper().strip(),
        "tipo":         body.tipo,
        "quantidade":   body.quantidade,
        "preco_medio":  body.preco_medio,
        "data_entrada": body.data_entrada,
    }
    try:
        result = supabase.table("carteira_posicoes").insert(posicao).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao inserir posição: {e}")
    if not result.data:
        raise HTTPException(status_code=500, detail="Posição não foi salva — sem dados retornados.")
    row = result.data[0]
    row["id"] = str(row["id"])  # normaliza UUID ou BIGSERIAL para string
    return row


# Guarda contra zip bomb / arquivo hostil -- endpoint público, upload de
# usuário, achado de pair-review: sem isso, um zip pequeno mas malicioso
# (poucos KB comprimidos, GBs descomprimidos) travaria o único worker
# uvicorn do Render (ver comentário de asyncio.to_thread em get_analise
# logo abaixo neste arquivo) e junto todas as requisições em voo da
# plataforma, não só a do atacante. O limite por-entry-descomprimida
# (TAMANHO_MAX_ENTRY_DESCOMPRIMIDO) vive em carteira/importacao.py, perto
# de onde o zip é de fato aberto.
TAMANHO_MAX_UPLOAD = 5 * 1024 * 1024  # 5 MB -- relatório de carteira real não chega perto disso


@router.post("/posicoes/importar", tags=["Carteira Escrita"])
async def importar_posicoes(
    session_id: str = Query(..., description="ID da sessão. Isola carteiras entre usuários."),
    arquivo: UploadFile = File(
        ...,
        description="CSV (ticker,tipo,quantidade,preco_medio,data_entrada) ou XLSX de "
                    "relatório de custódia de corretora/banco (ex: BTG)",
    ),
):
    """
    Importa várias posições de uma vez a partir de um arquivo -- pensado
    pra trazer o extrato de outra corretora/banco sem cadastrar posição
    por posição (Fase 1 do roadmap de importação de carteira).

    Aceita dois formatos, detectados pelo conteúdo (não pela extensão --
    relatórios de corretora costumam vir com extensão .xls mesmo sendo
    XLSX de verdade, achado ao vivo):

    1. CSV (separador vírgula, cabeçalho obrigatório):
    `ticker,tipo,quantidade,preco_medio,data_entrada` -- `tipo` é 'acao',
    'fii' ou 'etf'; `data_entrada` é opcional (AAAA-MM-DD, padrão hoje se
    ausente). `quantidade`/`preco_medio` aceitam formato simples (1500,
    38.50) ou BR/US com separador de milhar (1.500,50 ou 1,500.50) -- um
    número tipo "1.500" sozinho (1 ponto, sem vírgula) é rejeitado por ser
    ambíguo entre milhar e casas decimais.

    2. XLSX de relatório de custódia (testado ao vivo contra um relatório
    real do BTG): procura automaticamente, em qualquer aba, uma tabela com
    cabeçalho Código/Tipo/Qtde./Preço Médio -- não depende do nome da aba
    nem da corretora ser especificamente o BTG. Não tem coluna de data de
    entrada (BTG não expõe isso no relatório de custódia), então todas as
    posições importadas por XLSX usam a data de hoje -- séries históricas
    de performance calculadas a partir daí não refletem a data de compra
    real.

    Cada linha/posição vale as mesmas regras de POST /carteira/posicoes.

    Use quando o usuário quiser subir um extrato/relatório com várias
    posições de uma corretora ou banco (ex: BTG, XP, Itaú) em vez de
    cadastrar uma por uma.

    Retorna: { inseridas, total_linhas, erros: [{ linha, motivo }] }
    -- linhas inválidas são reportadas em `erros`, não derrubam as válidas.
    """
    # Lê no máximo TAMANHO_MAX_UPLOAD+1 bytes -- limita o custo de memória/CPU
    # do parse abaixo independente de quão grande o arquivo enviado seja
    # (achado de pair-review: sem isso, um upload hostil de poucos KB
    # comprimidos mas GBs descomprimidos travava o único worker uvicorn do
    # Render, derrubando toda a plataforma, não só essa requisição).
    bruto = await arquivo.read(TAMANHO_MAX_UPLOAD + 1)
    if len(bruto) > TAMANHO_MAX_UPLOAD:
        raise HTTPException(
            status_code=413,
            detail=f"Arquivo muito grande (máx {TAMANHO_MAX_UPLOAD // (1024 * 1024)}MB).",
        )

    if zipfile.is_zipfile(io.BytesIO(bruto)):
        try:
            # Parse de XML/zip é CPU-bound e síncrono -- roda em thread pra
            # não travar o event loop do único worker (mesmo padrão de
            # asyncio.to_thread já usado em get_posicoes/get_analise/search.py
            # neste projeto), reforçado pelos guards de tamanho acima.
            linhas = await asyncio.to_thread(extrair_linhas_xlsx, bruto)
        except (KeyError, ValueError, ET.ParseError, zipfile.BadZipFile) as e:
            raise HTTPException(status_code=400, detail=f"Não consegui ler o XLSX: {e}")
        if not linhas:
            raise HTTPException(
                status_code=400,
                detail="Não encontrei uma tabela de posições reconhecível no arquivo "
                       "(esperado colunas tipo Código/Tipo/Qtde./Preço Médio).",
            )
    else:
        conteudo = decodificar_csv(bruto)
        leitor = csv.DictReader(io.StringIO(conteudo))
        faltando = COLUNAS_OBRIGATORIAS - set(c.strip().lower() for c in (leitor.fieldnames or []))
        if faltando:
            raise HTTPException(
                status_code=400,
                detail=f"CSV sem as colunas obrigatórias: {sorted(faltando)}. "
                       f"Esperado: ticker,tipo,quantidade,preco_medio,data_entrada (data_entrada é opcional).",
            )
        linhas = list(leitor)

    posicoes_validas = []
    erros = []
    for numero, linha in enumerate(linhas, start=2):  # linha 1 é o cabeçalho
        try:
            posicoes_validas.append({"session_id": session_id, **validar_linha(linha)})
        except ValueError as e:
            erros.append({"linha": numero, "motivo": str(e)})

    if posicoes_validas:
        try:
            supabase.table("carteira_posicoes").insert(posicoes_validas).execute()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Erro ao inserir posições: {e}")

    return {"inseridas": len(posicoes_validas), "total_linhas": len(linhas), "erros": erros}


@router.get("/posicoes", tags=["Carteira Leitura"])
def get_posicoes(
    session_id: str = Query(..., description="ID da sessão. Isola carteiras entre usuários."),
):
    """
    Lista todas as posições abertas da carteira com o último preço conhecido
    (via rv_historico, atualizado diariamente) e P&L não-realizado por posição.

    Use quando o usuário perguntar "minhas posições", "o que tenho na carteira",
    "minha carteira", ou quiser ver P&L por ativo individualmente.

    Retorna: { data: [{ id, ticker, tipo, quantidade, preco_medio, preco_atual,
               pl_valor, pl_pct, valor_pos, data_preco }], total, valor_total }
    """
    res = (
        supabase.table("carteira_posicoes")
        .select("*")
        .eq("session_id", session_id)
        .order("created_at", desc=False)
        .execute()
    )
    posicoes = res.data or []

    tickers = list({p["ticker"] for p in posicoes})
    precos: dict[str, dict] = {}
    if tickers:
        # rv_variacao_diaria() (migration 004, ORDER BY ticker desde a 013)
        # já calcula o último preço por ticker via ROW_NUMBER particionado —
        # substitui a heurística frágil de LIMIT global (len(tickers)*5),
        # que podia dar cobertura desigual entre tickers (ver ADR-001, E3).
        try:
            res_precos = supabase.rpc("rv_variacao_diaria").in_("ticker", tickers).execute()
            for row in res_precos.data or []:
                precos[row["ticker"]] = row
        except Exception as e:
            logger.warning(f"rv_variacao_diaria indisponivel ({e}); tentando fallback por ticker.")

        # A RPC só olha os últimos 10 dias (pensada pra "variação diária" de
        # ativos ativamente negociados) — um ticker ilíquido que não negociou
        # nesse intervalo (FII de baixo volume, ou o padrão ELET3/RBRF11 do
        # ADR-001 item 5) simplesmente não aparece no resultado, mesmo tendo
        # preço histórico válido. Busca pontual por ticker (não um LIMIT
        # global) pra cobrir esses casos sem reintroduzir a heurística frágil.
        for t in [t for t in tickers if t not in precos]:
            res_fallback = (
                supabase.table("rv_historico")
                .select("data,fechamento")
                .eq("ticker", t)
                .order("data", desc=True)
                .limit(1)
                .execute()
            )
            if res_fallback.data:
                row = res_fallback.data[0]
                precos[t] = {"preco_atual": row["fechamento"], "data_preco": row["data"]}

    valor_total = 0.0
    resultado = []
    for p in posicoes:
        ticker = p["ticker"]
        info = precos.get(ticker, {})
        preco_atual = info.get("preco_atual")
        qtd = float(p["quantidade"])
        pm = float(p["preco_medio"])

        pl_valor = round((preco_atual - pm) * qtd, 2) if preco_atual else None
        pl_pct = round((preco_atual - pm) / pm * 100, 4) if preco_atual and pm > 0 else None
        valor_pos = round((preco_atual if preco_atual else pm) * qtd, 2)
        valor_total += valor_pos

        resultado.append({
            **p,
            "preco_atual": preco_atual,
            "data_preco":  info.get("data_preco"),
            "pl_valor":    pl_valor,
            "pl_pct":      pl_pct,
            "valor_pos":   valor_pos,
        })

    return {"data": resultado, "total": len(resultado), "valor_total": round(valor_total, 2)}


@router.delete("/posicoes/{posicao_id}", status_code=204, tags=["Carteira Escrita"])
def delete_posicao(
    posicao_id: str = Path(..., description="UUID da posição retornado pelo POST /carteira/posicoes."),
    session_id: str = Query(..., description="ID da sessão. Confirmação de ownership."),
):
    """
    Remove uma posição da carteira. Operação irreversível.

    Use quando o usuário disser "vendi", "remover", "tirar", "encerrar posição"
    seguido de um ticker. Confirme o ticker com o usuário antes de chamar.

    Retorna: 204 No Content em caso de sucesso. 404 se posição não encontrada.
    """
    # Converte id para int se possível (BIGSERIAL) para PostgREST fazer o cast correto
    try:
        id_val: int | str = int(posicao_id)
    except (ValueError, TypeError):
        id_val = posicao_id  # fallback para UUID string
    try:
        res = (
            supabase.table("carteira_posicoes")
            .delete()
            .eq("id", id_val)
            .eq("session_id", session_id)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao remover posição: {e}")
    if not res.data:
        raise HTTPException(status_code=404, detail="Posição não encontrada ou sem permissão.")


@router.get("/analise", tags=["Carteira Leitura"])
async def get_analise(
    session_id: str = Query(..., description="ID da sessão."),
    periodo_dias: int = Query(
        252, ge=21, le=1260,
        description="Janela de análise em pregões. 21=1mês, 63=3meses, 252=1ano.",
    ),
):
    """
    Retorna análise consolidada de performance: P&L total não-realizado,
    rentabilidade percentual, comparação com CDI e IBOV no período, e métricas
    de risco (Sharpe, Sortino, Calmar, drawdown máximo, win rate) calculadas
    sobre a série histórica reconstruída do valor da carteira via rv_historico.

    Use quando o usuário perguntar "como está minha carteira", "performance",
    "rentabilidade", "quanto ganhei/perdi", "comparado ao CDI/IBOV",
    "métricas de risco", "Sharpe", ou quiser análise consolidada da carteira.

    Retorna: { pl_total, rentabilidade_pct, vs_cdi_pp, vs_ibov_pp,
               sharpe, sortino, calmar, drawdown_max, win_rate,
               posicoes_count, valor_total, serie_carteira }
    """
    def _buscar_posicoes():
        return (
            supabase.table("carteira_posicoes")
            .select("*")
            .eq("session_id", session_id)
            .execute()
        )

    # Toda chamada bloqueante ao Supabase nesta rota async precisa passar por
    # asyncio.to_thread -- rodar `.execute()` (síncrono) direto aqui travaria
    # o event loop inteiro (achado de pair-review: o app sobe com 1 worker
    # uvicorn, então isso travaria TODAS as outras requisições em voo, pior
    # que o problema que o P7 tentou resolver).
    res = await asyncio.to_thread(_buscar_posicoes)
    posicoes = res.data or []
    metricas_vazias = {
        "sharpe": None, "sortino": None, "calmar": None,
        "drawdown_max": None, "win_rate": None,
    }
    if not posicoes:
        return {
            "pl_total": 0, "rentabilidade_pct": 0, "vs_cdi_pp": None, "vs_ibov_pp": None,
            "posicoes_count": 0, "valor_total": 0, "serie_carteira": [],
            "tickers_sem_preco_atual": [],
            **metricas_vazias,
        }

    tickers_unicos = list({p["ticker"] for p in posicoes})

    # Série histórica do valor da carteira via RPC (migration 015): alinha
    # por ticker/data e faz forward-fill (as-of join) no banco -- um ticker
    # ilíquido que não negociou num dia usa o último preço conhecido, em vez
    # de contribuir 0 pro valor daquele dia (ver E3b).
    datas: list[str] = []
    serie: list[float] = []
    def _buscar_serie_rpc():
        return supabase.rpc("carteira_serie_valor", {
            "p_tickers":       [p["ticker"] for p in posicoes],
            "p_quantidades":   [float(p["quantidade"]) for p in posicoes],
            "p_data_entradas": [p["data_entrada"] for p in posicoes],
            "p_periodo_dias":  periodo_dias,
        }).execute()

    try:
        res_serie = await asyncio.to_thread(_buscar_serie_rpc)
        for row in res_serie.data or []:
            datas.append(row["data"])
            serie.append(float(row["valor"]))
    except APIError as e:
        # PGRST202 = função não encontrada no schema cache do PostgREST --
        # migration 015 ainda não foi aplicada nesse ambiente. Qualquer outro
        # erro (bug na função SQL, dado inválido, etc.) sobe como 500 em vez
        # de cair silenciosamente no fallback abaixo, que é sabidamente
        # impreciso (dado financeiro -- não dá pra mascarar um bug real aqui).
        if e.code != "PGRST202":
            raise
        logger.warning(f"carteira_serie_valor indisponivel (migration 015 nao aplicada); usando fallback sem forward-fill: {e}")
        # Fallback: reconstrução antiga em Python -- sem forward-fill, LIMIT
        # global sem ORDER BY por ticker (o bug que a migration 015 resolve).
        # Mantido só pra não quebrar a rota enquanto a migration não roda.

        def _buscar_historico_fallback():
            return (
                supabase.table("rv_historico")
                .select("ticker,data,fechamento_adj,fechamento")
                .in_("ticker", tickers_unicos)
                .order("data", desc=True)
                .limit(periodo_dias * len(tickers_unicos))
                .execute()
            )

        res_hist = await asyncio.to_thread(_buscar_historico_fallback)
        hist_por_ticker: dict[str, list] = defaultdict(list)
        for row in res_hist.data or []:
            hist_por_ticker[row["ticker"]].append(row)
        valor_por_data: dict[str, float] = defaultdict(float)
        for p in posicoes:
            ticker = p["ticker"]
            qtd = float(p["quantidade"])
            data_entrada = p["data_entrada"]
            for row in hist_por_ticker.get(ticker, []):
                if row["data"] >= data_entrada:
                    preco = float(row.get("fechamento_adj") or row.get("fechamento") or 0)
                    valor_por_data[row["data"]] += preco * qtd
        datas = sorted(valor_por_data.keys())[-periodo_dias:]
        serie = [valor_por_data[d] for d in datas]

    # P&L e rentabilidade
    custo_total = sum(float(p["quantidade"]) * float(p["preco_medio"]) for p in posicoes)
    # `serie` vem vazia quando NENHUM ticker da carteira tem preço histórico
    # disponível (ex: posição recém-importada de ticker sem rv_historico
    # ainda) -- achado real (não hipotético): valor_atual = serie[-1] if
    # serie else 0.0 fazia pl_total = 0 - custo_total virar -100% de
    # "prejuízo", uma mentira (não sabemos o valor atual, não é que a
    # posição zerou). `valor_total` (valor absoluto) usa custo_total como
    # fallback, mesma convenção já usada em list_posicoes::valor_pos
    # (`preco_atual if preco_atual else pm`) -- mas pl_total/
    # rentabilidade_pct (delta/percentual) viram None, não 0, seguindo a
    # convenção que list_posicoes já usa pra pl_valor/pl_pct nesse mesmo
    # arquivo (achado de pair-review).
    sem_preco = not serie

    # Achado de pair-review (cobertura PARCIAL, não coberto pelo fix acima):
    # carteira_serie_valor faz COALESCE(preco, 0) por ticker/data -- um
    # ticker SEM preço nenhum (mas outros da carteira COM) não zera `serie`
    # inteira, só subestima o último ponto silenciosamente, sem o sintoma
    # óbvio do -100%. Corrige só valor_atual (o último ponto, que é o que
    # pl_total/rentabilidade_pct usam) -- serie_carteira completa (usada no
    # gráfico e nas métricas de risco) pode ainda subestimar dias mais
    # antigos pra esses tickers; corrigir isso exigiria a própria função
    # SQL devolver cobertura por ticker/data, fora do escopo deste fix.
    def _buscar_cobertura_precos():
        return supabase.rpc("rv_variacao_diaria").in_("ticker", tickers_unicos).execute()

    def _tickers_sem_preco_algum(tickers: list[str]) -> list[str]:
        """Confirma ponto a ponto (mesmo padrão de list_posicoes, poucas
        linhas acima) se cada ticker tem QUALQUER linha em rv_historico --
        não só dentro da janela de 10 dias (global, não da carteira) de
        rv_variacao_diaria. carteira_serie_valor faz forward-fill SEM
        limite de janela (migration 015: `h.data <= c.data`, sem corte de
        tempo) -- um ticker fora da janela de 10 dias mas com preço real
        mais antigo já está corretamente refletido em serie[-1]; tratá-lo
        como "sem preço" e somar o custo em cima seria dupla contagem real
        (achado de pair-review, confirmado lendo as duas funções SQL)."""
        sem_preco = []
        for t in tickers:
            res = (
                supabase.table("rv_historico")
                .select("data")
                .eq("ticker", t)
                .order("data", desc=True)
                .limit(1)
                .execute()
            )
            if not res.data:
                sem_preco.append(t)
        return sem_preco

    tickers_sem_preco_atual: list[str] = []
    if not sem_preco:
        tickers_com_preco_recente: set[str] = set()
        try:
            res_cobertura = await asyncio.to_thread(_buscar_cobertura_precos)
            tickers_com_preco_recente = {row["ticker"] for row in (res_cobertura.data or [])}
        except APIError as e:
            logger.warning(f"rv_variacao_diaria indisponivel pra checagem de cobertura de carteira: {e}")

        tickers_sem_confirmar = sorted(set(tickers_unicos) - tickers_com_preco_recente)
        if tickers_sem_confirmar:
            tickers_sem_preco_atual = await asyncio.to_thread(_tickers_sem_preco_algum, tickers_sem_confirmar)

    valor_atual = serie[-1] if serie else custo_total
    if tickers_sem_preco_atual:
        custo_sem_preco = sum(
            float(p["quantidade"]) * float(p["preco_medio"])
            for p in posicoes if p["ticker"] in tickers_sem_preco_atual
        )
        valor_atual += custo_sem_preco
    pl_total = None if sem_preco else (valor_atual - custo_total)
    rentabilidade_pct = None if sem_preco else (
        (pl_total / custo_total * 100) if custo_total > 0 else 0.0
    )

    # vs CDI e vs IBOV não dependem uma da outra -- rodam em paralelo (P7,
    # mesmo padrão de routes/search.py) em vez de 2 round-trips sequenciais.
    def _buscar_cdi():
        return (
            supabase.table("indicadores_economicos")
            .select("valor")
            .eq("serie", "cdi")
            .order("data", desc=True)
            .limit(len(datas))
            .execute()
        )

    def _buscar_ibov():
        return (
            supabase.table("rv_historico")
            .select("data,fechamento")
            .eq("ticker", "IBOV")
            .order("data", desc=True)
            .limit(len(datas))
            .execute()
        )

    res_cdi_result, res_ibov_result = await asyncio.gather(
        asyncio.to_thread(_buscar_cdi),
        asyncio.to_thread(_buscar_ibov),
        return_exceptions=True,
    )

    # vs_cdi/vs_ibov comparam contra a rentabilidade da própria carteira --
    # sem rentabilidade_pct (sem_preco=True) não tem com o que comparar.
    vs_cdi_pp = None
    if rentabilidade_pct is not None and not isinstance(res_cdi_result, BaseException) and res_cdi_result.data:
        cdi_acc = 1.0
        for row in res_cdi_result.data:
            cdi_acc *= (1 + float(row["valor"]) / 100)
        vs_cdi_pp = round(rentabilidade_pct - (cdi_acc - 1) * 100, 4)

    vs_ibov_pp = None
    if rentabilidade_pct is not None and not isinstance(res_ibov_result, BaseException):
        rows = res_ibov_result.data or []
        if len(rows) >= 2:
            inicio = float(rows[-1]["fechamento"])
            fim = float(rows[0]["fechamento"])
            if inicio > 0:
                vs_ibov_pp = round(rentabilidade_pct - (fim - inicio) / inicio * 100, 4)

    metricas = calcular_todas(serie) if len(serie) >= 22 else metricas_vazias

    return {
        "pl_total":          None if pl_total is None else round(pl_total, 2),
        "rentabilidade_pct": None if rentabilidade_pct is None else round(rentabilidade_pct, 4),
        "vs_cdi_pp":         vs_cdi_pp,
        "vs_ibov_pp":        vs_ibov_pp,
        "valor_total":       round(valor_atual, 2),
        "posicoes_count":    len(posicoes),
        "serie_carteira":    [{"data": d, "valor": round(v, 2)} for d, v in zip(datas, serie)],
        "tickers_sem_preco_atual": tickers_sem_preco_atual,
        **metricas,
    }
