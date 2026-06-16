/**
 * Smoke Test — verifica que todos os endpoints respondem 200 com 1 VU.
 * Rodar ANTES do load test para confirmar que o Render está aquecido.
 *
 * Uso:
 *   k6 run perf/smoke_test.js
 *   k6 run -e BASE_URL=http://localhost:8000 perf/smoke_test.js
 */
import http from 'k6/http'
import { check, sleep } from 'k6'
import { CONFIG } from './config.js'

export const options = {
  vus:      1,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate==0'],  // zero erros tolerados no smoke
  },
}

export default function () {
  const base = CONFIG.baseUrl
  const endpoints = [
    CONFIG.endpoints.health,
    CONFIG.endpoints.leve,
    CONFIG.endpoints.rf,
    CONFIG.endpoints.fundos,
    CONFIG.endpoints.medio,
    '/indicadores?serie=ipca&limit=5',
    '/rv/historico/PETR4?limit=10',
  ]

  for (const ep of endpoints) {
    const r = http.get(`${base}${ep}`, { timeout: '45s' })
    const ok = check(r, {
      [`${ep}: status 200`]: res => res.status === 200,
      [`${ep}: corpo não vazio`]: res => res.body && res.body.length > 2,
    })
    if (!ok) console.warn(`FALHA em ${ep} — status=${r.status}`)
    sleep(0.5)
  }
}
