// Configuração central do teste de performance
export const CONFIG = {
  baseUrl: __ENV.BASE_URL || 'https://plataforma-mcp-brasil-api.onrender.com',

  thresholds: {
    http_req_duration: ['p(95)<3000'],  // p95 abaixo de 3s
    http_req_failed:   ['rate<0.05'],   // taxa de erro abaixo de 5%
  },

  endpoints: {
    health:    '/',
    leve:      '/rv/ativos',
    medio:     '/indicadores?serie=selic&limit=252',
    pesado:    '/rv/historico/PETR4?limit=504',
    rf:        '/rf/titulos',
    fundos:    '/fundos',
    fundosHist: '/fundos/historico/04.222.368%2F0001-55?limit=504',
  },
}
