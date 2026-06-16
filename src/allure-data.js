// allure-data.js — data layer for the cross-project Allure overview dashboard.
// LIVE by default against allure-docker-service via the nginx same-origin proxy
// (CONFIG.API_BASE = '/allure'). Set CONFIG.MOCK = true for local dev without a backend.
// No secrets in code — auth (if any) is handled by the reverse proxy / SSO.

export const CONFIG = {
  API_BASE: '/allure',                       // relative -> nginx proxies to allure-docker-service (no CORS)
  HULY_BASE: 'https://do.nbfi.ru',           // self-hosted task tracker (href base only)
  GITLAB_BASE: 'https://gitlab.nbfi.ru',     // CI pipeline links
  AUTO_REFRESH_MS: 5 * 60 * 1000,            // 5 minutes
  PASS_THRESHOLD: 90,                        // default alert threshold (%)
  TREND_POINTS: 14,
  MOCK: false,                               // live (set true for local dev without a backend)
};

// ---- helpers ---------------------------------------------------------------

export function fmtDuration(ms) {
  if (ms == null) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60), rs = s % 60;
  if (m < 60) return m + 'm ' + String(rs).padStart(2, '0') + 's';
  const h = Math.floor(m / 60), rm = m % 60;
  return h + 'h ' + String(rm).padStart(2, '0') + 'm';
}

export function fmtAgo(ts, now) {
  now = now || Date.now();
  const diff = Math.max(0, now - ts);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  const d = Math.floor(h / 24);
  return d + 'd ago';
}

export function fmtClock(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

export function healthOf(passRate, lastRunFailed) {
  if (lastRunFailed || passRate < 70) return 'red';
  if (passRate < 90) return 'amber';
  return 'green';
}

// deterministic PRNG so the mock is stable across refreshes
function seeded(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const DAY = 86400000;

function buildTrend(p) {
  const rnd = seeded(p.seed);
  const N = CONFIG.TREND_POINTS;
  const now = Date.now();
  const out = [];
  for (let i = 0; i < N; i++) {
    const t = N === 1 ? 1 : i / (N - 1);
    let pr = p.startRate + (p.endRate - p.startRate) * t;
    pr += (rnd() - 0.5) * 2 * (p.noise || 0);            // flapping
    pr = Math.max(0.32, Math.min(0.998, pr));
    const total = Math.max(8, Math.round(p.total + (rnd() - 0.5) * (p.totalJitter || 0)));
    const failFrac = 1 - pr;
    let broken = Math.round(total * failFrac * (p.brokenShare ?? 0.22));
    let skipped = Math.round(total * (p.skipRate ?? 0.02) * (0.4 + rnd()));
    let failed = Math.max(0, Math.round(total * failFrac) - broken);
    let passed = total - failed - broken - skipped;
    if (passed < 0) { passed = 0; }
    // last build of the degrading project errored out entirely
    if (p.lastRunFailed && i === N - 1) {
      failed += broken; broken = Math.round(broken * 0.6);
    }
    const duration = Math.round(p.durBase * (1 + (p.durDrift || 0) * t + (rnd() - 0.5) * 0.18) * 1000);
    const buildOrder = p.startBuild + i;
    const ts = now - (N - 1 - i) * (DAY * 0.5) - Math.round(rnd() * 3 * 3600000);
    out.push({
      buildOrder,
      reportUrl: `${CONFIG.API_BASE}/projects/${p.id}/reports/${buildOrder}/index.html`,
      passed, failed, broken, skipped, total,
      duration, ts,
      passRate: total ? (passed / total) * 100 : 0,
    });
  }
  return out;
}

function normalize(p) {
  const trend = buildTrend(p);
  const last = trend[trend.length - 1];
  const passRate = last.passRate;
  const health = healthOf(passRate, p.lastRunFailed);
  return {
    id: p.id,
    name: p.name,
    domain: p.domain,
    reportName: p.name,
    statistic: {
      passed: last.passed, failed: last.failed, broken: last.broken,
      skipped: last.skipped, unknown: 0, total: last.total,
    },
    time: { start: last.ts, stop: last.ts + last.duration, duration: last.duration },
    passRate,
    health,
    lastRunFailed: !!p.lastRunFailed,
    flaky: p.flaky,
    trend,
    latestReportUrl: `${CONFIG.API_BASE}/projects/${p.id}/reports/latest/index.html`,
    reports: trend.slice().reverse().map((b) => ({ n: b.buildOrder, url: b.reportUrl, ts: b.ts, passRate: b.passRate })),
    ci: {
      pipelineUrl: `${CONFIG.GITLAB_BASE}/${p.gitlab}/-/pipelines`,
      lastPipelineUrl: `${CONFIG.GITLAB_BASE}/${p.gitlab}/-/pipelines/${p.pipelineId}`,
      branch: p.branch || 'main',
    },
    defects: p.defects,
    lowPerforming: p.lowPerforming,
  };
}

// ---- mock profiles ---------------------------------------------------------

const PROFILES = [
  {
    id: 'energy-app-native', name: 'energy-app-native', domain: 'Mobile · E2E',
    seed: 7, startRate: 0.93, endRate: 0.955, noise: 0.012, total: 124, totalJitter: 6,
    brokenShare: 0.18, skipRate: 0.015, durBase: 642, durDrift: 0.05, flaky: 2,
    startBuild: 198, gitlab: 'mobile/energy-app-native', pipelineId: 84021, branch: 'release/3.4',
    defects: [
      { name: 'Network timeouts', count: 3, type: 'product' },
      { name: 'Flaky animation waits', count: 2, type: 'test' },
      { name: 'Deep-link routing', count: 1, type: 'product' },
    ],
    lowPerforming: [
      { name: 'meter.sync.background_refresh', successRate: 71, duration: 38400, runs: 14 },
      { name: 'onboarding.biometric_login', successRate: 79, duration: 12100, runs: 14 },
      { name: 'tariff.switch_plan_flow', successRate: 86, duration: 21800, runs: 14 },
    ],
  },
  {
    id: 'qa-monorepo', name: 'qa-monorepo', domain: 'Backend · Integration',
    seed: 23, startRate: 0.86, endRate: 0.82, noise: 0.06, total: 486, totalJitter: 22,
    brokenShare: 0.3, skipRate: 0.04, durBase: 1880, durDrift: 0.12, flaky: 17,
    startBuild: 1042, gitlab: 'platform/qa-monorepo', pipelineId: 192774, branch: 'main',
    defects: [
      { name: 'DB deadlocks', count: 14, type: 'product' },
      { name: 'Test data races', count: 11, type: 'test' },
      { name: 'Kafka rebalancing', count: 8, type: 'product' },
      { name: 'Fixture teardown', count: 6, type: 'test' },
      { name: 'Auth token expiry', count: 4, type: 'product' },
    ],
    lowPerforming: [
      { name: 'billing.invoice.bulk_recalc', successRate: 54, duration: 96200, runs: 14 },
      { name: 'orders.saga.compensation', successRate: 61, duration: 71500, runs: 14 },
      { name: 'search.reindex_consistency', successRate: 66, duration: 58300, runs: 14 },
      { name: 'notifications.fanout_throttle', successRate: 73, duration: 40100, runs: 14 },
    ],
  },
  {
    id: 'auth_http', name: 'auth_http', domain: 'Service · API',
    seed: 41, startRate: 0.955, endRate: 0.972, noise: 0.008, total: 38, totalJitter: 3,
    brokenShare: 0.15, skipRate: 0.01, durBase: 96, durDrift: 0.0, flaky: 0,
    startBuild: 560, gitlab: 'identity/auth-http', pipelineId: 77310, branch: 'main',
    defects: [
      { name: 'JWT clock skew', count: 1, type: 'product' },
    ],
    lowPerforming: [
      { name: 'refresh_token.rotation_race', successRate: 88, duration: 4200, runs: 14 },
      { name: 'oauth.pkce_challenge', successRate: 93, duration: 2600, runs: 14 },
    ],
  },
  {
    id: 'http_amqp_proxy', name: 'http_amqp_proxy', domain: 'Service · Bridge',
    seed: 88, startRate: 0.91, endRate: 0.56, noise: 0.03, total: 64, totalJitter: 5,
    brokenShare: 0.35, skipRate: 0.02, durBase: 158, durDrift: 0.35, flaky: 6,
    startBuild: 311, gitlab: 'integration/http-amqp-proxy', pipelineId: 110982, branch: 'main',
    lastRunFailed: true,
    defects: [
      { name: 'Connection pool exhausted', count: 9, type: 'product' },
      { name: 'Message ack timeout', count: 7, type: 'product' },
      { name: 'Reconnect backoff', count: 4, type: 'product' },
      { name: 'Contract drift', count: 3, type: 'test' },
    ],
    lowPerforming: [
      { name: 'proxy.qos.prefetch_limit', successRate: 41, duration: 28400, runs: 14 },
      { name: 'proxy.dlx.routing', successRate: 47, duration: 19200, runs: 14 },
      { name: 'proxy.tls.handshake_retry', successRate: 58, duration: 11600, runs: 14 },
    ],
  },
  {
    id: 'supportservice', name: 'supportservice', domain: 'Service · CRM',
    seed: 134, startRate: 0.83, endRate: 0.81, noise: 0.075, total: 97, totalJitter: 9,
    brokenShare: 0.42, skipRate: 0.05, durBase: 412, durDrift: 0.08, flaky: 13,
    startBuild: 705, gitlab: 'crm/supportservice', pipelineId: 145620, branch: 'develop',
    defects: [
      { name: 'Flaky UI selectors', count: 9, type: 'test' },
      { name: 'Ticket SLA timer', count: 5, type: 'product' },
      { name: 'Attachment upload', count: 4, type: 'product' },
      { name: 'Email parser', count: 3, type: 'test' },
    ],
    lowPerforming: [
      { name: 'ticket.escalation_matrix', successRate: 63, duration: 33700, runs: 14 },
      { name: 'chat.handoff_to_agent', successRate: 69, duration: 24900, runs: 14 },
      { name: 'kb.search_relevance', successRate: 74, duration: 18200, runs: 14 },
    ],
  },
  {
    id: 'payments-core', name: 'payments-core', domain: 'Service · Core',
    seed: 202, startRate: 0.9, endRate: 0.915, noise: 0.02, total: 213, totalJitter: 11,
    brokenShare: 0.2, skipRate: 0.02, durBase: 904, durDrift: 0.04, flaky: 4,
    startBuild: 2208, gitlab: 'fintech/payments-core', pipelineId: 301455, branch: 'main',
    defects: [
      { name: '3DS callback', count: 4, type: 'product' },
      { name: 'Idempotency keys', count: 3, type: 'product' },
      { name: 'Currency rounding', count: 2, type: 'test' },
    ],
    lowPerforming: [
      { name: 'settlement.batch_close', successRate: 78, duration: 64300, runs: 14 },
      { name: 'refund.partial_chargeback', successRate: 82, duration: 41100, runs: 14 },
      { name: 'ledger.double_entry_balance', successRate: 87, duration: 29800, runs: 14 },
    ],
  },
];

// ---- public API ------------------------------------------------------------

export async function fetchProjects() {
  if (CONFIG.MOCK) {
    // simulate a little network latency so the refresh affordance is visible
    await new Promise((r) => setTimeout(r, 280));
    return PROFILES.map(normalize);
  }

  // ---- LIVE MODE (allure-docker-service) ----
  // Same-origin via nginx: CONFIG.API_BASE = '/allure' -> allure-docker-service.
  //   list:       GET {base}/projects -> { data: { projects: { <id>: {} } } }
  //   summary:    GET {base}/projects/<id>/reports/latest/widgets/summary.json
  //   trend:      GET {base}/projects/<id>/reports/latest/widgets/history-trend.json
  //   categories: GET {base}/projects/<id>/reports/latest/widgets/categories.json
  const base = CONFIG.API_BASE;
  const list = await fetch(`${base}/projects`).then((r) => r.json());
  const ids = Object.keys(list?.data?.projects || {});

  return Promise.all(ids.map(async (id) => {
    const rep = `${base}/projects/${id}/reports/latest`;
    const [summary, trendRaw, categories] = await Promise.all([
      fetch(`${rep}/widgets/summary.json`).then((r) => r.json()),
      fetch(`${rep}/widgets/history-trend.json`).then((r) => r.json()).catch(() => []),
      fetch(`${rep}/widgets/categories.json`).then((r) => r.json()).catch(() => []),
    ]);

    const st = summary.statistic || {};

    // allure-docker-service returns history-trend NEWEST-first; charts and `last`
    // expect chronological order -> reverse, then keep the most recent N.
    // reportUrl from the API is relative (../<N>/index.html) -> build an absolute one.
    const projUrl = `${base}/projects/${id}`;
    const trend = (trendRaw || []).slice().reverse().slice(-CONFIG.TREND_POINTS).map((b) => ({
      buildOrder: b.buildOrder,
      reportUrl: `${projUrl}/reports/${b.buildOrder}/index.html`,
      passed: b.data?.passed || 0, failed: b.data?.failed || 0,
      broken: b.data?.broken || 0, skipped: b.data?.skipped || 0,
      total: b.data?.total || 0,
      duration: null, ts: null,           // not in history-trend.json — see HANDOFF note
      passRate: b.data?.total ? (b.data.passed / b.data.total) * 100 : 0,
    }));

    const passRate = st.total ? (st.passed / st.total) * 100 : 0;
    const last = trend[trend.length - 1];
    const lastRunFailed = last ? (last.passed === 0 && last.total > 0) : false;

    // categories.json is { total, items: [...] } on current allure-docker-service
    // (older versions return a bare array) — handle both.
    const catItems = Array.isArray(categories) ? categories : (categories?.items || []);
    const defects = catItems.map((c) => ({
      name: c.name,
      count: c.statistic ? (c.statistic.total || 0) : (c.children?.length ?? 0),
      type: /flaky|test|fixture|selector/i.test(c.name) ? 'test' : 'product',
    })).sort((a, b) => b.count - a.count).slice(0, 6);

    return {
      id, name: summary.reportName || id, domain: '', reportName: summary.reportName || id,
      statistic: st, time: summary.time || {}, passRate,
      health: healthOf(passRate, lastRunFailed), lastRunFailed,
      flaky: 0,
      trend,
      latestReportUrl: `${rep}/index.html`,
      reports: trend.slice().reverse().map((b) => ({ n: b.buildOrder, url: b.reportUrl, ts: b.ts, passRate: b.passRate })),
      ci: {
        pipelineUrl: `${CONFIG.GITLAB_BASE}/${id}/-/pipelines`,
        lastPipelineUrl: `${CONFIG.GITLAB_BASE}/${id}/-/pipelines`,
        branch: 'main',
      },
      defects,
      lowPerforming: [],
    };
  }));
}
