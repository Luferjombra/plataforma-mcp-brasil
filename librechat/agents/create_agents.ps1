# Criar os 3 agents do LibreChat via API
# Rodar no PowerShell: .\create_agents.ps1

$BASE = "https://librechat-rfev.onrender.com"
$EMAIL = "lufer.jom@gmail.com"
$SENHA = "SUA_NOVA_SENHA"   # <-- trocar apos redefinir a senha

# 1. Login
$login = Invoke-RestMethod -Uri "$BASE/api/auth/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email":"' + $EMAIL + '","password":"' + $SENHA + '"}'

$TOKEN = $login.token
Write-Host "Token obtido: $($TOKEN.Substring(0,20))..."

$headers = @{ Authorization = "Bearer $TOKEN"; "Content-Type" = "application/json" }

# 2. Agent: Analista Quant
$agentQuant = @{
  name         = "Analista Quant"
  description  = "Analista quantitativo especializado em mercado brasileiro"
  instructions = "Voce e um analista quantitativo especializado em mercado brasileiro. Sempre use as ferramentas MCP para buscar dados reais antes de analisar. Calcule Sharpe, Sortino, Drawdown quando relevante. Responda em portugues, seja preciso com numeros e datas."
  model        = "glm-4.7-flash"
  endpoint     = "GLM"
  tools        = @(@{type="function"; function=@{name="get_historico_rv_historico__ticker__get"}},
                   @{type="function"; function=@{name="get_indicadores_get"}},
                   @{type="function"; function=@{name="get_analytics_fundos_analytics__cnpj__get"}})
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri "$BASE/api/agents" -Method POST -Headers $headers -Body $agentQuant
Write-Host "Agent 'Analista Quant' criado."

# 3. Agent: Analista Macro
$agentMacro = @{
  name         = "Analista Macro"
  description  = "Economista especializado em macroeconomia brasileira"
  instructions = "Voce e um economista especializado em macroeconomia brasileira. Sempre use ferramentas MCP para buscar SELIC, IPCA, PIB atuais. Compare cenarios historicos. Responda em portugues com contexto macroeconomico claro para investidores nao-economistas."
  model        = "llama-3.3-70b-versatile"
  endpoint     = "Groq"
  tools        = @(@{type="function"; function=@{name="get_indicadores_get"}},
                   @{type="function"; function=@{name="get_series_disponiveis_indicadores_series_get"}})
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri "$BASE/api/agents" -Method POST -Headers $headers -Body $agentMacro
Write-Host "Agent 'Analista Macro' criado."

# 4. Agent: Analista RV
$agentRV = @{
  name         = "Analista RV"
  description  = "Analista de renda variavel focado em acoes brasileiras (B3)"
  instructions = "Voce e um analista de renda variavel focado em acoes brasileiras (B3). Sempre busque dados reais via ferramentas antes de opinar. Analise P/L, EV/EBITDA, ROE quando disponivel. Nunca de recomendacao de compra/venda sem dados concretos."
  model        = "llama-3.3-70b-versatile"
  endpoint     = "Groq"
  tools        = @(@{type="function"; function=@{name="get_historico_rv_historico__ticker__get"}},
                   @{type="function"; function=@{name="get_ativos_rv_ativos_get"}},
                   @{type="function"; function=@{name="search_search_get"}})
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri "$BASE/api/agents" -Method POST -Headers $headers -Body $agentRV
Write-Host "Agent 'Analista RV' criado."

Write-Host "`nPronto! Acesse $BASE e va em Agents para ver os 3 agents criados."
