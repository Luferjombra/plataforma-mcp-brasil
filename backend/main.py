from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import indicadores, rv, fundos, noticias, copilot, rf

app = FastAPI(
    title="Plataforma MCP Brasil API",
    description="API financeira analítica com dados históricos do Brasil",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # restringir em produção
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


@app.get("/")
def health_check():
    return {"status": "ok", "version": "0.1.0"}
