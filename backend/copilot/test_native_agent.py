"""
Testes do Copilot nativo -- nao exercitam o tool_runner de verdade (precisa
de ANTHROPIC_API_KEY e do LLM), so a montagem/filtragem de tools e a
validacao, que independem de rede.

Rodar: python -m unittest copilot.test_native_agent -v   (a partir de backend/)
"""
import os
import unittest

from copilot import native_agent


def setUpModule():
    # `import main` exige essas env vars (db.py cria o client Supabase no
    # import). Valores fake -- nenhum teste aqui faz chamada de rede real.
    os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
    os.environ.setdefault(
        "SUPABASE_SERVICE_KEY",
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.dGVzdA",
    )
    os.environ.setdefault("ANTHROPIC_API_KEY", "sk-test")


TOOLS_ESCRITA_CARTEIRA = {
    "add_posicao_carteira_posicoes_post",
    "importar_posicoes_carteira_posicoes_importar_post",
    "delete_posicao_carteira_posicoes__posicao_id__delete",
}


class ConfiguracaoDeAgentsTest(unittest.TestCase):
    def test_mesmos_agents_em_paths_e_prompts(self):
        self.assertEqual(set(native_agent.MCP_PATHS), set(native_agent.SYSTEM_PROMPTS))

    def test_agents_esperados(self):
        self.assertEqual(set(native_agent.MCP_PATHS), {"rv", "macro", "quant"})

    def test_quant_usa_mount_dedicado_somente_leitura(self):
        # nao pode reusar o /mcp geral (que tem os endpoints de escrita da
        # carteira) -- teria que ser um mount proprio, ex. /mcp/quant.
        self.assertNotEqual(native_agent.MCP_PATHS["quant"], "/mcp")


class SubServidoresSemEscritaTest(unittest.TestCase):
    """Garantia de seguranca real: nenhuma persona do Copilot pode ter as
    tools de escrita da carteira. Nao confia so no path -- lista as tools
    que os FastApiMCP de fato expoem (FastApiMCP.__init__ ja popula .tools)."""

    def test_nenhum_subservidor_do_copilot_expoe_escrita(self):
        import main
        for label, srv in [
            ("mcp_quant", main.mcp_quant),
            ("mcp_rv", main.mcp_rv),
            ("mcp_macro", main.mcp_macro),
        ]:
            nomes = {t.name for t in srv.tools}
            intersec = nomes & TOOLS_ESCRITA_CARTEIRA
            self.assertEqual(intersec, set(), f"{label} expoe tool de escrita: {intersec}")


class MontarToolsCarteiraTest(unittest.TestCase):
    """A montagem de tools nao faz rede -- so constroi os runnables --,
    entao da pra testar a filtragem/injecao de session_id offline."""

    def setUp(self):
        import main
        self.mcp_tools = main.mcp_rv.tools  # RV inclui as 2 tools de carteira (leitura)

    def _nomes(self, tools):
        return {t.name for t in tools}

    def test_sem_session_id_oculta_tools_de_carteira(self):
        tools = native_agent._montar_tools(self.mcp_tools, None, None)
        nomes = self._nomes(tools)
        self.assertNotIn("get_posicoes_carteira_posicoes_get", nomes)
        self.assertNotIn("get_analise_carteira_analise_get", nomes)
        # as demais (nao-carteira) continuam
        self.assertIn("get_ativos_rv_ativos_get", nomes)

    def test_com_session_id_inclui_tools_de_carteira(self):
        tools = native_agent._montar_tools(self.mcp_tools, None, "sess-123")
        nomes = self._nomes(tools)
        self.assertIn("get_posicoes_carteira_posicoes_get", nomes)
        self.assertIn("get_analise_carteira_analise_get", nomes)

    def test_wrapper_remove_session_id_do_schema(self):
        # o LLM nao deve ver/preencher session_id -- e injetado por nos.
        tool_posicoes = next(t for t in self.mcp_tools if t.name.startswith("get_posicoes_carteira"))
        wrapped = native_agent._tool_carteira_com_session(tool_posicoes, None, "sess-123")
        schema = wrapped.input_schema
        self.assertNotIn("session_id", schema.get("properties", {}))
        self.assertNotIn("session_id", schema.get("required", []))


class PerguntarValidacaoTest(unittest.IsolatedAsyncioTestCase):
    async def test_agent_invalido_levanta_erro_sem_chamar_rede(self):
        with self.assertRaises(native_agent.AgentInvalido):
            await native_agent.perguntar("qualquer pergunta", agent="inexistente")


class PerformanceCacheTest(unittest.TestCase):
    def test_cliente_anthropic_e_singleton(self):
        # reusa o pool de conexao em vez de recriar o cliente a cada pergunta.
        c1 = native_agent._get_client()
        c2 = native_agent._get_client()
        self.assertIs(c1, c2)

    def test_cache_de_defs_de_tools_existe_e_e_por_persona(self):
        # o cache e um dict chaveado por persona; comeca vazio (preenchido no
        # 1o request de cada persona, evitando list_tools nos seguintes).
        self.assertIsInstance(native_agent._TOOLS_DEFS_CACHE, dict)


if __name__ == "__main__":
    unittest.main()
