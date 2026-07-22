# Anexa as ferramentas de pesquisa web (Bright Data MCP) aos 3 agents existentes.
# Rodar SOMENTE depois de:
#   1. Fazer commit/push de librechat.yaml com a entrada mcpServers.bright-data
#   2. Configurar BRIGHTDATA_API_TOKEN no .env do LibreChat (Render)
#   3. Reiniciar o serviço "librechat" no Render (o container so relê o yaml montado no boot)
#
# Uso: definir as env vars abaixo antes de rodar (não hardcodar credenciais aqui).
#   $env:LIBRECHAT_SERVICE_EMAIL = "..."
#   $env:LIBRECHAT_SERVICE_SENHA = "..."
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass; .\librechat\agents\attach_bright_data_tool.ps1

$BASE = "https://librechat-rfev.onrender.com"
$EMAIL = $env:LIBRECHAT_SERVICE_EMAIL
$SENHA = $env:LIBRECHAT_SERVICE_SENHA

if (-not $EMAIL -or -not $SENHA) {
  Write-Host "ERRO: defina LIBRECHAT_SERVICE_EMAIL e LIBRECHAT_SERVICE_SENHA como variaveis de ambiente antes de rodar."
  exit 1
}

$ErrorActionPreference = "Stop"

# Nomenclatura de tool MCP no LibreChat: "<tool>_mcp_<nome-do-server>"
$FERRAMENTAS_WEB = @("search_engine_mcp_bright-data", "scrape_as_markdown_mcp_bright-data")

Write-Host "Fazendo login..."
$loginBody = @{ email = $EMAIL; password = $SENHA } | ConvertTo-Json
$login = Invoke-RestMethod -Uri "$BASE/api/auth/login" -Method POST `
  -ContentType "application/json" -Body $loginBody
$TOKEN = $login.token
if (-not $TOKEN) { Write-Host "ERRO: login falhou."; exit 1 }
$headers = @{ Authorization = "Bearer $TOKEN"; "Content-Type" = "application/json" }

Write-Host "Listando agents..."
$agents = Invoke-RestMethod -Uri "$BASE/api/agents?limit=100" -Method GET -Headers $headers

foreach ($agent in $agents.data) {
  Write-Host "Buscando detalhes de '$($agent.name)' ($($agent.id))..."
  $detalhe = Invoke-RestMethod -Uri "$BASE/api/agents/$($agent.id)" -Method GET -Headers $headers

  $toolsAtuais = @()
  if ($detalhe.tools) { $toolsAtuais = $detalhe.tools }
  $novasTools = @($toolsAtuais + $FERRAMENTAS_WEB | Select-Object -Unique)

  Write-Host "Atualizando '$($agent.name)' com ferramentas de pesquisa web..."
  $body = @{ tools = $novasTools } | ConvertTo-Json
  Invoke-RestMethod -Uri "$BASE/api/agents/$($agent.id)" -Method PATCH -Headers $headers -Body $body | Out-Null
  Write-Host "OK: $($agent.name) -> $($novasTools -join ', ')"
}

Write-Host "`nPronto! Os 3 agents agora tem acesso a pesquisa na web via Bright Data."
