"""
ETL — ANBIMA Feed API
Coleta: Índices IMA/IDA, Debêntures (cadastro + preços), VNA de títulos públicos.

Pré-requisito:
  Configurar no .env ou variáveis de ambiente:
    ANBIMA_CLIENT_ID=...
    ANBIMA_CLIENT_SECRET=...

Registro gratuito em: https://developers.anbima.com.br

Uso:
    python etl/anbima.py                  # roda todos os feeds
    python etl/anbima.py --feed indices   # só índices
    python etl/anbima.py --feed debentures
    python etl/anbima.py --feed vna
"""

import os
import sys
import base64
import argparse
from datetime import date, timedelta

import httpx
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', 'backend', '.env'))

from config import supabase
from log_etl import ETLRun, retry_request, log_partial

# ── Credenciais ───────────────────────────────────────────────────────────────
CLIENT_ID     = os.getenv("ANBIMA_CLIENT_ID")
CLIENT_SECRET = os.getenv("ANBIMA_CLIENT_SECRET")

BASE_URL      = "https://api.anbima.com.br"
TOKEN_URL     = f"{BASE_URL}/oauth/access-token"

# Índices disponíveis na API
INDICES_IMA = ["IMA-B", "IMA-B 5", "IMA-B 5+", "IMA-S", "IMA-GERAL", "IRF-M", "IRF-M 1", "IRF-M 1+"]
INDICES_IDA = ["IDA-DI", "IDA-GERAL", "IDA-IPCA"]
TODOS_INDICES = INDICES_IMA + INDICES_IDA

# VNA — tipos de título com VNA publicado
TITULOS_VNA = ["NTN-B", "LFT", "NTN-C"]


# ── Auth OAuth2 ───────────────────────────────────────────────────────────────
def get_access_token(client: httpx.Client) -> str:
    """Obtém Bearer token via OAuth2 Client Credentials."""
    if not CLIENT_ID or not CLIENT_SECRET:
        raise EnvironmentError(
            "ANBIMA_CLIENT_ID e ANBIMA_CLIENT_SECRET não configurados. "
            "Registre-se em https://developers.anbima.com.br e adicione ao .env"
        )

    credentials = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()
    resp = client.post(
        TOKEN_URL,
        headers={
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data={"grant_type": "client_credentials"},
        timeout=30.0,
    )
    if resp.status_code == 401:
        raise EnvironmentError(
            f"401 no token endpoint — verifique ANBIMA_CLIENT_ID/SECRET e se o "
            f"app está inscrito nas APIs no portal. Resposta: {resp.text[:300]}"
        )
    resp.raise_for_status()
    token = resp.json().get("access_token")
    if not token:
        raise ValueError(f"Token não retornado. Resposta: {resp.text[:200]}")
    return token


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _marcar_status_parcial(run, job: str, n_erros: int, n_total: int, rows_total: int):
    """Faz uma falha (total ou parcial) do loop aparecer em etl_runs em vez de
    ser registrada como 'success'. Antes, um loop que capturava todas as
    exceções internamente sempre fechava o ETLRun como 'success' — uma falha
    sistemática (ex: 401 da ANBIMA) ficava invisível no monitoramento."""
    if n_erros == 0:
        return
    if rows_total == 0:
        run.set_status("error", f"{job}: todas as {n_erros}/{n_total} chamadas falharam (0 linhas)")
    else:
        run.set_status("partial", f"{job}: {n_erros}/{n_total} chamadas falharam")


# ── ETL Índices IMA/IDA ───────────────────────────────────────────────────────
def etl_indices(client: httpx.Client, token: str, data_ref: date | None = None) -> int:
    """Coleta valores diários dos índices IMA e IDA."""
    if data_ref is None:
        data_ref = date.today() - timedelta(days=1)

    data_str = data_ref.strftime("%Y-%m-%d")
    rows_total = 0

    n_erros = 0
    with ETLRun("anbima_indices") as run:
        for indice in TODOS_INDICES:
            try:
                # Índices IDA usam o endpoint /idas; IMA e IRF-M usam /imas.
                # Antes tudo batia em /imas — os índices IDA retornavam vazio.
                sufixo = "idas" if indice in INDICES_IDA else "imas"
                resp = retry_request(
                    client,
                    f"{BASE_URL}/feed/precos-indices/v1/indices-mais/{sufixo}",
                    params={"data": data_str, "indice": indice},
                    **{"headers": auth_headers(token)},
                )
                data_json = resp.json()

                if not data_json:
                    print(f"  {indice}: sem dados para {data_str}")
                    continue

                # Normaliza resposta (pode ser lista ou dict)
                itens = data_json if isinstance(data_json, list) else [data_json]

                registros = []
                for item in itens:
                    registros.append({
                        "indice":        indice,
                        "data":          item.get("data", data_str),
                        "numero_indice": item.get("numero_indice") or item.get("valor"),
                        "retorno_dia":   item.get("variacao_diaria") or item.get("retorno_dia"),
                        "retorno_mes":   item.get("variacao_mensal"),
                        "retorno_ano":   item.get("variacao_anual"),
                        "duration":      item.get("duration"),
                        "convexidade":   item.get("convexidade"),
                    })

                if registros:
                    supabase.table("anbima_indices").upsert(
                        registros, on_conflict="indice,data"
                    ).execute()
                    rows_total += len(registros)
                    print(f"  {indice}: {len(registros)} registro(s)")

            except Exception as e:
                n_erros += 1
                print(f"  {indice}: ERRO — {e}")

        run.set_rows(rows_total)
        _marcar_status_parcial(run, "anbima_indices", n_erros, len(TODOS_INDICES), rows_total)

    return rows_total


# ── ETL Debêntures ────────────────────────────────────────────────────────────
def etl_debentures(client: httpx.Client, token: str, data_ref: date | None = None) -> int:
    """Coleta preços indicativos de debêntures e atualiza cadastro."""
    if data_ref is None:
        data_ref = date.today() - timedelta(days=1)

    data_str = data_ref.strftime("%Y-%m-%d")
    rows_total = 0
    page = 1
    page_size = 100
    houve_erro = False

    with ETLRun("anbima_debentures") as run:
        while True:
            try:
                resp = retry_request(
                    client,
                    f"{BASE_URL}/feed/precos-indices/v1/debentures/mercado-secundario",
                    params={"data": data_str, "page": page, "pageSize": page_size},
                    **{"headers": auth_headers(token)},
                )
                itens = resp.json()

                if not itens:
                    break

                cadastros, historicos = [], []

                for item in itens:
                    codigo = item.get("codigo_ativo") or item.get("codigo")
                    if not codigo:
                        continue

                    cadastros.append({
                        "codigo":           codigo,
                        "nome_emissor":     item.get("emissor") or item.get("nome_emissor"),
                        "cnpj_emissor":     item.get("cnpj"),
                        "indexador":        item.get("indexador"),
                        "taxa_emissao":     item.get("taxa_emissao"),
                        "data_emissao":     item.get("data_emissao"),
                        "data_vencimento":  item.get("data_vencimento"),
                        "percentual_index": item.get("percentual_indexador"),
                        "rating_nota":      item.get("rating"),
                        "setor":            item.get("setor"),
                        "ativo":            True,
                    })

                    historicos.append({
                        "codigo":           codigo,
                        "data":             data_str,
                        "pu_par":           item.get("pu_par"),
                        "pu_mercado":       item.get("pu_mercado"),
                        "taxa_indicativa":  item.get("taxa_indicativa"),
                        "spread_ipca":      item.get("spread_ipca"),
                        "spread_cdi":       item.get("spread_cdi"),
                        "duration":         item.get("duration"),
                        "percentual_pu":    item.get("percentual_pu"),
                        "volume_negociado": item.get("volume"),
                    })

                if cadastros:
                    supabase.table("anbima_debentures_cadastro").upsert(
                        cadastros, on_conflict="codigo"
                    ).execute()

                if historicos:
                    supabase.table("anbima_debentures_historico").upsert(
                        historicos, on_conflict="codigo,data"
                    ).execute()
                    rows_total += len(historicos)

                print(f"  Página {page}: {len(historicos)} debêntures")

                if len(itens) < page_size:
                    break
                page += 1

            except Exception as e:
                houve_erro = True
                print(f"  Página {page}: ERRO — {e}")
                break

        run.set_rows(rows_total)
        _marcar_status_parcial(run, "anbima_debentures", int(houve_erro), page, rows_total)

    return rows_total


# ── ETL VNA ───────────────────────────────────────────────────────────────────
def etl_vna(client: httpx.Client, token: str, data_ref: date | None = None) -> int:
    """Coleta VNA (Valor Nominal de Atualização) de NTN-B, LFT e NTN-C."""
    if data_ref is None:
        data_ref = date.today() - timedelta(days=1)

    data_str = data_ref.strftime("%Y-%m-%d")
    rows_total = 0

    with ETLRun("anbima_vna") as run:
        for titulo in TITULOS_VNA:
            try:
                resp = retry_request(
                    client,
                    f"{BASE_URL}/feed/precos-indices/v1/titulos-publicos/vna",
                    params={"data": data_str, "tipo_titulo": titulo},
                    **{"headers": auth_headers(token)},
                )
                itens = resp.json()
                if not itens:
                    continue

                itens = itens if isinstance(itens, list) else [itens]
                registros = [
                    {
                        "codigo": titulo,
                        "data":   item.get("data", data_str),
                        "vna":    item.get("vna") or item.get("valor_nominal"),
                    }
                    for item in itens if item.get("vna") or item.get("valor_nominal")
                ]

                if registros:
                    supabase.table("anbima_titulos_vna").upsert(
                        registros, on_conflict="codigo,data"
                    ).execute()
                    rows_total += len(registros)
                    print(f"  VNA {titulo}: {len(registros)} registro(s)")

            except Exception as e:
                print(f"  VNA {titulo}: ERRO — {e}")

        run.set_rows(rows_total)

    return rows_total


# ── ETL CRI ───────────────────────────────────────────────────────────────────
def _etl_credito_privado(
    client: httpx.Client,
    token: str,
    tipo: str,         # "cri" ou "cra"
    data_ref: date | None = None,
) -> int:
    """Coleta preços indicativos de CRI ou CRA e atualiza cadastro."""
    if data_ref is None:
        data_ref = date.today() - timedelta(days=1)

    data_str = data_ref.strftime("%Y-%m-%d")
    tabela_cadastro  = f"anbima_{tipo}_cadastro"
    tabela_historico = f"anbima_{tipo}_historico"
    rows_total = 0
    page = 1
    page_size = 100
    houve_erro = False

    with ETLRun(f"anbima_{tipo}") as run:
        while True:
            try:
                resp = retry_request(
                    client,
                    f"{BASE_URL}/feed/precos-indices/v1/{tipo}/mercado-secundario",
                    params={"data": data_str, "page": page, "pageSize": page_size},
                    **{"headers": auth_headers(token)},
                )
                itens = resp.json()

                if not itens:
                    break

                cadastros, historicos = [], []

                for item in itens:
                    codigo = item.get("codigo_ativo") or item.get("codigo")
                    if not codigo:
                        continue

                    cadastros.append({
                        "codigo":               codigo,
                        "cedente":              item.get("cedente") or item.get("emissor"),
                        "cnpj_cedente":         item.get("cnpj_cedente") or item.get("cnpj"),
                        "securitizadora":       item.get("securitizadora"),
                        "cnpj_securitizadora":  item.get("cnpj_securitizadora"),
                        "indexador":            item.get("indexador"),
                        "taxa_emissao":         item.get("taxa_emissao"),
                        "data_emissao":         item.get("data_emissao"),
                        "data_vencimento":      item.get("data_vencimento"),
                        "percentual_index":     item.get("percentual_indexador"),
                        "rating_nota":          item.get("rating"),
                        "serie":                item.get("serie") or item.get("numero_serie"),
                        "ativo":                True,
                    })

                    historicos.append({
                        "codigo":           codigo,
                        "data":             data_str,
                        "pu_par":           item.get("pu_par"),
                        "pu_mercado":       item.get("pu_mercado"),
                        "taxa_indicativa":  item.get("taxa_indicativa"),
                        "spread_ipca":      item.get("spread_ipca"),
                        "spread_cdi":       item.get("spread_cdi"),
                        "duration":         item.get("duration"),
                        "percentual_pu":    item.get("percentual_pu"),
                        "volume_negociado": item.get("volume"),
                    })

                if cadastros:
                    supabase.table(tabela_cadastro).upsert(
                        cadastros, on_conflict="codigo"
                    ).execute()

                if historicos:
                    supabase.table(tabela_historico).upsert(
                        historicos, on_conflict="codigo,data"
                    ).execute()
                    rows_total += len(historicos)

                print(f"  Página {page}: {len(historicos)} {tipo.upper()}s")

                if len(itens) < page_size:
                    break
                page += 1

            except Exception as e:
                houve_erro = True
                print(f"  Página {page}: ERRO — {e}")
                break

        run.set_rows(rows_total)
        _marcar_status_parcial(run, f"anbima_{tipo}", int(houve_erro), page, rows_total)

    return rows_total


def etl_cri(client: httpx.Client, token: str, data_ref: date | None = None) -> int:
    return _etl_credito_privado(client, token, "cri", data_ref)


def etl_cra(client: httpx.Client, token: str, data_ref: date | None = None) -> int:
    return _etl_credito_privado(client, token, "cra", data_ref)


# ── Run principal ─────────────────────────────────────────────────────────────
def run(feed: str = "all", data_ref: date | None = None):
    print("=== ETL ANBIMA ===\n")

    with httpx.Client(
        headers={"Content-Type": "application/json"},
        follow_redirects=True,
    ) as client:
        print("Obtendo token ANBIMA...")
        token = get_access_token(client)
        print("Token OK\n")

        totais = {}

        if feed in ("all", "indices"):
            print("-> Índices IMA/IDA...")
            totais["indices"] = etl_indices(client, token, data_ref)

        if feed in ("all", "debentures"):
            print("\n-> Debêntures...")
            totais["debentures"] = etl_debentures(client, token, data_ref)

        if feed in ("all", "cri"):
            print("\n-> CRI (Certificados de Recebíveis Imobiliários)...")
            totais["cri"] = etl_cri(client, token, data_ref)

        if feed in ("all", "cra"):
            print("\n-> CRA (Certificados de Recebíveis do Agronegócio)...")
            totais["cra"] = etl_cra(client, token, data_ref)

        if feed in ("all", "vna"):
            print("\n-> VNA (títulos públicos)...")
            totais["vna"] = etl_vna(client, token, data_ref)

    print(f"\n=== Concluído — {totais} ===")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ETL ANBIMA")
    parser.add_argument("--feed", default="all",
                        choices=["all", "indices", "debentures", "cri", "cra", "vna"],
                        help="Qual feed executar (padrão: all)")
    parser.add_argument("--data",
                        help="Data de referência YYYY-MM-DD (padrão: ontem)")
    args = parser.parse_args()

    data_ref = date.fromisoformat(args.data) if args.data else None
    run(feed=args.feed, data_ref=data_ref)
