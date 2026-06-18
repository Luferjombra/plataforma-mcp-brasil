from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi_mcp import FastApiMCP
from routes import indicadores, rv, fundos, noticias, copilot, rf, health, search, carteira

app = FastAPI(
    title="Plataforma MCP Brasil API",
    description="API financeira analitica com dados historicos do Brasil v2",
    version="0.1.0",
)

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

app.add_middleware(SecurityHeadersMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://plataforma-mcp-brasil.vercel.app",
        "http://localhost:3000",
    ],
    allow_origin_regex=r"https://plataforma-mcp-brasil.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(indicadores.router, prefix="/indicadores", tags=["Indicadores"])
app.include_router(rv.router, prefix="/rv", tags=["Renda Variavel"])
app.include_router(fundos.router, prefix="/fundos", tags=["Fundos"])
app.include_router(noticias.router, prefix="/noticias", tags=["Noticias"])
app.include_router(copilot.router, prefix="/copilot", tags=["Copilot"])
app.include_router(rf.router, prefix="/rf", tags=["Renda Fixa"])
app.include_router(health.router, prefix="/health/etl", tags=["Monitoramento ETL"])
app.include_router(search.router, prefix="/search", tags=["Busca"])
app.include_router(carteira.router, prefix="/carteira", tags=["Carteira"])


@app.get("/")
def health_check():
    return {"status": "ok", "version": "0.1.0"}


mcp = FastApiMCP(
    app,
    name="Plataforma MCP Brasil",
    description="Dados financeiros historicos do Brasil.",
    exclude_tags=["Noticias", "Copilot", "Monitoramento ETL"],
)
mcp.mount_http()  # Streamable HTTP em /mcp (MCP spec 2024-11-05+)
mcp.mount_sse()   # SSE em /sse (fallback para clientes mais antigos)
