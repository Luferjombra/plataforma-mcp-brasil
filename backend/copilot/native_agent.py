"""
Copilot nativo -- tool use via Anthropic tool_runner conectado aos
sub-servidores MCP ja expostos em backend/main.py (mcp_rv, mcp_macro, mcp).

Substitui o classificador regex de context_builder.py: em vez de decidir
"na mao" qual tabela consultar, o LLM ve as tools disponiveis (geradas
automaticamente pelo fastapi-mcp a partir das rotas existentes) e decide
sozinho qual chamar. Nenhuma logica de query e duplicada aqui.
"""
import os

import anthropic
from anthropic.lib.tools.mcp import async_mcp_tool
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5")

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


async def perguntar(pergunta: str, agent: str = "quant") -> str:
    """Responde `pergunta` usando o agent indicado (rv/macro/quant).

    O LLM decide sozinho quais tools do sub-servidor MCP correspondente
    chamar -- nao ha classificacao de intencao previa.
    """
    if agent not in MCP_PATHS:
        raise AgentInvalido(f"agent invalido: {agent!r}. Use um de {sorted(MCP_PATHS)}.")

    url = _MCP_BASE_URL + MCP_PATHS[agent]
    client = anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

    async with streamablehttp_client(url) as (read, write, _get_session_id):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools_result = await session.list_tools()
            tools = [async_mcp_tool(t, session) for t in tools_result.tools]

            runner = client.beta.messages.tool_runner(
                model=ANTHROPIC_MODEL,
                max_tokens=1024,
                system=[{
                    "type": "text",
                    "text": SYSTEM_PROMPTS[agent],
                    "cache_control": {"type": "ephemeral"},
                }],
                tools=tools,
                messages=[{"role": "user", "content": pergunta}],
            )

            final = None
            async for message in runner:
                final = message

    if final is None:
        raise RuntimeError("tool_runner nao retornou nenhuma mensagem.")
    return next((bloco.text for bloco in final.content if bloco.type == "text"), "")
