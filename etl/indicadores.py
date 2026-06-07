"""
ETL — Indicadores Econômicos
Fonte: Banco Central do Brasil (BCB-SGS) — API oficial
Séries: IPCA (433), SELIC meta (432), CDI diário (12), PIB var% trimestral (7326)
"""

import httpx
import datetime
from config import supabase
from log_etl import ETLRun, retry_request

# Mapeamento: nome interno → código BCB
SERIES = {
    "ipca":  {"codigo": 433,  "unidade": "%"},
    "selic": {"codigo": 432,  "unidade": "%"},
    "cdi":   {"codigo": 12,   "unidade": "%"},
    "pib":   {"codigo": 7326, "unidade": "%"},  # variação % trimestral
}

BCB_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados"
HEADERS = {"User-Agent": "plataforma-mcp-brasil/1.0 (github.com/lufer-jom)"}


def buscar_serie(codigo: int, data_inicio: str = "01/01/2020") -> list[dict]:
    """Busca dados de uma série no BCB-SGS."""
    hoje = datetime.date.today().strftime("%d/%m/%Y")
    url = BCB_URL.format(codigo=codigo)
    params = {"formato": "json", "dataInicial": data_inicio, "dataFinal": hoje}

    with httpx.Client(headers=HEADERS) as client:
        response = retry_request(client, url, params=params, timeout=30)
        return response.json()


def normalizar(dados: list[dict], serie: str, unidade: str) -> list[dict]:
    """Converte formato BCB → formato da tabela indicadores_economicos."""
    registros = []
    for item in dados:
        try:
            # BCB retorna data no formato DD/MM/YYYY
            data = datetime.datetime.strptime(item["data"], "%d/%m/%Y").date().isoformat()
            valor = float(item["valor"].replace(",", "."))
            registros.append({
                "serie": serie,
                "data": data,
                "valor": valor,
                "unidade": unidade,
                "fonte": "BCB-SGS",
            })
        except (ValueError, KeyError):
            continue
    return registros


def salvar_no_supabase(registros: list[dict]) -> int:
    """Upsert dos registros no Supabase. Retorna número de rows processadas."""
    if not registros:
        return 0
    result = (
        supabase.table("indicadores_economicos")
        .upsert(registros, on_conflict="serie,data")
        .execute()
    )
    return len(result.data)


def run():
    print("=== ETL Indicadores Econômicos (BCB-SGS) ===\n")

    for serie, cfg in SERIES.items():
        print(f"→ {serie.upper()} (código {cfg['codigo']})...")

        with ETLRun(f"indicadores_{serie}") as run:
            dados_brutos = buscar_serie(cfg["codigo"])
            registros = normalizar(dados_brutos, serie, cfg["unidade"])
            salvos = salvar_no_supabase(registros)
            run.set_rows(salvos)
            print(f"  ✓ {salvos} registros salvos de {len(registros)} buscados\n")

    print("=== Concluído ===")


if __name__ == "__main__":
    run()
