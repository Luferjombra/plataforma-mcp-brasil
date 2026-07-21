"""
Testes do parsing de importação de carteira (CSV/XLSX) -- isolados, sem
FastAPI nem Supabase, exatamente o ganho do refactor que tirou esse código
de routes/carteira.py.

Rodar: python -m unittest carteira.test_importacao -v   (a partir de backend/)
"""
import io
import unittest
import zipfile

from carteira import importacao as imp


class DecodificarCsvTest(unittest.TestCase):
    def test_utf8(self):
        self.assertEqual(imp.decodificar_csv("ticker,tipo\n".encode("utf-8")), "ticker,tipo\n")

    def test_cp1252_fallback(self):
        # "Preço" em cp1252 não é UTF-8 válido -- exercita o fallback.
        bruto = "ticker,preço\n".encode("cp1252")
        self.assertIn("preço", imp.decodificar_csv(bruto))


class ValidarLinhaTest(unittest.TestCase):
    def _linha(self, **overrides):
        base = {"ticker": "petr4", "tipo": "acao", "quantidade": "100", "preco_medio": "38.72"}
        return {**base, **overrides}

    def test_linha_valida_normaliza_ticker_e_tipo(self):
        v = imp.validar_linha(self._linha())
        self.assertEqual(v["ticker"], "PETR4")
        self.assertEqual(v["tipo"], "acao")
        self.assertEqual(v["quantidade"], 100.0)
        self.assertEqual(v["preco_medio"], 38.72)

    def test_numero_br_milhar(self):
        v = imp.validar_linha(self._linha(quantidade="1.500,50"))
        self.assertEqual(v["quantidade"], 1500.50)

    def test_numero_us_milhar(self):
        v = imp.validar_linha(self._linha(quantidade="1,500.50"))
        self.assertEqual(v["quantidade"], 1500.50)

    def test_numero_decimal_virgula(self):
        v = imp.validar_linha(self._linha(preco_medio="38,50"))
        self.assertEqual(v["preco_medio"], 38.50)

    def test_numero_ambiguo_rejeitado(self):
        with self.assertRaises(ValueError):
            imp.validar_linha(self._linha(quantidade="1.500"))

    def test_ticker_vazio_rejeitado(self):
        with self.assertRaises(ValueError):
            imp.validar_linha(self._linha(ticker=""))

    def test_tipo_invalido_rejeitado(self):
        with self.assertRaises(ValueError):
            imp.validar_linha(self._linha(tipo="cripto"))

    def test_quantidade_zero_rejeitada(self):
        with self.assertRaises(ValueError):
            imp.validar_linha(self._linha(quantidade="0"))

    def test_data_entrada_invalida_rejeitada(self):
        with self.assertRaises(ValueError):
            imp.validar_linha(self._linha(data_entrada="31/12/2026"))

    def test_data_entrada_ausente_usa_hoje(self):
        v = imp.validar_linha(self._linha())
        self.assertRegex(v["data_entrada"], r"^\d{4}-\d{2}-\d{2}$")


def _montar_xlsx(linhas_sheet_xml: bytes, nome_aba: str = "Renda Variavel") -> bytes:
    """Monta um XLSX mínimo (só o necessário pro parser) com uma única aba."""
    content_types = (
        b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        b'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        b'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        b'<Default Extension="xml" ContentType="application/xml"/>'
        b'</Types>'
    )
    rels = (
        b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        b'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        b'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        b'</Relationships>'
    )
    workbook = (
        b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        b'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        b'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        b'<sheets><sheet name="' + nome_aba.encode() + b'" sheetId="1" r:id="rId1"/></sheets>'
        b'</workbook>'
    )
    workbook_rels = (
        b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        b'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        b'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        b'</Relationships>'
    )
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("[Content_Types].xml", content_types)
        zf.writestr("_rels/.rels", rels)
        zf.writestr("xl/workbook.xml", workbook)
        zf.writestr("xl/_rels/workbook.xml.rels", workbook_rels)
        zf.writestr("xl/worksheets/sheet1.xml", linhas_sheet_xml)
    return buf.getvalue()


class ExtrairLinhasXlsxTest(unittest.TestCase):
    def test_relatorio_btg_com_coluna_a_vazia(self):
        # Reproduz o achado real de pair-review: coluna A vem sem <c> no XML
        # (célula genuinamente vazia) -- ticker/tipo/qtde/preço começam em B.
        sheet = b"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>
<row r="1"><c r="B1" t="str"><v>Codigo</v></c><c r="C1" t="str"><v>Tipo</v></c><c r="D1" t="str"><v>Qtde.</v></c><c r="E1" t="str"><v>Preco Medio R$</v></c></row>
<row r="2"><c r="B2" t="str"><v>PETR4</v></c><c r="C2" t="str"><v>ACAO</v></c><c r="D2" t="str"><v>100</v></c><c r="E2" t="str"><v>38.72</v></c></row>
<row r="3"><c r="B3" t="str"><v>Total</v></c></row>
</sheetData></worksheet>"""
        linhas = imp.extrair_linhas_xlsx(_montar_xlsx(sheet))
        self.assertEqual(linhas, [{
            "ticker": "PETR4", "tipo": "acao", "quantidade": "100", "preco_medio": "38.72",
        }])

    def test_sem_tabela_reconhecivel_retorna_vazio(self):
        sheet = b"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData><row r="1"><c r="A1" t="str"><v>Saldo em conta corrente</v></c></row></sheetData>
</worksheet>"""
        self.assertEqual(imp.extrair_linhas_xlsx(_montar_xlsx(sheet)), [])

    def test_zip_bomb_rejeitado(self):
        sheet = b"x" * 100
        bruto = _montar_xlsx(sheet)
        with self._patch_limite(1):  # 1 byte -- qualquer entry real estoura
            with self.assertRaises(ValueError):
                imp.extrair_linhas_xlsx(bruto)

    def _patch_limite(self, valor):
        import unittest.mock as mock
        return mock.patch.object(imp, "TAMANHO_MAX_ENTRY_DESCOMPRIMIDO", valor)


if __name__ == "__main__":
    unittest.main()
