"""
Parsing e validação de arquivos de importação de posições (CSV e XLSX de
relatório de custódia de corretora/banco, ex: BTG).

Puro: bytes/dict entram, dict/list saem -- sem FastAPI, sem chamadas ao banco.
Usado por routes/carteira.py::importar_posicoes().
"""
import io
import logging
import re
import unicodedata
import zipfile
from datetime import date

import defusedxml.ElementTree as ET
from xml.etree.ElementTree import Element  # só tipagem -- parsing de verdade sempre via defusedxml

logger = logging.getLogger(__name__)

TIPOS_VALIDOS = {"acao", "fii", "etf"}
COLUNAS_OBRIGATORIAS = {"ticker", "tipo", "quantidade", "preco_medio"}

# Formatos numéricos aceitos, do mais específico pro mais genérico -- achado
# real de pair-review: `"1.500".replace(",", ".")` vira 1.5 (não 1500), uma
# corrupção SILENCIOSA de quantidade real de usuário se o CSV vier no
# padrão BR de milhar (comum em extrato exportado do Excel). "1.500" sozinho
# (1 grupo de 3 dígitos após um único ponto, sem vírgula) é genuinamente
# ambíguo -- pode ser milhar BR (1500) ou uma fração de 3 casas (1.5 com um
# zero a mais não faria sentido, mas não dá pra saber com certeza) -- por
# isso vira erro explícito em vez de um chute.
_NUM_BR_MILHAR = re.compile(r"^-?\d{1,3}(\.\d{3})+,\d+$")     # 1.500,50
_NUM_US_MILHAR = re.compile(r"^-?\d{1,3}(,\d{3})+(\.\d+)?$")  # 1,500.50 ou 1,500
_NUM_DECIMAL_VIRGULA = re.compile(r"^-?\d+,\d+$")             # 38,50
_NUM_AMBIGUO = re.compile(r"^-?\d{1,3}\.\d{3}$")              # 1.500 -- ambíguo


def _parse_numero(texto: str, campo: str) -> float:
    texto = texto.strip()
    if _NUM_BR_MILHAR.match(texto):
        return float(texto.replace(".", "").replace(",", "."))
    if _NUM_US_MILHAR.match(texto):
        return float(texto.replace(",", ""))
    if _NUM_DECIMAL_VIRGULA.match(texto):
        return float(texto.replace(",", "."))
    if _NUM_AMBIGUO.match(texto):
        raise ValueError(
            f"{campo} '{texto}' é ambíguo (separador de milhar ou casas decimais?) "
            f"-- escreva sem separador de milhar, ex: 1500 ou 1500.00"
        )
    try:
        return float(texto)
    except ValueError:
        raise ValueError(f"{campo} '{texto}' não é um número válido")


def decodificar_csv(bruto: bytes) -> str:
    """Extrato de outra corretora/banco (Excel PT-BR) costuma salvar CSV em
    cp1252/latin-1, não UTF-8 -- decodificar direto sem fallback quebrava
    com UnicodeDecodeError não tratado (500 cru sem mensagem útil, achado
    de pair-review). latin-1 nunca falha (mapeamento 1:1 de byte), então
    serve de último recurso garantido."""
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            return bruto.decode(encoding)
        except UnicodeDecodeError:
            continue
    return bruto.decode("latin-1")


# --- Suporte a XLSX real de corretora/banco (ex: relatório de custódia do
# BTG) -- achado ao vivo, testado contra um relatório real do usuário: o
# arquivo vem com extensão .xls mas é na verdade .xlsx (OOXML/zip), então a
# extensão não é confiável -- detecção é pelo conteúdo (zipfile.is_zipfile).
# Parser via zipfile + xml.etree (stdlib, sem pandas/openpyxl -- mantém o
# backend enxuto pro free tier do Render) em vez de mandar o usuário
# reformatar manualmente num CSV.
_NS_SPREADSHEET = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
_NS_RELATIONSHIPS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

# Cabeçalho real confirmado no relatório de custódia BTG (aba "Renda
# Variavel"): Código, Ativo, Tipo, Qtde., Preço Fechamento R$, Preço Médio
# R$, Saldo Bruto R$ -- só as colunas que a carteira precisa entram aqui.
_COLUNAS_XLSX = {
    "codigo": "ticker",
    "tipo": "tipo",
    "qtde.": "quantidade", "qtde": "quantidade",
    "preco medio r$": "preco_medio",
}


def _normalizar_texto(texto: str) -> str:
    sem_acento = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return sem_acento.strip().lower()


def _mapear_tipo_xlsx(bruto: str | None) -> str:
    """BTG usa 'FII' pra fundos listados (único caso confirmado ao vivo).
    Aceita também ETF/Ação por extensão do vocabulário já usado no resto da
    plataforma -- sem confirmação real desses dois no relatório, mas 'acao'
    é o mesmo termo (sem acento) já usado no formulário manual de
    /carteira. Comparação por igualdade exata, não substring (achado de
    pair-review: "in" bateria falso-positivo em algo como "Fração" ->
    "fracao", que também contém "aca"). Qualquer outra coisa passa adiante
    sem tradução e vira erro de validação explícito em validar_linha, não
    um chute silencioso."""
    n = _normalizar_texto(bruto or "")
    if n == "fii":
        return "fii"
    if n == "etf":
        return "etf"
    if n in ("acao", "acoes"):
        return "acao"
    return n


def _shared_strings_xlsx(zf: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []
    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    return [
        "".join(t.text or "" for t in si.iter(f"{_NS_SPREADSHEET}t"))
        for si in root.findall(f"{_NS_SPREADSHEET}si")
    ]


def _indice_coluna_xlsx(ref_celula: str) -> int:
    """Converte referência de célula OOXML ('B13', 'AA5') pro índice de
    coluna 0-based ('B'->1, 'AA'->26). Necessário porque o Excel OMITE do
    XML o <c> de células genuinamente vazias -- indexar pela ORDEM DE
    APARIÇÃO das células (em vez da coluna real) desloca todas as colunas
    seguintes quando uma célula do meio da linha vem vazia. Achado real de
    pair-review: no próprio relatório de teste, a coluna A de toda linha
    vem vazia e sem <c> nenhum no XML -- um bug de deslocamento silencioso
    de preco_medio/quantidade em produção, não hipotético."""
    letras = "".join(ch for ch in ref_celula if ch.isalpha())
    indice = 0
    for ch in letras:
        indice = indice * 26 + (ord(ch.upper()) - ord("A") + 1)
    return indice - 1


def _valor_celula_xlsx(c: Element, strings: list[str]) -> str | None:
    v = c.find(f"{_NS_SPREADSHEET}v")
    if v is None or v.text is None:
        return None
    if c.get("t") == "s":
        return strings[int(v.text)]
    return v.text


def _linhas_planilha_xlsx(zf: zipfile.ZipFile, caminho: str, strings: list[str]) -> list[dict[int, str]]:
    """Cada linha vira um dict {índice_de_coluna: valor}, não uma lista
    posicional -- ver _indice_coluna_xlsx."""
    root = ET.fromstring(zf.read(caminho))
    linhas = []
    for row in root.iter(f"{_NS_SPREADSHEET}row"):
        linha = {}
        for c in row.findall(f"{_NS_SPREADSHEET}c"):
            ref = c.get("r")
            if not ref:
                continue
            valor = _valor_celula_xlsx(c, strings)
            if valor is not None:
                linha[_indice_coluna_xlsx(ref)] = valor
        linhas.append(linha)
    return linhas


# Guardas contra zip bomb / arquivo hostil -- endpoint público, upload de
# usuário, achado de pair-review: sem isso, um zip pequeno mas malicioso
# (poucos KB comprimidos, GBs descomprimidos) travaria o único worker
# uvicorn do Render (ver comentário de asyncio.to_thread em get_analise,
# routes/carteira.py) e junto todas as requisições em voo da plataforma,
# não só a do atacante.
TAMANHO_MAX_ENTRY_DESCOMPRIMIDO = 20 * 1024 * 1024  # 20 MB por arquivo dentro do zip


def _validar_tamanho_zip(zf: zipfile.ZipFile) -> None:
    for info in zf.infolist():
        if info.file_size > TAMANHO_MAX_ENTRY_DESCOMPRIMIDO:
            raise ValueError(
                f"arquivo '{info.filename}' dentro do XLSX é grande demais ao descomprimir "
                f"-- suspeito de zip bomb, upload rejeitado"
            )


def extrair_linhas_xlsx(bruto: bytes) -> list[dict]:
    """Varre todas as abas do arquivo procurando uma tabela com cabeçalho
    reconhecível (Código/Tipo/Qtde./Preço Médio) -- não depende do nome da
    aba (confirmado como "Renda Variavel" no BTG, mas outras
    corretoras/bancos podem nomear diferente). Para na primeira linha sem
    ticker ou que comece com "total" (linha de subtotal, ex: "Total em
    Fundos Listados R$") -- não tenta ler Conta Corrente/Valores em
    Trânsito (saldo em caixa, não posição de ativo, fora do escopo de
    carteira_posicoes). Só a primeira aba com tabela reconhecível é
    importada -- se uma segunda aba também bater, isso é logado como aviso
    em vez de ignorado sem rastro (achado de pair-review: mesma classe de
    risco do truncamento silencioso de paginação já sofrido no projeto)."""
    with zipfile.ZipFile(io.BytesIO(bruto)) as zf:
        _validar_tamanho_zip(zf)
        strings = _shared_strings_xlsx(zf)

        rels_root = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
        sheet_targets = {
            rel.get("Id"): rel.get("Target")
            for rel in rels_root
            if "worksheet" in rel.get("Type", "")
        }
        workbook_root = ET.fromstring(zf.read("xl/workbook.xml"))

        resultado: list[dict] | None = None
        nome_aba_resultado: str | None = None
        for sheet in workbook_root.iter(f"{_NS_SPREADSHEET}sheet"):
            target = sheet_targets.get(sheet.get(f"{_NS_RELATIONSHIPS}id"))
            if not target:
                continue
            linhas = _linhas_planilha_xlsx(zf, f"xl/{target}", strings)

            for i, linha in enumerate(linhas):
                idx = {}
                for col, celula in linha.items():
                    chave = _COLUNAS_XLSX.get(_normalizar_texto(celula))
                    if chave:
                        idx[chave] = col
                if not {"ticker", "tipo", "quantidade", "preco_medio"} <= idx.keys():
                    continue  # não é o cabeçalho da tabela de posições

                registros = []
                for dado in linhas[i + 1:]:
                    if not dado:
                        break
                    ticker_bruto = dado.get(idx["ticker"])
                    if not ticker_bruto or _normalizar_texto(ticker_bruto).startswith("total"):
                        break
                    registros.append({
                        "ticker": ticker_bruto.rstrip("*").strip(),
                        "tipo": _mapear_tipo_xlsx(dado.get(idx["tipo"])),
                        "quantidade": dado.get(idx["quantidade"]),
                        "preco_medio": dado.get(idx["preco_medio"]),
                    })
                if registros:
                    if resultado is None:
                        resultado, nome_aba_resultado = registros, sheet.get("name")
                    else:
                        logger.warning(
                            f"importação de carteira: aba '{sheet.get('name')}' também tem uma "
                            f"tabela de posições reconhecível -- só '{nome_aba_resultado}' foi "
                            f"importada, essa segunda foi ignorada"
                        )
                break  # já achou (ou não) o cabeçalho desta aba -- não procura outro na mesma aba
        return resultado or []


def validar_linha(linha: dict) -> dict:
    """Valida uma linha de CSV nos mesmos moldes de PosicaoCreate, mas
    linha a linha (não via Pydantic) -- assim uma linha ruim vira um erro
    reportado pro usuário, em vez de derrubar o INSERT em lote inteiro por
    violar o CHECK constraint de `tipo`/`quantidade`/`preco_medio` no banco."""
    ticker = (linha.get("ticker") or "").strip().upper()
    if not ticker:
        raise ValueError("ticker vazio")

    tipo = (linha.get("tipo") or "").strip().lower()
    if tipo not in TIPOS_VALIDOS:
        raise ValueError(f"tipo '{tipo}' inválido -- use acao, fii ou etf")

    quantidade = _parse_numero(linha.get("quantidade") or "", "quantidade")
    preco_medio = _parse_numero(linha.get("preco_medio") or "", "preco_medio")
    if quantidade <= 0 or preco_medio <= 0:
        raise ValueError("quantidade e preco_medio devem ser maiores que zero")

    data_entrada = (linha.get("data_entrada") or "").strip() or date.today().isoformat()
    try:
        date.fromisoformat(data_entrada)
    except ValueError:
        raise ValueError(f"data_entrada '{data_entrada}' inválida -- use AAAA-MM-DD")

    return {
        "ticker": ticker, "tipo": tipo, "quantidade": quantidade,
        "preco_medio": preco_medio, "data_entrada": data_entrada,
    }
