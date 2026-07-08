"""Utilitários para filtros do PostgREST (supabase-py)."""

import re

# Caracteres com significado especial na sintaxe de filtro do PostgREST
# (usados em .or_(), .and_(), etc.) — sem sanitizar, um valor de busca do
# usuário pode fechar/abrir cláusulas e construir condições arbitrárias
# sobre as colunas já expostas pela query (filter injection).
_CARACTERES_PERIGOSOS = re.compile(r"[,.()*]")


def sanitizar_busca(q: str) -> str:
    """Remove caracteres que têm significado especial no filtro do
    PostgREST antes de interpolar `q` num `.or_()`/`.ilike()`."""
    return _CARACTERES_PERIGOSOS.sub("", q)
