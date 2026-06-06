import os
import hashlib
import json
import anthropic
from db import supabase
from copilot.context_builder import build_context

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

SYSTEM_PROMPT = """Você é o Chat Finance, assistente financeiro da Plataforma MCP Brasil.
Você recebe dados reais do banco de dados e explica de forma clara e objetiva.
Regras:
- Nunca invente dados — use apenas o contexto fornecido.
- Seja direto e didático.
- Use R$ e % com formatação brasileira.
- Não faça recomendações de investimento."""


async def processar_pergunta(pergunta: str, contexto_extra: str | None = None) -> dict:
    # Verifica cache
    hash_key = hashlib.sha256(pergunta.strip().lower().encode()).hexdigest()
    cache = supabase.table("copilot_cache").select("*").eq("hash_pergunta", hash_key).execute()

    if cache.data:
        entry = cache.data[0]
        # Incrementa hits
        supabase.table("copilot_cache").update({"hits": entry["hits"] + 1}).eq("id", entry["id"]).execute()
        return {"resposta": entry["resposta_txt"], "dados": entry["dados_json"], "cache": True}

    # Busca contexto no banco
    contexto = await build_context(pergunta)

    # Monta prompt
    user_content = f"Pergunta: {pergunta}\n\nDados disponíveis:\n{json.dumps(contexto['dados'], ensure_ascii=False, indent=2)}"
    if contexto_extra:
        user_content += f"\n\nContexto adicional: {contexto_extra}"

    # Chama Claude
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_content}],
    )
    resposta_txt = response.content[0].text

    # Salva no cache
    supabase.table("copilot_cache").insert({
        "hash_pergunta": hash_key,
        "ativo": contexto.get("ativo"),
        "intencao": contexto.get("intencao"),
        "resposta_txt": resposta_txt,
        "dados_json": contexto["dados"],
    }).execute()

    return {"resposta": resposta_txt, "dados": contexto["dados"], "cache": False}
