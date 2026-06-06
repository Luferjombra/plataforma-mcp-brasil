"""
ETL — Indicadores Econômicos
Fonte: Banco Central do Brasil (BCB-SGS)
Séries: IPCA (433), SELIC meta (432), CDI diário (12), PIB var% trimestral (7326)
"""

import httpx
import datetime
from config import supabase

# Mapeamento: nome interno → código BCB
SERIES = {
    "ipca":  {"codigo": 433,  "unidade": "%"},
    "selic": {"codigo": 432,  "unidade": "%"},
    "cdi":   {"codigo": 12,   "unidade": "%"},
    "pib":   {"codigo": 7326, "unidade": "%"},  # variação % trimestral
}

BCB_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados"


def buscar_serie(codigo: int, data_inicio: str = "01/01/2020") -> list[dict]:
    """Busca dados de uma série no BCB-SGS."""
    hoje = datetime.date.today().strftime("%d/%m/%Y")
    url = BCB_URL.format(codigo=codigo)
    params = {"formato": "json", "dataInicial": data_inicio, "dataFinal": hoje}

    with httpx.Client(timeout=30) as client:
        response = client.get(url, params=params)
        response.raise_for_status()
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


def salvar_no_supabase(registros: list[dict], serie: str) -> dict:
    """Upsert dos registros no Supabase (ignora duplicatas)."""
    if not registros:
        return {"inseridos": 0, "total": 0}

    result = (
        supabase.table("indicadores_economicos")
        .upsert(registros, on_conflict="serie,data")
        .execute()
    )
    return {"inseridos": len(result.data), "total": len(registros)}


def registrar_log(job: str, status: str, novos: int, total: int, erro: str = None):
    supabase.table("etl_log").insert({
        "job_nome": job,
        "status": status,
        "registros_novos": novos,
        "registros_total": total,
        "erro_msg": erro,
    }).execute()


def run():
    print("=== ETL Indicadores Econômicos ===\n")
    for serie, cfg in SERIES.items():
        print(f"→ Buscando {serie.upper()} (código BCB: {cfg['codigo']})...")
        try:
            dados_brutos = buscar_serie(cfg["codigo"])
            registros = normalizar(dados_brutos, serie, cfg["unidade"])
            resultado = salvar_no_supabase(registros, serie)
            registrar_log(f"indicadores_{serie}", "success", resultado["inseridos"], resultado["total"])
            print(f"  ✓ {resultado['inseridos']} registros salvos de {resultado['total']} buscados\n")
        except Exception as e:
            registrar_log(f"indicadores_{serie}", "error", 0, 0, str(e))
            print(f"  ✗ Erro: {e}\n")

    print("=== Concluído ===")


if __name__ == "__main__":
    run()
