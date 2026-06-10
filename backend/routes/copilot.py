import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from copilot.orchestrator import processar_pergunta

router = APIRouter()


class Pergunta(BaseModel):
    pergunta: str
    contexto_extra: str | None = None


@router.post("/pergunta")
async def fazer_pergunta(body: Pergunta):
    """Recebe uma pergunta financeira e retorna resposta via LLM + dados do Supabase."""
    if not body.pergunta.strip():
        raise HTTPException(status_code=400, detail="Pergunta não pode ser vazia.")
    try:
        return await processar_pergunta(body.pergunta, body.contexto_extra)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 429:
            raise HTTPException(
                status_code=429,
                detail="Limite de uso da IA atingido no momento. Aguarde alguns minutos e tente novamente.",
            )
        raise HTTPException(status_code=502, detail=f"Erro no provedor de IA (HTTP {e.response.status_code}).")
