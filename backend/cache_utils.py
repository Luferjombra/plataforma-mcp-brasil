"""
Cache TTL em memória — P7 (Proposta 4, backlog_auditoria_fase2.md).

Rotas GET cujo dado só muda ~1x/dia (ETL noturno) hoje batem no Supabase a
cada carregamento de página, mesmo quando nada mudou desde a última chamada.
`cache_ttl` guarda o retorno por processo (sem Redis -- este deploy roda
1 worker no Render), com TTL curto o bastante pra não esconder um dado
corrigido/reprocessado por muito tempo, e um `maxsize` que limita quantas
combinações de parâmetros (ex: `q` de busca livre) ficam em memória de uma
vez -- sem isso, uma rota com busca livre cresceria sem fim ao longo do dia.

Funciona tanto em rotas `def` quanto `async def`: FastAPI resolve os query
params como kwargs antes de chamar a função decorada, então a chave do cache
é montada a partir desses kwargs -- combinações diferentes de filtros (ex:
`page=2` ou `q="petr"`) viram entradas diferentes.
"""
import asyncio
import threading
import time
from collections import OrderedDict
from functools import wraps
from typing import Callable


class TTLCache:
    def __init__(self, ttl_seconds: float, maxsize: int):
        self.ttl = ttl_seconds
        self.maxsize = maxsize
        self._store: "OrderedDict[str, tuple[float, object]]" = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: str):
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            expira_em, valor = entry
            if time.monotonic() >= expira_em:
                del self._store[key]
                return None
            self._store.move_to_end(key)
            return valor

    def set(self, key: str, valor) -> None:
        with self._lock:
            self._store[key] = (time.monotonic() + self.ttl, valor)
            self._store.move_to_end(key)
            while len(self._store) > self.maxsize:
                self._store.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()


def _chave(kwargs: dict) -> str:
    return repr(sorted(kwargs.items()))


def cache_ttl(ttl_seconds: float, maxsize: int = 256):
    """Decorator de cache TTL+LRU para uma rota FastAPI GET sem efeito
    colateral. Aplicar ANTES do `@router.get(...)` (ou seja, mais perto da
    função) -- `functools.wraps` preserva a assinatura original via
    `__wrapped__`, que é o que o FastAPI inspeciona pra descobrir os query
    params, então a ordem dos decorators não quebra a rota."""
    cache = TTLCache(ttl_seconds, maxsize)

    def decorator(func: Callable):
        if asyncio.iscoroutinefunction(func):
            @wraps(func)
            async def async_wrapper(*args, **kwargs):
                chave = _chave(kwargs)
                cached = cache.get(chave)
                if cached is not None:
                    return cached
                resultado = await func(*args, **kwargs)
                cache.set(chave, resultado)
                return resultado
            async_wrapper.cache_clear = cache.clear
            return async_wrapper

        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            chave = _chave(kwargs)
            cached = cache.get(chave)
            if cached is not None:
                return cached
            resultado = func(*args, **kwargs)
            cache.set(chave, resultado)
            return resultado
        sync_wrapper.cache_clear = cache.clear
        return sync_wrapper

    return decorator
