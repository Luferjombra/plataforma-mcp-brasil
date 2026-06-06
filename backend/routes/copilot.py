from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from copilot.orchestrator import processar_pergunta

router = APIRouter()


class Pergunta(BaseModel):
    pergunta: str
    contexto_extra: str | None = None


@router.post("/pergunta")
async def fazer_pergunta(body: Pergunta):
    """Recebe uma pergunta financeira e retorna resposta via Claude + dados do Supabase."""
    if not body.pergunta.strip():
        raise HTTPException(status_code=400, detail="Pergunta não pode ser vazia.")
    resposta = await processar_pergunta(body.pergunta, body.contexto_extra)
    return resposta
