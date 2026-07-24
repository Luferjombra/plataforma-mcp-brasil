"""
Copilot -- tool use nativo da Anthropic (substitui o proxy pro LibreChat).

O LLM decide sozinho quais tools do /mcp chamar, em vez de um classificador
de intencao ou de um agent externo. Dois endpoints:
- POST /pergunta : contrato antigo {pergunta, contexto_extra} que o widget do
  frontend ja usa -- mantido pra nao quebrar o frontend, agora servido pelo
  tool use nativo (agent "quant").
- POST /chat     : contrato novo {pergunta, agent, session_id} com escolha de
  persona (rv/macro/quant) e session_id da carteira.
"""
import anthropic
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from copilot import native_agent

router = APIRouter()

FONTE_PADRAO = "Tool use nativo"


def _traduzir_erro_anthropic(e: Exception) -> HTTPException:
    """Mapeia erros do SDK Anthropic pras mesmas mensagens amigaveis que o
    endpoint antigo usava (o SDK levanta anthropic.*Error, nao httpx)."""
    if isinstance(e, anthropic.RateLimitError):
        return HTTPException(
            status_code=429,
            detail="Limite de uso da IA atingido no momento. Aguarde alguns minutos e tente novamente.",
        )
    if isinstance(e, anthropic.APIStatusError) and e.status_code >= 500:
        return HTTPException(
            status_code=503,
            detail="A IA está temporariamente sobrecarregada. Tente novamente em instantes.",
        )
    if isinstance(e, anthropic.APIStatusError):
        return HTTPException(status_code=502, detail=f"Erro no provedor de IA (HTTP {e.status_code}).")
    return HTTPException(status_code=502, detail="Erro de conexão com o provedor de IA.")


class Pergunta(BaseModel):
    pergunta: str
    contexto_extra: str | None = None


@router.post("/pergunta")
async def fazer_pergunta(body: Pergunta):
    """Contrato antigo do widget do frontend. Serve a persona geral (quant)
    via tool use nativo e devolve {resposta, fonte, cached} -- o frontend
    exibe `fonte`/`cached` como badges."""
    if not body.pergunta.strip():
        raise HTTPException(status_code=400, detail="Pergunta não pode ser vazia.")
    pergunta = body.pergunta
    if body.contexto_extra:
        pergunta = f"{pergunta}\n\nContexto adicional: {body.contexto_extra}"
    try:
        resposta = await native_agent.perguntar(pergunta, agent="quant")
    except anthropic.APIError as e:
        raise _traduzir_erro_anthropic(e)
    return {"resposta": resposta, "fonte": FONTE_PADRAO, "cached": False}


class PerguntaAgent(BaseModel):
    pergunta: str
    agent: str = "quant"  # rv | macro | quant
    session_id: str | None = None  # da carteira do usuário; injeta nas tools de carteira


@router.post("/chat")
async def chat(body: PerguntaAgent):
    """Contrato novo com escolha de persona e session_id da carteira. O Claude
    decide sozinho quais tools do /mcp chamar."""
    if not body.pergunta.strip():
        raise HTTPException(status_code=400, detail="Pergunta não pode ser vazia.")
    try:
        resposta = await native_agent.perguntar(body.pergunta, body.agent, body.session_id)
    except native_agent.AgentInvalido as e:
        raise HTTPException(status_code=400, detail=str(e))
    except anthropic.APIError as e:
        raise _traduzir_erro_anthropic(e)
    return {"resposta": resposta, "agent": body.agent}
