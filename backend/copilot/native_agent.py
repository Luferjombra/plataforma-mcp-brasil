"""
Copilot nativo -- tool use via Anthropic tool_runner conectado aos
sub-servidores MCP ja expostos em backend/main.py (mcp_rv, mcp_macro, mcp).

Substitui o classificador regex de context_builder.py: em vez de decidir
"na mao" qual tabela consultar, o LLM ve as tools disponiveis (geradas
automaticamente pelo fastapi-mcp a partir das rotas existentes) e decide
sozinho qual chamar. Nenhuma logica de query e duplicada aqui.
"""
import copy
import logging
import os

import anthropic
from anthropic import beta_async_tool
from anthropic.lib.tools.mcp import async_mcp_tool, _convert_tool_result
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

log = logging.getLogger("copilot.native_agent")

ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5")
# Teto de saida por turno. 1024 era baixo demais: numa resposta analitica
# (ex.: "desempenho da acao no ano") o modelo estoura o teto antes de emitir
# o texto final e o runner encerra sem bloco de texto -> caia no _FALLBACK.
_MAX_TOKENS = int(os.getenv("COPILOT_MAX_TOKENS", "2048"))

# Tools de carteira que exigem session_id (rota GET /carteira/*). O session_id
# nunca vem do LLM -- e do frontend (localStorage), injetado por nos. Sem
# session_id no request, estas tools nem sao oferecidas ao modelo.
_TOOLS_CARTEIRA = ("get_posicoes_carteira", "get_analise_carteira")

_PORT = os.getenv("PORT", "8000")
# Loopback -- o /mcp e os sub-servidores rodam no mesmo processo/container.
_MCP_BASE_URL = os.getenv("MCP_INTERNAL_URL", f"http://127.0.0.1:{_PORT}")

MCP_PATHS = {
    "rv": "/mcp/rv",
    "macro": "/mcp/macro",
    "quant": "/mcp/quant",
}

SYSTEM_PROMPTS = {
    "rv": (
        "Voce e o Analista RV do Chat Finance, especialista em renda variavel e "
        "carteira de investimentos da Plataforma MCP Brasil.\n"
        "Use as tools disponiveis para consultar dados reais antes de responder.\n"
        "Regras:\n"
        "- Nunca invente dados -- se a tool nao retornar o que precisa, diga isso.\n"
        "- Seja direto e didatico. Use R$ e % com formatacao brasileira.\n"
        "- Nao faca recomendacoes de investimento."
    ),
    "macro": (
        "Voce e o Analista Macro do Chat Finance, especialista em indicadores "
        "economicos, renda fixa e indices ANBIMA da Plataforma MCP Brasil.\n"
        "Use as tools disponiveis para consultar dados reais antes de responder.\n"
        "Regras:\n"
        "- Nunca invente dados -- se a tool nao retornar o que precisa, diga isso.\n"
        "- Seja direto e didatico. Use R$ e % com formatacao brasileira.\n"
        "- Nao faca recomendacoes de investimento."
    ),
    "quant": (
        "Voce e o Analista Quant do Chat Finance, assistente financeiro geral da "
        "Plataforma MCP Brasil, com acesso a todos os dados da plataforma.\n"
        "Use as tools disponiveis para consultar dados reais antes de responder.\n"
        "Regras:\n"
        "- Nunca invente dados -- se a tool nao retornar o que precisa, diga isso.\n"
        "- Seja direto e didatico. Use R$ e % com formatacao brasileira.\n"
        "- Nao faca recomendacoes de investimento."
    ),
}

class AgentInvalido(ValueError):
    """Levantado quando o nome do agent nao corresponde a nenhum persona configurado."""


def _tool_carteira_com_session(mcp_tool, session: ClientSession, session_id: str):
    """Wrapper que injeta o session_id fixo na chamada da tool de carteira.

    O session_id e removido do input_schema (o LLM nao preenche) e injetado
    por nos antes de `session.call_tool`. Segue o mesmo padrao interno do
    `async_mcp_tool` do SDK (call -> converte resultado), mudando so isso.
    """
    nome = mcp_tool.name
    schema = copy.deepcopy(mcp_tool.inputSchema)
    schema.get("properties", {}).pop("session_id", None)
    if "required" in schema:
        schema["required"] = [r for r in schema["required"] if r != "session_id"]

    async def chamar(**kwargs):
        result = await session.call_tool(name=nome, arguments={**kwargs, "session_id": session_id})
        return _convert_tool_result(result)

    return beta_async_tool(
        chamar,
        name=nome,
        description=mcp_tool.description,
        input_schema=schema,
    )


def _montar_tools(mcp_tools, session: ClientSession, session_id: str | None):
    """Converte as tools MCP em runnables, tratando as de carteira conforme
    o session_id: injeta se presente, oculta se ausente."""
    tools = []
    for t in mcp_tools:
        eh_carteira = t.name.startswith(_TOOLS_CARTEIRA)
        if eh_carteira:
            if session_id is None:
                continue  # oculta a tool -- sem session_id nao da pra consultar carteira
            tools.append(_tool_carteira_com_session(t, session, session_id))
        else:
            tools.append(async_mcp_tool(t, session))
    return tools


async def perguntar(pergunta: str, agent: str = "quant", session_id: str | None = None) -> str:
    """Responde `pergunta` usando o agent indicado (rv/macro/quant).

    O LLM decide sozinho quais tools do sub-servidor MCP correspondente
    chamar -- nao ha classificacao de intencao previa. `session_id` (quando
    fornecido) e injetado nas tools de carteira; sem ele, elas nao aparecem.
    """
    if agent not in MCP_PATHS:
        raise AgentInvalido(f"agent invalido: {agent!r}. Use um de {sorted(MCP_PATHS)}.")

    url = _MCP_BASE_URL + MCP_PATHS[agent]
    client = anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

    async with streamablehttp_client(url) as (read, write, _get_session_id):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools_result = await session.list_tools()
            tools = _montar_tools(tools_result.tools, session, session_id)

            runner = client.beta.messages.tool_runner(
                model=ANTHROPIC_MODEL,
                max_tokens=_MAX_TOKENS,
                system=[{
                    "type": "text",
                    "text": SYSTEM_PROMPTS[agent],
                    "cache_control": {"type": "ephemeral"},
                }],
                tools=tools,
                messages=[{"role": "user", "content": pergunta}],
            )

            final = None
            turnos = 0
            async for message in runner:
                final = message
                turnos += 1

    # Fallback amigavel em vez de 500 cru: o runner pode nao emitir mensagem
    # nenhuma, ou parar num bloco tool_use / refusal sem texto final. Logamos
    # o motivo exato (stop_reason + tipos de bloco) pra diagnosticar em prod --
    # sem isso o fallback e uma caixa-preta.
    _FALLBACK = "Não consegui gerar uma resposta agora. Tente reformular a pergunta."
    if final is None:
        log.warning("copilot fallback: runner nao emitiu nenhuma mensagem (agent=%s)", agent)
        return _FALLBACK
    texto = next((bloco.text for bloco in final.content if bloco.type == "text"), "").strip()
    if not texto:
        log.warning(
            "copilot fallback: mensagem final sem texto (agent=%s, stop_reason=%s, blocos=%s, turnos=%s)",
            agent, getattr(final, "stop_reason", None),
            [getattr(b, "type", "?") for b in final.content], turnos,
        )
        return _FALLBACK
    return texto
