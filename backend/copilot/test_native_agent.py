"""
Testes do roteamento de agent do Copilot nativo -- nao exercitam o
tool_runner de verdade (precisa de ANTHROPIC_API_KEY e do /mcp no ar),
so a validacao que independe de rede.

Rodar: python -m unittest copilot.test_native_agent -v   (a partir de backend/)
"""
import unittest

from copilot import native_agent


class ConfiguracaoDeAgentsTest(unittest.TestCase):
    def test_mesmos_agents_em_paths_e_prompts(self):
        self.assertEqual(set(native_agent.MCP_PATHS), set(native_agent.SYSTEM_PROMPTS))

    def test_agents_esperados(self):
        self.assertEqual(set(native_agent.MCP_PATHS), {"rv", "macro", "quant"})

    def test_quant_usa_mount_dedicado_somente_leitura(self):
        # nao pode reusar o /mcp geral (que tem os endpoints de escrita da
        # carteira) -- teria que ser um mount proprio, ex. /mcp/quant.
        self.assertNotEqual(native_agent.MCP_PATHS["quant"], "/mcp")


class PerguntarValidacaoTest(unittest.IsolatedAsyncioTestCase):
    async def test_agent_invalido_levanta_erro_sem_chamar_rede(self):
        with self.assertRaises(native_agent.AgentInvalido):
            await native_agent.perguntar("qualquer pergunta", agent="inexistente")


if __name__ == "__main__":
    unittest.main()
