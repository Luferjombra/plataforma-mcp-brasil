# Criar os 3 agents do LibreChat via API
# Uso: definir as env vars abaixo antes de rodar (nao hardcodar credenciais aqui).
#   $env:LIBRECHAT_SERVICE_EMAIL = "..."
#   $env:LIBRECHAT_SERVICE_SENHA = "..."
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass; .\librechat\agents\create_agents.ps1

$BASE  = "https://librechat-rfev.onrender.com"
$EMAIL = $env:LIBRECHAT_SERVICE_EMAIL
$SENHA = $env:LIBRECHAT_SERVICE_SENHA

if (-not $EMAIL -or -not $SENHA) {
  Write-Host "ERRO: defina LIBRECHAT_SERVICE_EMAIL e LIBRECHAT_SERVICE_SENHA como variaveis de ambiente antes de rodar."
  exit 1
}

$ErrorActionPreference = "Stop"

# 1. Login
Write-Host "Fazendo login..."
$loginBody = @{ email = $EMAIL; password = $SENHA } | ConvertTo-Json
$login = Invoke-RestMethod -Uri "$BASE/api/auth/login" -Method POST `
  -ContentType "application/json" -Body $loginBody

$TOKEN = $login.token
if (-not $TOKEN) { Write-Host "ERRO: login falhou. Verifique email/senha."; exit 1 }
Write-Host "Login OK. Token obtido."

$headers = @{ Authorization = "Bearer $TOKEN"; "Content-Type" = "application/json" }

# 2. Analista Quant
Write-Host "Criando Agent: Analista Quant..."
$body = @{
  name         = "Analista Quant"
  description  = "Analista quantitativo especializado em mercado brasileiro"
  instructions = "Voce e um analista quantitativo especializado em mercado brasileiro. Sempre use as ferramentas MCP para buscar dados reais antes de analisar. Calcule Sharpe, Sortino, Drawdown quando relevante. Responda em portugues, seja preciso com numeros e datas."
  model        = "glm-4.7-flash"
  endpoint     = "GLM"
} | ConvertTo-Json -Depth 3
Invoke-RestMethod -Uri "$BASE/api/agents" -Method POST -Headers $headers -Body $body | Out-Null
Write-Host "Agent 'Analista Quant' criado com sucesso."

# 3. Analista Macro
Write-Host "Criando Agent: Analista Macro..."
$body = @{
  name         = "Analista Macro"
  description  = "Economista especializado em macroeconomia brasileira"
  instructions = "Voce e um economista especializado em macroeconomia brasileira. Sempre use ferramentas MCP para buscar SELIC, IPCA, PIB atuais. Compare cenarios historicos. Responda em portugues com contexto macroeconomico claro para investidores nao-economistas."
  model        = "llama-3.3-70b-versatile"
  endpoint     = "Groq"
} | ConvertTo-Json -Depth 3
Invoke-RestMethod -Uri "$BASE/api/agents" -Method POST -Headers $headers -Body $body | Out-Null
Write-Host "Agent 'Analista Macro' criado com sucesso."

# 4. Analista RV
Write-Host "Criando Agent: Analista RV..."
$body = @{
  name         = "Analista RV"
  description  = "Analista de renda variavel focado em acoes brasileiras B3"
  instructions = "Voce e um analista de renda variavel focado em acoes brasileiras (B3). Sempre busque dados reais via ferramentas antes de opinar. Analise P/L, EV/EBITDA, ROE quando disponivel. Nunca de recomendacao de compra/venda sem dados concretos."
  model        = "llama-3.3-70b-versatile"
  endpoint     = "Groq"
} | ConvertTo-Json -Depth 3
Invoke-RestMethod -Uri "$BASE/api/agents" -Method POST -Headers $headers -Body $body | Out-Null
Write-Host "Agent 'Analista RV' criado com sucesso."

Write-Host "`nPronto! Acesse $BASE e va em Agents para ver os 3 agents criados."
