import os
import hashlib
import json
from datetime import datetime, timezone

import anthropic
import httpx
from db import supabase
from copilot.context_builder import build_context

# Provedor LLM: "gemini" (free tier) ou "anthropic"
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "gemini").lower()

ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

SYSTEM_PROMPT = """Você é o Chat Finance, assistente financeiro da Plataforma MCP Brasil.
Você recebe dados reais do banco de dados e explica de forma clara e objetiva.
Regras:
- Nunca invente dados — use apenas o contexto fornecido.
- Seja direto e didático.
- Use R$ e % com formatação brasileira.
- Não faça recomendações de investimento."""


def _chamar_anthropic(user_content: str) -> str:
    response = client.messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_content}],
    )
    return response.content[0].text


async def _chamar_gemini(user_content: str) -> str:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY não configurada.")

    async with httpx.AsyncClient(timeout=60) as http:
        resp = await http.post(
            GEMINI_URL.format(model=GEMINI_MODEL),
            headers={"x-goog-api-key": api_key},
            json={
                "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
                "contents": [{"role": "user", "parts": [{"text": user_content}]}],
                "generationConfig": {"maxOutputTokens": 1024},
            },
        )
        resp.raise_for_status()
        body = resp.json()
    return body["candidates"][0]["content"]["parts"][0]["text"]


async def _gerar_resposta(user_content: str) -> str:
    if LLM_PROVIDER == "anthropic":
        return _chamar_anthropic(user_content)
    return await _chamar_gemini(user_content)


async def processar_pergunta(pergunta: str, contexto_extra: str | None = None) -> dict:
    # Verifica cache
    hash_key = hashlib.sha256(pergunta.strip().lower().encode()).hexdigest()
    cache = supabase.table("copilot_cache").select("*").eq("hash_pergunta", hash_key).execute()

    if cache.data:
        entry = cache.data[0]
        expira_em = entry.get("expira_em")
        expirado = False
        if expira_em:
            try:
                expirado = datetime.fromisoformat(expira_em.replace("Z", "+00:00")) < datetime.now(timezone.utc)
            except ValueError:
                expirado = True
        if expirado:
            supabase.table("copilot_cache").delete().eq("id", entry["id"]).execute()
        else:
            # Incrementa hits
            supabase.table("copilot_cache").update({"hits": entry["hits"] + 1}).eq("id", entry["id"]).execute()
            return {"resposta": entry["resposta_txt"], "dados": entry["dados_json"], "cache": True}

    # Busca contexto no banco
    contexto = await build_context(pergunta)

    # Monta prompt
    user_content = f"Pergunta: {pergunta}\n\nDados disponíveis:\n{json.dumps(contexto['dados'], ensure_ascii=False, indent=2)}"
    if contexto_extra:
        user_content += f"\n\nContexto adicional: {contexto_extra}"

    # Chama o LLM configurado (LLM_PROVIDER)
    resposta_txt = await _gerar_resposta(user_content)

    # Salva no cache
    supabase.table("copilot_cache").insert({
        "hash_pergunta": hash_key,
        "ativo": contexto.get("ativo"),
        "intencao": contexto.get("intencao"),
        "resposta_txt": resposta_txt,
        "dados_json": contexto["dados"],
    }).execute()

    return {"resposta": resposta_txt, "dados": contexto["dados"], "cache": False}
