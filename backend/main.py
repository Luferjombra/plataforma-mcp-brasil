from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi_mcp import FastApiMCP
from routes import indicadores, rv, fundos, noticias, copilot, rf, health

app = FastAPI(
    title="Plataforma MCP Brasil API",
    description=(
        "API financeira analítica com dados históricos do Brasil. "
        "Cobre Renda Variável (B3), Renda Fixa (Tesouro Direto), "
        "Fundos de Investimento (CVM) e Indicadores Econômicos (BCB)."
    ),
    version="0.1.0",
)

# ── Security headers ──────────────────────────────────────────────────────────
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

app.add_middleware(SecurityHeadersMiddleware)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://plataforma-mcp-brasil.vercel.app",
        "http://localhost:3000",  # dev local
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(indicadores.router, prefix="/indicadores", tags=["Indicadores"])
app.include_router(rv.router, prefix="/rv", tags=["Renda Variável"])
app.include_router(fundos.router, prefix="/fundos", tags=["Fundos"])
app.include_router(noticias.router, prefix="/noticias", tags=["Notícias"])
app.include_router(copilot.router, prefix="/copilot", tags=["Copilot"])
app.include_router(rf.router, prefix="/rf", tags=["Renda Fixa"])
app.include_router(health.router, prefix="/health/etl", tags=["Monitoramento ETL"])


@app.get("/")
def health_check():
    return {"status": "ok", "version": "0.1.0"}


# ── MCP Server ────────────────────────────────────────────────────────────────
# Expõe as rotas financeiras como ferramentas MCP para IAs (Claude, Cursor, etc.)
# Endpoint: GET /mcp  — compatível com MCP 2024-11-05 (SSE)
# Exclui rotas internas (copilot, noticias, health) — expõe apenas dados analíticos
mcp = FastApiMCP(
    app,
    name="Plataforma MCP Brasil",
    description=(
        "Dados financeiros históricos do Brasil: ações B3, Tesouro Direto, "
        "fundos de investimento e indicadores econômicos (Selic, IPCA, CDI). "
        "Todos os dados são processados e armazenados localmente — sem rate limits externos."
    ),
    exclude_tags=["Notícias", "Copilot", "Monitoramento ETL"],
)
mcp.mount()
# ── MCP Server ────────────────────────────────────────────────────────────────
mcp = FastApiMCP(
    app,
    name="Plataforma MCP Brasil",
    exclude_tags=["Notícias", "Copilot", "Monitoramento ETL"],
)
mcp.mount()