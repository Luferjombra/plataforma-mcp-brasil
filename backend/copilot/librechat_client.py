import json
import os
import time
import uuid

import httpx

LIBRECHAT_BASE_URL = os.getenv("LIBRECHAT_BASE_URL", "https://librechat-rfev.onrender.com")
LIBRECHAT_SERVICE_EMAIL = os.getenv("LIBRECHAT_SERVICE_EMAIL")
LIBRECHAT_SERVICE_SENHA = os.getenv("LIBRECHAT_SERVICE_SENHA")
LIBRECHAT_AGENT_ID = os.getenv("LIBRECHAT_AGENT_ID", "agent_YGaq4dos8YWdj1ws4sCAX")  # Analista Quant
LIBRECHAT_AGENT_NOME = os.getenv("LIBRECHAT_AGENT_NOME", "Analista Quant")

# JWT do LibreChat expira em ~15min (visto em produção); relogamos com folga.
_TOKEN_TTL_SEGUNDOS = 12 * 60

_token_cache: dict = {"token": None, "expira_em": 0.0}


async def _obter_token(http: httpx.AsyncClient) -> str:
    agora = time.monotonic()
    if _token_cache["token"] and agora < _token_cache["expira_em"]:
        return _token_cache["token"]

    if not LIBRECHAT_SERVICE_EMAIL or not LIBRECHAT_SERVICE_SENHA:
        raise RuntimeError("LIBRECHAT_SERVICE_EMAIL/LIBRECHAT_SERVICE_SENHA não configurados.")

    resp = await http.post(
        f"{LIBRECHAT_BASE_URL}/api/auth/login",
        json={"email": LIBRECHAT_SERVICE_EMAIL, "password": LIBRECHAT_SERVICE_SENHA},
    )
    resp.raise_for_status()
    body = resp.json()
    token = body.get("token")
    if not token:
        raise RuntimeError("Login no LibreChat não retornou token.")

    _token_cache["token"] = token
    _token_cache["expira_em"] = agora + _TOKEN_TTL_SEGUNDOS
    return token


async def perguntar_librechat(mensagem: str) -> dict:
    """Envia uma pergunta a um agent do LibreChat (tool-calling real sobre os dados
    da plataforma via MCP) e retorna a resposta final já consolidada.

    Cada chamada abre uma conversa nova no LibreChat — o /copilot hoje já é
    stateless por pergunta (o frontend não envia histórico), então não há
    continuidade de conversa a preservar aqui.

    NOTA DE IMPLEMENTAÇÃO: confirmado em produção que POST /api/agents/chat
    responde direto com Content-Type: text/event-stream (SSE) -- não é um
    JSON pequeno seguido de um GET separado. Mantemos o fallback JSON e o
    GET /api/agents/chat/stream/:id como segurança caso o comportamento
    varie (ex: resposta cacheada, agent sem streaming).
    """
    response_message_id = str(uuid.uuid4())
    submissao = {
        "endpoint": "agents",
        "agent_id": LIBRECHAT_AGENT_ID,
        "text": mensagem,
        "isCreatedByUser": True,
        "parentMessageId": str(uuid.UUID(int=0)),
        "conversationId": None,
        "responseMessageId": response_message_id,
        "error": False,
    }

    async with httpx.AsyncClient(timeout=90) as http:
        token = await _obter_token(http)
        headers = {"Authorization": f"Bearer {token}"}

        texto_resposta = None
        async with http.stream(
            "POST",
            f"{LIBRECHAT_BASE_URL}/api/agents/chat",
            headers=headers,
            json=submissao,
        ) as resp:
            resp.raise_for_status()
            content_type = resp.headers.get("content-type", "")

            if "text/event-stream" in content_type:
                texto_resposta = await _ler_sse(resp.aiter_lines())
            else:
                corpo_bruto = b"".join([chunk async for chunk in resp.aiter_bytes()])
                body = json.loads(corpo_bruto) if corpo_bruto else {}
                texto_resposta = _extrair_texto(body)
                stream_id = body.get("responseMessageId") or response_message_id
                if not texto_resposta:
                    texto_resposta = await _consumir_stream(http, headers, stream_id)

    if not texto_resposta:
        raise RuntimeError("LibreChat não retornou texto de resposta (POST nem stream SSE).")

    return {"resposta": texto_resposta, "fonte": LIBRECHAT_AGENT_NOME}


def _extrair_texto(body: dict) -> str | None:
    return (
        body.get("text")
        or body.get("responseMessage", {}).get("text")
        or body.get("message", {}).get("text")
    )


async def _ler_sse(linhas) -> str | None:
    texto_final = None
    texto_acumulado = ""
    async for linha in linhas:
        if not linha.startswith("data:"):
            continue
        payload = linha[len("data:"):].strip()
        if not payload or payload == "[DONE]":
            continue
        try:
            evento = json.loads(payload)
        except json.JSONDecodeError:
            continue

        if evento.get("final") or "responseMessage" in evento:
            texto_final = _extrair_texto(evento) or texto_acumulado
            break
        delta = evento.get("text")
        if delta:
            texto_acumulado += delta

    return texto_final or texto_acumulado or None


async def _consumir_stream(http: httpx.AsyncClient, headers: dict, stream_id: str) -> str | None:
    async with http.stream(
        "GET",
        f"{LIBRECHAT_BASE_URL}/api/agents/chat/stream/{stream_id}",
        headers=headers,
        timeout=90,
    ) as stream:
        return await _ler_sse(stream.aiter_lines())
