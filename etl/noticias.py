"""
ETL — Feed RSS de notícias financeiras brasileiras.

Fontes:
  - InfoMoney (mercados)
  - Valor Econômico (finanças)
  - Money Times (geral)

Pipeline:
  1. Busca RSS de cada fonte via httpx (com retry)
  2. Parse XML manual (sem feedparser — evita dep extra)
  3. Categoriza por palavras-chave no título/resumo
  4. Extrai tickers RV (PETR4, VALE3, etc.) via regex
  5. Upsert na tabela `noticias` com on_conflict=url
"""

import re
import sys
import httpx
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from xml.etree import ElementTree as ET

from config import supabase
from log_etl import ETLRun, retry_request, log_partial


# ── Fontes RSS ────────────────────────────────────────────────────────────────
FONTES = [
    {
        "nome": "InfoMoney",
        "url": "https://www.infomoney.com.br/feed/",
    },
    {
        "nome": "Money Times",
        "url": "https://www.moneytimes.com.br/feed/",
    },
    {
        "nome": "Valor Investe",
        "url": "https://valorinveste.globo.com/rss/valorinveste/financas/",
    },
    {
        "nome": "Valor Investe",
        "url": "https://valorinveste.globo.com/rss/valorinveste/mercados/",
    },
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; MCP-Brasil-ETL/1.0)",
    "Accept": "application/rss+xml, application/xml, text/xml",
}


# ── Categorização ─────────────────────────────────────────────────────────────
KEYWORDS_CATEGORIA = {
    "Macro": [
        "selic", "ipca", "inflação", "copom", "pib", "câmbio", "dólar",
        "banco central", "bc ", "fed", "fiscal", "tesouro nacional",
    ],
    "Renda Variável": [
        "ibovespa", "ações", "ação", "bolsa", "b3", "petrobras", "vale",
        "itaú", "bradesco", "ibov", "dividendos", "ipo",
    ],
    "Renda Fixa": [
        "tesouro direto", "ntn", "ltn", "lft", "cdb", "lci", "lca",
        "debênture", "renda fixa", "juros",
    ],
    "Fundos": [
        "fundo", "fii", "fundo imobiliário", "anbima", "cvm",
        "multimercado", "gestor",
    ],
}

TICKER_PATTERN = re.compile(r"\b([A-Z]{4}\d{1,2})\b")


def categorizar(titulo: str, resumo: str) -> str:
    """Retorna categoria baseada em palavras-chave do título e resumo."""
    texto = f"{titulo} {resumo}".lower()
    scores = {}
    for cat, keywords in KEYWORDS_CATEGORIA.items():
        scores[cat] = sum(1 for k in keywords if k in texto)
    best_cat = max(scores, key=scores.get)
    return best_cat if scores[best_cat] > 0 else "Outros"


def extrair_tickers(titulo: str, resumo: str) -> list[str]:
    """Extrai tickers B3 (4 letras + 1-2 dígitos) do texto."""
    texto = f"{titulo} {resumo}"
    tickers = set(TICKER_PATTERN.findall(texto))
    return sorted(tickers)


# ── Parse RSS ─────────────────────────────────────────────────────────────────
def parse_pub_date(text: str | None) -> str | None:
    """Converte string de data RSS para ISO8601 UTC."""
    if not text:
        return None
    try:
        dt = parsedate_to_datetime(text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except Exception:
        return None


def limpar_html(text: str | None) -> str:
    """Remove tags HTML simples do resumo."""
    if not text:
        return ""
    sem_tags = re.sub(r"<[^>]+>", "", text)
    sem_entidades = (
        sem_tags
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
    )
    return re.sub(r"\s+", " ", sem_entidades).strip()


def buscar_feed(client: httpx.Client, fonte: dict) -> list[dict]:
    """Busca e parseia um feed RSS, retornando lista de notícias normalizadas."""
    resp = retry_request(client, fonte["url"], timeout=20.0)
    root = ET.fromstring(resp.content)

    # RSS 2.0 → <rss><channel><item>...
    items = root.findall(".//item")
    if not items:
        # Atom → <feed><entry>...
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        items = root.findall(".//atom:entry", ns)

    noticias = []
    for item in items:
        titulo = (item.findtext("title") or "").strip()
        url = (item.findtext("link") or "").strip()
        resumo_raw = item.findtext("description") or item.findtext("summary") or ""
        resumo = limpar_html(resumo_raw)[:500]
        pub = parse_pub_date(item.findtext("pubDate") or item.findtext("published"))

        if not titulo or not url:
            continue

        categoria = categorizar(titulo, resumo)
        tickers = extrair_tickers(titulo, resumo)

        noticias.append({
            "titulo": titulo[:500],
            "resumo": resumo,
            "url": url,
            "fonte": fonte["nome"],
            "categoria": categoria,
            "tickers_rel": tickers,
            "publicado_em": pub,
        })
    return noticias


def upsert_noticias(noticias: list[dict]) -> int:
    """Upsert idempotente por URL. Retorna número de linhas afetadas."""
    if not noticias:
        return 0
    result = (
        supabase.table("noticias")
        .upsert(noticias, on_conflict="url")
        .execute()
    )
    return len(result.data or [])


# ── Run ───────────────────────────────────────────────────────────────────────
def run():
    print("=== ETL Noticias RSS ===\n")
    erros, total = [], 0

    with httpx.Client(headers=HEADERS, follow_redirects=True) as client:
        for fonte in FONTES:
            print(f"-> {fonte['nome']}...")
            try:
                with ETLRun(f"noticias_{fonte['nome'].lower().replace(' ', '_')}") as run_log:
                    noticias = buscar_feed(client, fonte)
                    if not noticias:
                        print(f"  (sem itens no feed)\n")
                        run_log.set_rows(0)
                        continue
                    salvos = upsert_noticias(noticias)
                    run_log.set_rows(salvos)
                    total += salvos
                    print(f"  OK {salvos} noticias\n")
            except Exception as e:
                erros.append(f"{fonte['nome']}: {e}")
                print(f"  ERRO: {e}\n")

    if erros and total > 0:
        log_partial("noticias_batch", total, "; ".join(erros))

    print(f"=== Concluido — {total} noticias upsertadas ===")
    if erros:
        print(f"Erros: {len(erros)} fonte(s) falharam")
        sys.exit(1 if total == 0 else 0)


if __name__ == "__main__":
    run()
