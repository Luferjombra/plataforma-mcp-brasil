from copilot.librechat_client import perguntar_librechat


async def processar_pergunta(pergunta: str, contexto_extra: str | None = None) -> dict:
    mensagem = pergunta if not contexto_extra else f"{pergunta}\n\nContexto adicional: {contexto_extra}"
    resultado = await perguntar_librechat(mensagem)
    return {"resposta": resultado["resposta"], "fonte": resultado["fonte"], "cached": False}
