/**
 * Load Test — ramping VUs para mapear o limite da aplicação.
 *
 * Fases:
 *   0 → 10 VUs  (2min)  baseline
 *   10 → 30 VUs (3min)  carga normal
 *   30 → 60 VUs (3min)  pressão
 *   60 → 100VUs (3min)  estresse
 *   100 → 0    (1min)   recuperação
 *
 * Uso:
 *   k6 run perf/load_test.js
 *   k6 run --out json=perf/resultado.json perf/load_test.js
 *   k6 run -e BASE_URL=http://localhost:8000 perf/load_test.js
 */
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'
import { CONFIG } from './config.js'

// Métricas customizadas por categoria de endpoint
const erroRate   = new Rate('taxa_erro')
const latLeve    = new Trend('lat_leve_ms',   true)
const latMedio   = new Trend('lat_medio_ms',  true)
const latPesado  = new Trend('lat_pesado_ms', true)
const latFundos  = new Trend('lat_fundos_ms', true)

export const options = {
  thresholds: {
    ...CONFIG.thresholds,
    lat_pesado_ms: ['p(95)<5000'],  // endpoint pesado tem margem maior
    lat_fundos_ms: ['p(95)<6000'],  // fundos é o endpoint mais caro
  },
  stages: [
    { duration: '2m', target: 10  },  // baseline — tudo deve ser verde
    { duration: '3m', target: 30  },  // carga normal de uso
    { duration: '3m', target: 60  },  // pressão — p95 começa a subir
    { duration: '3m', target: 100 },  // estresse — ponto de ruptura
    { duration: '1m', target: 0   },  // recuperação
  ],
}

export default function () {
  const base = CONFIG.baseUrl

  // ── 1. Endpoint leve (100% dos VUs — sempre executa) ──────────────────────
  const t0 = Date.now()
  const r1 = http.get(`${base}${CONFIG.endpoints.leve}`, { timeout: '30s' })
  latLeve.add(Date.now() - t0)
  const ok1 = check(r1, { 'leve: 200': r => r.status === 200 })
  erroRate.add(!ok1)

  // ── 2. Endpoint médio (70% dos VUs) ───────────────────────────────────────
  if (Math.random() < 0.7) {
    const t = Date.now()
    const r2 = http.get(`${base}${CONFIG.endpoints.medio}`, { timeout: '30s' })
    latMedio.add(Date.now() - t)
    const ok2 = check(r2, { 'medio: 200': r => r.status === 200 })
    erroRate.add(!ok2)
  }

  // ── 3. Endpoint pesado — historico RV 504 pontos (40% dos VUs) ───────────
  if (Math.random() < 0.4) {
    const t = Date.now()
    const r3 = http.get(`${base}${CONFIG.endpoints.pesado}`, { timeout: '45s' })
    latPesado.add(Date.now() - t)
    const ok3 = check(r3, {
      'pesado: 200':       r => r.status === 200,
      'pesado: tem data':  r => r.json('data') && r.json('data').length > 0,
    })
    erroRate.add(!ok3)
  }

  // ── 4. Endpoint fundos historico (20% dos VUs — mais caro) ───────────────
  if (Math.random() < 0.2) {
    const t = Date.now()
    const r4 = http.get(`${base}${CONFIG.endpoints.fundosHist}`, { timeout: '60s' })
    latFundos.add(Date.now() - t)
    const ok4 = check(r4, { 'fundos: 200': r => r.status === 200 })
    erroRate.add(!ok4)
  }

  // Pausa realista entre requests do mesmo usuário (1s ± 0.5s)
  sleep(0.5 + Math.random())
}
