"""
ETL — Indicadores Econômicos
Fonte: Banco Central do Brasil (BCB-SGS) — API oficial
Séries: IPCA (433), SELIC meta (432), CDI diário (12), PIB var% trimestral (7326)
"""

import httpx
import datetime
from config import supabase
from log_etl import ETLRun, retry_request, log_partial

# Mapeamento: nome interno → código BCB
SERIES = {
    "ipca":  {"codigo": 433,  "unidade": "%"},
    "selic": {"codigo": 432,  "unidade": "%"},
    "cdi":   {"codigo": 12,   "unidade": "%"},
    "pib":   {"codigo": 7326, "unidade": "%"},  # variação % trimestral — NÃO trocar por 4380
}

BCB_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados"
HEADERS = {"User-Agent": "plataforma-mcp-brasil/1.0 (github.com/lufer-jom)"}


def ultima_data_no_banco(serie: str) -> str:
    """
    Consulta a data mais recente da série no banco.
    Retorna 5 dias antes (sobreposição para publicações atrasadas como IPCA/PIB).
    Fallback: '01/01/2020' se sem dados.
    """
    try:
        result = (
            supabase.table("indicadores_economicos")
            .select("data")
            .eq("serie", serie)
            .order("data", desc=True)
            .limit(1)
            .execute()
        )
        if result.data:
            ultima = datetime.date.fromisoformat(result.data[0]["data"])
            inicio = ultima - datetime.timedelta(days=5)
            return inicio.strftime("%d/%m/%Y")
    except Exception as e:
        print(f"  [aviso] não conseguiu última data para '{serie}': {e}")
    return "01/01/2020"


def buscar_serie(codigo: int, data_inicio: str) -> list[dict]:
    """Busca dados de uma série no BCB-SGS. Levanta ValueError se resposta inválida."""
    hoje = datetime.date.today().strftime("%d/%m/%Y")
    url = BCB_URL.format(codigo=codigo)
    params = {"formato": "json", "dataInicial": data_inicio, "dataFinal": hoje}

    with httpx.Client(headers=HEADERS) as client:
        response = retry_request(client, url, params=params, timeout=30)

    dados = response.json()
    if not isinstance(dados, list):
        raise ValueError(f"BCB resposta inesperada para código {codigo}: {type(dados)}")
    return dados


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

    erros = []
    total_salvos = 0

    for serie, cfg in SERIES.items():
        print(f"→ {serie.upper()} (código {cfg['codigo']})...")
        data_inicio = ultima_data_no_banco(serie)
        print(f"  Buscando a partir de {data_inicio}...")

        try:
            with ETLRun(f"indicadores_{serie}") as run:
                dados_brutos = buscar_serie(cfg["codigo"], data_inicio)

                if not dados_brutos:
                    print(f"  ⚠ BCB não retornou novos dados desde {data_inicio}\n")
                    run.set_rows(0)
                    continue

                registros = normalizar(dados_brutos, serie, cfg["unidade"])

                if not registros:
                    print(f"  ⚠ Nenhum registro válido após normalização\n")
                    run.set_rows(0)
                    continue

                salvos = salvar_no_supabase(registros)
                run.set_rows(salvos)
                total_salvos += salvos
                print(f"  ✓ {salvos} registros salvos de {len(registros)} buscados\n")

        except Exception as e:
            erros.append(f"{serie}: {e}")
            print(f"  ✗ Erro: {e}\n")

    if erros and total_salvos > 0:
        log_partial("indicadores_batch", total_salvos, "; ".join(erros))
        print(f"⚠ {len(erros)} série(s) com erro: {erros}")
    elif erros:
        print(f"✗ Todas as séries falharam: {erros}")

    print("=== Concluído ===")


if __name__ == "__main__":
    run()
