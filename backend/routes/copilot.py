import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from copilot import native_agent
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
        if e.response.status_code == 503:
            raise HTTPException(
                status_code=503,
                detail="A IA está temporariamente sobrecarregada. Tente novamente em instantes.",
            )
        raise HTTPException(status_code=502, detail=f"Erro no provedor de IA (HTTP {e.response.status_code}).")


class PerguntaAgent(BaseModel):
    pergunta: str
    agent: str = "quant"  # rv | macro | quant


@router.post("/chat")
async def chat(body: PerguntaAgent):
    """Pergunta financeira respondida via tool use nativo -- o Claude decide
    sozinho quais tools do /mcp chamar, em vez do classificador regex de
    context_builder.py. Endpoint novo, em paralelo ao /pergunta existente
    ate o QA (cenário PESQUISA-01) validar o corte."""
    if not body.pergunta.strip():
        raise HTTPException(status_code=400, detail="Pergunta não pode ser vazia.")
    try:
        resposta = await native_agent.perguntar(body.pergunta, body.agent)
    except native_agent.AgentInvalido as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"resposta": resposta, "agent": body.agent}
