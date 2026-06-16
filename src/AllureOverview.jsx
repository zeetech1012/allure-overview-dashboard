import React from 'react'
import * as allureData from './allure-data.js'

// Cross-project Allure 3 health overview.
// Ported 1:1 from the Claude Design prototype ("Allure Overview.dc.html"):
// the DCLogic base class + <x-dc> template become a React class component,
// every palette / chart / enrich / style value is preserved verbatim.
export default class AllureOverview extends React.Component {
  constructor(props) {
    super(props)
    this.lib = allureData
    this.CONFIG = allureData.CONFIG
    this.state = {
      projects: [], loading: true, refreshing: false, error: null,
      lastUpdated: null, nowTick: Date.now(),
      systemDark: true,
      theme: undefined, view: undefined, cardStyle: undefined, threshold: undefined,
      density: 'comfortable',
      search: '', onlyBad: false, sortField: 'health', sortDir: 'desc',
      expandedId: null,
      autoRefresh: true,
      hulyToast: { show: false },
    }
  }

  componentDidMount() {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    this.setState({ systemDark: mq.matches })
    this._mq = mq
    this._mqHandler = (e) => this.setState({ systemDark: e.matches })
    try { mq.addEventListener('change', this._mqHandler) } catch (_) { mq.addListener(this._mqHandler) }

    this.load()
    this._tick = setInterval(() => this.setState({ nowTick: Date.now() }), 30000)
    this._auto = setInterval(() => { if (this.state.autoRefresh) this.load() }, 5 * 60 * 1000)
  }
  componentWillUnmount() {
    clearInterval(this._tick); clearInterval(this._auto)
    if (this._toastT) clearTimeout(this._toastT)
    if (this._mq && this._mqHandler) {
      try { this._mq.removeEventListener('change', this._mqHandler) } catch (_) { this._mq.removeListener(this._mqHandler) }
    }
  }

  async load() {
    this.setState({ refreshing: true })
    try {
      const projects = await this.lib.fetchProjects()
      this.setState({ projects, loading: false, refreshing: false, lastUpdated: Date.now(), nowTick: Date.now() })
    } catch (e) {
      this.setState({ loading: false, refreshing: false, error: String(e) })
    }
  }

  // ---- formatting ----
  fmtDur(ms) {
    if (ms == null) return '—'
    const s = Math.round(ms / 1000)
    if (s < 60) return s + 's'
    const m = Math.floor(s / 60), rs = s % 60
    if (m < 60) return m + 'm ' + String(rs).padStart(2, '0') + 's'
    const h = Math.floor(m / 60), rm = m % 60
    return h + 'h ' + String(rm).padStart(2, '0') + 'm'
  }
  fmtAgo(ts, now) {
    const diff = Math.max(0, (now || Date.now()) - ts)
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'just now'
    if (m < 60) return m + ' min ago'
    const h = Math.floor(m / 60)
    if (h < 24) return h + 'h ago'
    return Math.floor(h / 24) + 'd ago'
  }
  fmtClock(ts) {
    const d = new Date(ts), pad = (n) => String(n).padStart(2, '0')
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
  }
  nf(n) { return (n || 0).toLocaleString('en-US') }

  // ---- palette ----
  palette(dark, accent) {
    const A = accent || '#2f81f7'
    if (dark) {
      return {
        accent: A, dark: true,
        bg: '#0c1016', shell: 'transparent',
        panel: '#141a22', card: '#161d27', cardHover: '#1b2330', cardBorder: '#252e3b',
        soft: '#0f151d', track: '#222b38',
        text: '#e6edf3', textDim: '#9aa7b6', textFaint: '#697585',
        passed: '#7bc862', failed: '#fd5a3e', broken: '#ffce4d', skipped: '#8b97a6', unknown: '#d35ebe',
        green: '#5fb96a', amber: '#e8a13a', red: '#e5484d',
        greenSoft: 'rgba(95,185,106,0.16)', amberSoft: 'rgba(232,161,58,0.16)', redSoft: 'rgba(229,72,77,0.16)',
        sparkFillP: 'rgba(123,200,98,0.16)', sparkFillA: 'rgba(255,206,77,0.16)', sparkFillR: 'rgba(253,90,62,0.16)',
        accentSoft: 'rgba(47,129,247,0.16)',
      }
    }
    return {
      accent: A, dark: false,
      bg: '#eef1f6', shell: 'transparent',
      panel: '#ffffff', card: '#ffffff', cardHover: '#fafbfd', cardBorder: '#e2e7ef',
      soft: '#f5f7fa', track: '#eaeef3',
      text: '#16202e', textDim: '#5a6678', textFaint: '#8a94a4',
      passed: '#62b94f', failed: '#e8442b', broken: '#e9a82a', skipped: '#9aa6b5', unknown: '#c44fb0',
      green: '#3aa353', amber: '#cf8b1e', red: '#d83a3f',
      greenSoft: 'rgba(58,163,83,0.12)', amberSoft: 'rgba(207,139,30,0.14)', redSoft: 'rgba(216,58,63,0.12)',
      sparkFillP: 'rgba(98,185,79,0.16)', sparkFillA: 'rgba(233,168,42,0.18)', sparkFillR: 'rgba(232,68,43,0.16)',
      accentSoft: 'rgba(47,111,237,0.10)',
    }
  }

  // ---- charts ----
  sparkEl(trend, C, health) {
    const h = React.createElement
    const W = 132, H = 36, pad = 3
    const rates = trend.map((b) => b.passRate)
    const lo = Math.max(0, Math.min(...rates) - 4), hi = Math.min(100, Math.max(...rates) + 4)
    const span = Math.max(1, hi - lo)
    const n = trend.length
    const x = (i) => pad + (W - 2 * pad) * (n <= 1 ? 0 : i / (n - 1))
    const y = (v) => pad + (H - 2 * pad) * (1 - (v - lo) / span)
    const pts = trend.map((b, i) => `${x(i).toFixed(1)},${y(b.passRate).toFixed(1)}`).join(' ')
    const area = `${pad},${H - pad} ${pts} ${(W - pad)},${H - pad}`
    const line = health === 'red' ? C.failed : health === 'amber' ? C.broken : C.passed
    const fill = health === 'red' ? C.sparkFillR : health === 'amber' ? C.sparkFillA : C.sparkFillP
    const dots = []
    trend.forEach((b, i) => {
      if (i > 0 && b.failed > trend[i - 1].failed) {
        dots.push(h('circle', { key: 'd' + i, cx: x(i), cy: y(b.passRate), r: 2.4, fill: C.failed, stroke: C.card, strokeWidth: 1 }))
      }
    })
    return h('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, preserveAspectRatio: 'none', style: { display: 'block', overflow: 'visible' } },
      h('polygon', { points: area, fill }),
      h('polyline', { points: pts, fill: 'none', stroke: line, strokeWidth: 1.8, strokeLinejoin: 'round', strokeLinecap: 'round' }),
      ...dots)
  }

  stackedAreaEl(trend, C, dims) {
    const h = React.createElement
    const W = dims.W, H = dims.H, padT = dims.padT || 10, padB = dims.padB || 2
    const n = trend.length
    const maxTotal = Math.max(1, ...trend.map((b) => b.total))
    const x = (i) => (n <= 1 ? 0 : W * (i / (n - 1)))
    const y = (v) => padT + (H - padT - padB) * (1 - v / maxTotal)
    const series = [
      { key: 'passed', color: C.passed, op: 0.9 },
      { key: 'broken', color: C.broken, op: 0.9 },
      { key: 'failed', color: C.failed, op: 0.92 },
      { key: 'skipped', color: C.skipped, op: 0.55 },
    ]
    let prev = trend.map(() => 0)
    const polys = []
    for (const s of series) {
      const top = trend.map((b, i) => prev[i] + (b[s.key] || 0))
      const pp = []
      for (let i = 0; i < n; i++) pp.push(`${x(i).toFixed(1)},${y(top[i]).toFixed(1)}`)
      for (let i = n - 1; i >= 0; i--) pp.push(`${x(i).toFixed(1)},${y(prev[i]).toFixed(1)}`)
      polys.push(h('polygon', { key: s.key, points: pp.join(' '), fill: s.color, fillOpacity: s.op }))
      prev = top
    }
    return h('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, preserveAspectRatio: 'none', style: { display: 'block' } }, ...polys)
  }

  durationEl(trend, C, dims) {
    const h = React.createElement
    const W = dims.W, H = dims.H, padT = 8, padB = 2
    const n = trend.length
    const vals = trend.map((b) => b.duration || 0)
    const maxV = Math.max(1, ...vals)
    const x = (i) => (n <= 1 ? 0 : W * (i / (n - 1)))
    const y = (v) => padT + (H - padT - padB) * (1 - v / maxV)
    const pts = trend.map((b, i) => `${x(i).toFixed(1)},${y(b.duration).toFixed(1)}`).join(' ')
    const area = `0,${H - padB} ${pts} ${W},${H - padB}`
    return h('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, preserveAspectRatio: 'none', style: { display: 'block' } },
      h('polygon', { points: area, fill: C.accentSoft }),
      h('polyline', { points: pts, fill: 'none', stroke: C.accent, strokeWidth: 1.8, strokeLinejoin: 'round', strokeLinecap: 'round' }))
  }

  donutGradient(s, C) {
    const total = s.total || 1
    const segs = [['passed', C.passed], ['failed', C.failed], ['broken', C.broken], ['skipped', C.skipped]]
    let acc = 0; const parts = []
    for (const [k, col] of segs) {
      const frac = (s[k] || 0) / total
      if (frac <= 0) continue
      const a = (acc * 360).toFixed(2), b = ((acc + frac) * 360).toFixed(2)
      parts.push(`${col} ${a}deg ${b}deg`); acc += frac
    }
    if (!parts.length) parts.push(`${C.skipped} 0deg 360deg`)
    return `conic-gradient(${parts.join(',')})`
  }

  // ---- enrich a project ----
  enrich(p, C, now, threshold, cardStyle, density, expanded) {
    const healthColor = p.health === 'red' ? C.red : p.health === 'amber' ? C.amber : C.green
    const healthSoft = p.health === 'red' ? C.redSoft : p.health === 'amber' ? C.amberSoft : C.greenSoft
    const pct = Math.round(p.passRate)
    const below = p.passRate < threshold
    const compact = cardStyle === 'compact'
    const donutLed = cardStyle === 'donut'
    const dens = density === 'compact'

    const card = {
      ...p, pct, healthColor,
      healthLabel: p.health === 'red' ? 'AT RISK' : p.health === 'amber' ? 'UNSTABLE' : 'HEALTHY',
      startClock: this.fmtClock(p.time.start),
      durText: this.fmtDur(p.time.duration),
      agoText: this.fmtAgo(p.time.start, now),
      showDonut: !compact,
      showBar: compact,
      sparkEl: this.sparkEl(p.trend, C, p.health),
      statusDotStyle: { width: 11, height: 11, borderRadius: '50%', background: healthColor, boxShadow: `0 0 0 4px ${healthSoft}`, flexShrink: 0, display: 'inline-block' },
      healthBadgeStyle: { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', padding: '3px 8px', borderRadius: 6, color: healthColor, background: healthSoft },
      donutPctStyle: { fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: donutLed ? 30 : 24, lineHeight: 1, color: C.text },
      barPctStyle: { fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 22, color: healthColor },
      tablePctStyle: { fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: healthColor },
      flakyChipStyle: { fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: p.flaky > 0 ? C.broken : C.textFaint, background: p.flaky > 0 ? C.amberSoft : 'transparent', padding: '2px 7px', borderRadius: 6, whiteSpace: 'nowrap' },
      onExpand: () => this.toggleExpand(p.id),
      stop: (e) => { e.stopPropagation() },
      onHuly: (e) => { e.stopPropagation(); this.openHuly(p) },
      reports: p.reports.slice(0, 12).map((r) => ({
        n: r.n, url: r.url, pct: Math.round(r.passRate), clock: this.fmtClock(r.ts),
        rateStyle: { fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: r.passRate < 70 ? C.red : r.passRate < 90 ? C.amber : C.green, minWidth: 38, textAlign: 'right' },
      })),
    }

    const donutSize = donutLed ? 116 : 92
    card.donutStyle = { width: donutSize, height: donutSize, borderRadius: '50%', background: this.donutGradient(p.statistic, C), display: 'grid', placeItems: 'center', flexShrink: 0 }

    // compact bar segments
    const t = p.statistic.total || 1
    card.barSegs = [
      { key: 'p', style: { width: ((p.statistic.passed / t) * 100) + '%', background: C.passed, height: '100%' } },
      { key: 'b', style: { width: ((p.statistic.broken / t) * 100) + '%', background: C.broken, height: '100%' } },
      { key: 'f', style: { width: ((p.statistic.failed / t) * 100) + '%', background: C.failed, height: '100%' } },
      { key: 's', style: { width: ((p.statistic.skipped / t) * 100) + '%', background: C.skipped, height: '100%' } },
    ]

    // card container style
    const pad = dens ? 14 : 18
    card.cardStyle = {
      position: 'relative', background: C.card, border: `1px solid ${below ? healthColor : C.cardBorder}`,
      borderRadius: 14, padding: pad, display: 'flex', flexDirection: 'column', gap: dens ? 10 : 12,
      cursor: 'pointer', transition: 'transform .12s ease, box-shadow .12s ease, border-color .12s ease',
      boxShadow: C.dark ? '0 1px 0 rgba(255,255,255,0.02)' : '0 1px 2px rgba(16,32,54,0.05)',
      borderLeft: `3px solid ${healthColor}`,
    }
    card.bodyStyle = { display: 'flex', alignItems: 'center', gap: dens ? 12 : 16 }
    card.belowThreshold = below
    card.alertPillStyle = { fontSize: 9.5, fontWeight: 700, letterSpacing: '0.03em', color: '#fff', background: healthColor, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap', alignSelf: 'flex-end' }

    // table row
    card.rowStyle = { cursor: 'pointer', borderBottom: `1px solid ${C.cardBorder}`, background: below ? healthSoft : 'transparent' }

    // expand-only heavy data
    if (expanded) {
      card.stackedEl = this.stackedAreaEl(p.trend, C, { W: 760, H: 240 })
      card.durationEl = this.durationEl(p.trend, C, { W: 360, H: 110 })
      const dmax = Math.max(1, ...p.defects.map((d) => d.count))
      card.defectsView = p.defects.map((d) => ({
        name: d.name, count: d.count,
        barStyle: { width: (d.count / dmax * 100) + '%', height: '100%', background: d.type === 'product' ? C.failed : C.broken, borderRadius: 4 },
      }))
      card.lowView = p.lowPerforming.map((tst) => ({
        name: tst.name, durText: this.fmtDur(tst.duration), successRate: tst.successRate,
        rateStyle: { fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, minWidth: 42, textAlign: 'right', color: tst.successRate < 70 ? C.red : tst.successRate < 85 ? C.amber : C.green },
      }))
      const firstDur = p.trend[0].duration, lastDur = p.trend[p.trend.length - 1].duration
      const dchg = Math.round((lastDur - firstDur) / Math.max(1, firstDur) * 100)
      card.durTrendText = (dchg >= 0 ? '+' : '') + dchg + '% vs first'
      card.durTrendStyle = { fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600, color: dchg > 15 ? C.amber : C.textDim }
    }
    return card
  }

  // ---- list ops ----
  sortList(list, field, dir) {
    const rank = { red: 2, amber: 1, green: 0 }
    const sorted = list.slice().sort((a, b) => {
      let av, bv
      switch (field) {
        case 'name': av = a.name.toLowerCase(); bv = b.name.toLowerCase(); return av < bv ? -1 : av > bv ? 1 : 0
        case 'passRate': av = a.passRate; bv = b.passRate; break
        case 'failed': av = a.statistic.failed; bv = b.statistic.failed; break
        case 'flaky': av = a.flaky; bv = b.flaky; break
        case 'duration': av = a.time.duration; bv = b.time.duration; break
        case 'ts': av = a.time.start; bv = b.time.start; break
        case 'health': default: av = rank[a.health] * 1000 + (100 - a.passRate); bv = rank[b.health] * 1000 + (100 - b.passRate); break
      }
      return av - bv
    })
    return dir === 'desc' ? sorted.reverse() : sorted
  }

  // ---- actions ----
  setTheme(t) { this.setState({ theme: t }) }
  setView(v) { this.setState({ view: v }) }
  setCardStyle(c) { this.setState({ cardStyle: c }) }
  setDensity(d) { this.setState({ density: d }) }
  toggleExpand(id) { this.setState((s) => ({ expandedId: s.expandedId === id ? null : id })) }
  toggleOnlyBad() { this.setState((s) => ({ onlyBad: !s.onlyBad })) }
  toggleDir() { this.setState((s) => ({ sortDir: s.sortDir === 'asc' ? 'desc' : 'asc' })) }
  toggleAuto() { this.setState((s) => ({ autoRefresh: !s.autoRefresh })) }
  openHuly(p) {
    const key = 'QA-' + (1000 + Math.floor(Math.random() * 8999))
    this.setState({ hulyToast: { show: true, key, name: p.name, url: (this.CONFIG && this.CONFIG.HULY_BASE) || 'https://do.nbfi.ru' } })
    if (this._toastT) clearTimeout(this._toastT)
    this._toastT = setTimeout(() => this.setState({ hulyToast: { show: false } }), 5200)
  }

  renderVals() {
    const s = this.state
    const theme = s.theme ?? this.props.defaultTheme ?? 'auto'
    const view = s.view ?? this.props.defaultView ?? 'cards'
    const cardStyle = s.cardStyle ?? this.props.defaultCardStyle ?? 'detailed'
    const threshold = Number(s.threshold ?? this.props.passThreshold ?? 90)
    const density = s.density
    const dark = theme === 'dark' || (theme === 'auto' && s.systemDark)
    const C = this.palette(dark, this.props.accent)
    const now = s.nowTick

    const raw = s.projects || []
    const enriched = raw.map((p) => this.enrich(p, C, now, threshold, cardStyle, density, false))

    // filter
    let list = enriched
    const q = (s.search || '').trim().toLowerCase()
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q) || (p.domain || '').toLowerCase().includes(q))
    if (s.onlyBad) list = list.filter((p) => p.health !== 'green')
    list = this.sortList(list, s.sortField, s.sortDir)

    // aggregates over ALL projects
    const sum = (f) => enriched.reduce((a, p) => a + f(p), 0)
    const totalTests = sum((p) => p.statistic.total)
    const passedTotal = sum((p) => p.statistic.passed)
    const failedTotal = sum((p) => p.statistic.failed)
    const overallPass = totalTests ? Math.round((passedTotal / totalTests) * 100) : 0
    const counts = { green: 0, amber: 0, red: 0 }
    enriched.forEach((p) => counts[p.health]++)
    const flakyTotal = sum((p) => p.flaky)
    const belowCount = enriched.filter((p) => p.passRate < threshold).length

    // aggregate trend (align by index)
    let aggTrendEl = null
    if (enriched.length) {
      const minLen = Math.min(...enriched.map((p) => p.trend.length))
      const agg = []
      for (let i = 0; i < minLen; i++) {
        const acc = { passed: 0, failed: 0, broken: 0, skipped: 0, total: 0 }
        enriched.forEach((p) => {
          const b = p.trend[i]
          acc.passed += b.passed; acc.failed += b.failed; acc.broken += b.broken; acc.skipped += b.skipped; acc.total += b.total
        })
        agg.push(acc)
      }
      aggTrendEl = this.stackedAreaEl(agg, C, { W: 560, H: 92, padT: 6 })
    }

    // expanded project
    const expRaw = raw.find((p) => p.id === s.expandedId)
    const expanded = expRaw ? this.enrich(expRaw, C, now, threshold, cardStyle, density, true) : null

    const ui = this.buildUI(C, density)

    // KPI styled bits
    const passColor = overallPass < 70 ? C.red : overallPass < 90 ? C.amber : C.green
    const kpi = {
      totalTests: this.nf(totalTests), projectsCount: enriched.length,
      overallPass, passedTotal: this.nf(passedTotal), failedTotal: this.nf(failedTotal),
      passStyle: { fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 34, lineHeight: 1, color: passColor },
      green: counts.green, amber: counts.amber, red: counts.red,
      flakyTotal,
      belowText: belowCount ? (belowCount + ' below ' + threshold + '% threshold') : 'all above threshold',
      greenChip: { fontSize: 12, fontWeight: 600, color: C.green, background: C.greenSoft, padding: '3px 9px', borderRadius: 7 },
      amberChip: { fontSize: 12, fontWeight: 600, color: C.amber, background: C.amberSoft, padding: '3px 9px', borderRadius: 7 },
      redChip: { fontSize: 12, fontWeight: 600, color: C.red, background: C.redSoft, padding: '3px 9px', borderRadius: 7 },
    }

    // segmented controls
    const seg = (active) => active
      ? { ...ui._segBtn, color: '#fff', background: C.accent, borderColor: C.accent }
      : { ...ui._segBtn, color: C.textDim, background: 'transparent', borderColor: 'transparent' }
    const themeOpts = [
      { key: 'auto', label: 'Auto', title: 'Follow system' },
      { key: 'light', label: '☀', title: 'Light' },
      { key: 'dark', label: '☾', title: 'Dark' },
    ].map((o) => ({ ...o, style: seg(theme === o.key), onClick: () => this.setTheme(o.key) }))
    const viewOpts = [
      { key: 'cards', label: '▦ Cards' }, { key: 'table', label: '☰ Table' },
    ].map((o) => ({ ...o, title: o.label, style: seg(view === o.key), onClick: () => this.setView(o.key) }))
    const cardStyleOpts = [
      { key: 'detailed', label: 'Detailed' }, { key: 'compact', label: 'Compact' }, { key: 'donut', label: 'Donut' },
    ].map((o) => ({ ...o, title: o.label + ' card', style: seg(cardStyle === o.key), onClick: () => this.setCardStyle(o.key) }))
    const densityOpts = [
      { key: 'comfortable', label: '◳' }, { key: 'compact', label: '▤' },
    ].map((o) => ({ ...o, title: o.key + ' density', style: seg(density === o.key), onClick: () => this.setDensity(o.key) }))

    const sortOpts = [
      { key: 'health', label: 'Health' }, { key: 'passRate', label: 'Pass %' },
      { key: 'failed', label: 'Failed' }, { key: 'flaky', label: 'Flaky' },
      { key: 'duration', label: 'Duration' }, { key: 'ts', label: 'Last run' }, { key: 'name', label: 'Name' },
    ]
    const arrow = (f) => s.sortField === f ? (s.sortDir === 'asc' ? '▲' : '▼') : ''
    const arrows = { name: arrow('name'), passRate: arrow('passRate'), failed: arrow('failed'), flaky: arrow('flaky'), duration: arrow('duration'), ts: arrow('ts') }
    const setSort = (f) => this.setState((st) => st.sortField === f ? { sortDir: st.sortDir === 'asc' ? 'desc' : 'asc' } : { sortField: f, sortDir: 'desc' })
    const sortHandlers = {}
    Object.keys(arrows).forEach((f) => { sortHandlers[f] = () => setSort(f) })

    const onlyBadStyle = s.onlyBad
      ? { ...ui._chipBtn, color: '#fff', background: C.red, borderColor: C.red }
      : { ...ui._chipBtn, color: C.textDim, background: 'transparent', borderColor: C.cardBorder }

    return {
      ui, C, dark,
      loading: s.loading && raw.length === 0,
      refreshing: s.refreshing,
      refreshSpinStyle: { display: 'inline-block', animation: s.refreshing ? 'amx-spin 0.8s linear infinite' : 'none' },
      lastUpdatedAgo: s.lastUpdated ? this.fmtAgo(s.lastUpdated, now) : '—',
      autoLabel: s.autoRefresh ? '⟲ Auto' : '⊘ Auto',
      kpi, aggTrendEl,
      list, isEmpty: !s.loading && list.length === 0,
      showCards: view === 'cards', showTable: view === 'table',
      hasExpanded: !!expanded, expanded,
      theme, view, cardStyle, density, threshold, search: s.search,
      sortField: s.sortField, dirArrow: s.sortDir === 'asc' ? '↑' : '↓',
      themeOpts, viewOpts, cardStyleOpts, densityOpts, sortOpts, arrows, sortHandlers, onlyBadStyle,
      onSearch: (e) => this.setState({ search: e.target.value }),
      onThreshold: (e) => this.setState({ threshold: e.target.value === '' ? '' : Number(e.target.value) }),
      onSortField: (e) => this.setState({ sortField: e.target.value }),
      toggleDir: () => this.toggleDir(),
      toggleOnlyBad: () => this.toggleOnlyBad(),
      refresh: () => this.load(),
      toggleAuto: () => this.toggleAuto(),
      closeExpand: () => this.setState({ expandedId: null }),
      apiBaseText: (this.CONFIG && this.CONFIG.API_BASE) || 'allure-docker-service',
      hulyToast: s.hulyToast,
    }
  }

  buildUI(C, density) {
    const mono = "'IBM Plex Mono', ui-monospace, monospace"
    const dens = density === 'compact'
    const cardBase = { background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 14 }
    return {
      _segBtn: { fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, padding: '6px 11px', borderRadius: 7, border: '1px solid transparent', cursor: 'pointer', lineHeight: 1, whiteSpace: 'nowrap' },
      _chipBtn: { fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, padding: '7px 12px', borderRadius: 8, border: '1px solid', cursor: 'pointer', whiteSpace: 'nowrap' },

      page: { minHeight: '100vh', background: C.bg, color: C.text, position: 'relative' },
      shell: { maxWidth: 1320, margin: '0 auto', padding: '22px 26px 60px' },

      header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', paddingBottom: 18 },
      brandWrap: { display: 'flex', alignItems: 'center', gap: 12 },
      brandMark: { position: 'relative', width: 40, height: 40, borderRadius: 11, background: C.accent, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 22, fontFamily: mono },
      brandMarkDot: { position: 'absolute', right: 7, bottom: 8, width: 6, height: 6, borderRadius: '50%', background: '#fff' },
      brandTitle: { fontSize: 19, fontWeight: 700, letterSpacing: '-0.01em' },
      brandSub: { fontSize: 12.5, color: C.textDim, marginTop: 1 },
      headRight: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
      liveWrap: { display: 'flex', alignItems: 'center', gap: 7, padding: '6px 11px', borderRadius: 8, background: C.panel, border: `1px solid ${C.cardBorder}` },
      liveDot: { width: 7, height: 7, borderRadius: '50%', background: C.green, animation: 'amx-pulse 2s ease-in-out infinite' },
      agoText: { fontSize: 12.5, color: C.textDim, fontWeight: 500 },
      iconBtn: { fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: C.textDim, background: C.panel, border: `1px solid ${C.cardBorder}`, borderRadius: 8, padding: '7px 11px', cursor: 'pointer' },
      refreshBtn: { fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: C.accent, border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 },
      segWrap: { display: 'inline-flex', gap: 2, padding: 3, background: C.panel, border: `1px solid ${C.cardBorder}`, borderRadius: 9 },

      kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(140px, 1fr)) minmax(320px, 1.8fr)', gap: 14, marginBottom: 18 },
      kpiTile: { ...cardBase, padding: '15px 17px', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 },
      kpiLabel: { fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: C.textFaint },
      kpiValue: { fontFamily: mono, fontWeight: 700, fontSize: 34, lineHeight: 1, color: C.text },
      kpiValueAmber: { fontFamily: mono, fontWeight: 700, fontSize: 34, lineHeight: 1, color: C.broken },
      kpiSub: { fontSize: 12, color: C.textDim, marginTop: 'auto' },
      healthRow: { display: 'flex', gap: 6, flexWrap: 'wrap', margin: '2px 0' },
      aggCard: { ...cardBase, padding: '13px 16px', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 },
      aggHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
      aggTitle: { fontSize: 12.5, fontWeight: 600, color: C.textDim },
      aggLegend: { display: 'flex', gap: 12, flexWrap: 'wrap' },
      legPass: { fontSize: 11, color: C.textDim, display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' },
      legBroken: { fontSize: 11, color: C.textDim, display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' },
      legFail: { fontSize: 11, color: C.textDim, display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' },
      legSkip: { fontSize: 11, color: C.textDim, display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' },
      legDotPass: { width: 8, height: 8, borderRadius: 2, background: C.passed, flexShrink: 0 },
      legDotBroken: { width: 8, height: 8, borderRadius: 2, background: C.broken, flexShrink: 0 },
      legDotFail: { width: 8, height: 8, borderRadius: 2, background: C.failed, flexShrink: 0 },
      legDotSkip: { width: 8, height: 8, borderRadius: 2, background: C.skipped, flexShrink: 0 },
      aggChart: { flex: 1, minHeight: 92, display: 'flex', alignItems: 'flex-end' },

      toolbar: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16, padding: '12px 14px', ...cardBase },
      searchWrap: { position: 'relative', display: 'flex', alignItems: 'center', flex: '1 1 200px', minWidth: 180 },
      searchIcon: { position: 'absolute', left: 11, fontSize: 16, color: C.textFaint, pointerEvents: 'none' },
      search: { width: '100%', fontFamily: 'inherit', fontSize: 13.5, color: C.text, background: C.soft, border: `1px solid ${C.cardBorder}`, borderRadius: 8, padding: '8px 12px 8px 32px', outline: 'none' },
      threshWrap: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: C.soft, border: `1px solid ${C.cardBorder}`, borderRadius: 8, whiteSpace: 'nowrap' },
      threshLabel: { fontSize: 12.5, color: C.textDim, fontWeight: 500, whiteSpace: 'nowrap' },
      threshInput: { width: 42, fontFamily: mono, fontSize: 13, fontWeight: 600, color: C.text, background: 'transparent', border: 'none', outline: 'none', textAlign: 'center' },
      spacer: { flex: '1 1 0' },
      sortLabel: { display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: C.textDim, fontWeight: 500 },
      select: { fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: C.text, background: C.soft, border: `1px solid ${C.cardBorder}`, borderRadius: 8, padding: '7px 10px', cursor: 'pointer', outline: 'none' },
      dirBtn: { fontFamily: mono, fontSize: 15, fontWeight: 700, color: C.textDim, background: C.soft, border: `1px solid ${C.cardBorder}`, borderRadius: 8, padding: '5px 11px', cursor: 'pointer', lineHeight: 1 },

      grid: { display: 'grid', gap: dens ? 12 : 16, gridTemplateColumns: `repeat(auto-fill, minmax(${dens ? 300 : 350}px, 1fr))` },
      cardHead: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
      cardHeadLeft: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 },
      cardHeadRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 },
      cardNameWrap: { minWidth: 0 },
      cardName: { fontSize: 15, fontWeight: 700, fontFamily: mono, letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
      cardDomain: { fontSize: 11.5, color: C.textFaint, marginTop: 1 },
      donutInner: { width: '72%', height: '72%', borderRadius: '50%', background: C.card, display: 'grid', placeItems: 'center', gap: 0, boxShadow: `inset 0 0 0 1px ${C.cardBorder}` },
      donutPctSign: { fontSize: 13, fontWeight: 500, color: C.textDim },
      donutPctLabel: { fontSize: 9.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.textFaint, marginTop: 2 },
      barCol: { display: 'flex', flexDirection: 'column', gap: 7, flex: 1, minWidth: 0 },
      barTopRow: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
      barTotal: { fontSize: 12, color: C.textDim, fontFamily: mono },
      barTrack: { display: 'flex', height: 9, borderRadius: 6, overflow: 'hidden', background: C.track },
      statGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 14px', flex: 1, minWidth: 0 },
      statCell: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 },
      statDotPass: { width: 8, height: 8, borderRadius: 2, background: C.passed, flexShrink: 0 },
      statDotFail: { width: 8, height: 8, borderRadius: 2, background: C.failed, flexShrink: 0 },
      statDotBroken: { width: 8, height: 8, borderRadius: 2, background: C.broken, flexShrink: 0 },
      statDotSkip: { width: 8, height: 8, borderRadius: 2, background: C.skipped, flexShrink: 0 },
      statNum: { fontFamily: mono, fontWeight: 600, color: C.text },
      statLbl: { fontSize: 12, color: C.textDim },
      sparkRow: { display: 'flex', alignItems: 'center', gap: 10 },
      sparkWrap: { flex: 1, minWidth: 0 },
      metaRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 2 },
      metaText: { fontSize: 11.5, color: C.textFaint, fontFamily: mono },
      cardActions: { display: 'flex', alignItems: 'center', gap: 8, paddingTop: 10, borderTop: `1px solid ${C.cardBorder}`, position: 'relative' },
      cardBtnPrimary: { fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: C.accent, background: C.accentSoft, borderRadius: 8, padding: '7px 12px', textDecoration: 'none', whiteSpace: 'nowrap' },
      cardExpandBtn: { fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: C.textDim, background: 'transparent', border: `1px solid ${C.cardBorder}`, borderRadius: 8, padding: '7px 12px', cursor: 'pointer', marginLeft: 'auto' },

      detailsBoxSm: { position: 'relative' },
      detailsSummarySm: { listStyle: 'none', fontSize: 12.5, fontWeight: 600, color: C.textDim, background: 'transparent', border: `1px solid ${C.cardBorder}`, borderRadius: 8, padding: '7px 12px', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' },
      reportsListSm: { position: 'absolute', zIndex: 20, top: '110%', left: 0, minWidth: 200, maxHeight: 240, overflowY: 'auto', background: C.panel, border: `1px solid ${C.cardBorder}`, borderRadius: 10, padding: 6, boxShadow: '0 12px 32px rgba(0,0,0,0.28)', display: 'flex', flexDirection: 'column', gap: 2 },
      reportLink: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 6, textDecoration: 'none', color: C.text, fontSize: 12.5 },
      reportN: { fontFamily: mono, color: C.textDim, minWidth: 42 },
      reportTs: { fontFamily: mono, fontSize: 11.5, color: C.textFaint, marginLeft: 'auto' },

      tableWrap: { ...cardBase, overflow: 'hidden', overflowX: 'auto' },
      table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
      th: { textAlign: 'right', padding: '12px 14px', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: C.textFaint, borderBottom: `1px solid ${C.cardBorder}`, cursor: 'pointer', whiteSpace: 'nowrap', background: C.soft },
      thLeft: { textAlign: 'left', padding: '12px 16px', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: C.textFaint, borderBottom: `1px solid ${C.cardBorder}`, cursor: 'pointer', whiteSpace: 'nowrap', background: C.soft },
      thRight: { textAlign: 'right', padding: '12px 16px', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: C.textFaint, borderBottom: `1px solid ${C.cardBorder}`, whiteSpace: 'nowrap', background: C.soft },
      td: { textAlign: 'right', padding: '11px 14px', color: C.text, fontFamily: mono, whiteSpace: 'nowrap' },
      tdLeft: { textAlign: 'left', padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 9 },
      tdName: { fontFamily: mono, fontWeight: 600 },
      tdPass: { textAlign: 'right', padding: '11px 14px', color: C.passed, fontFamily: mono, fontWeight: 600 },
      tdFail: { textAlign: 'right', padding: '11px 14px', color: C.failed, fontFamily: mono, fontWeight: 600 },
      tdBroken: { textAlign: 'right', padding: '11px 14px', color: C.broken, fontFamily: mono, fontWeight: 600 },
      tdMono: { textAlign: 'right', padding: '11px 14px', color: C.textDim, fontFamily: mono, whiteSpace: 'nowrap' },
      tdRight: { textAlign: 'right', padding: '11px 16px' },
      tableSpark: { width: 120, marginLeft: 'auto' },
      tableLink: { fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: C.accent, textDecoration: 'none' },

      expandPanel: { ...cardBase, padding: 20, marginBottom: 18, animation: 'amx-slide 0.22s ease', borderLeft: `3px solid ${C.accent}` },
      expHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 },
      expHeadLeft: { display: 'flex', alignItems: 'center', gap: 11, flexWrap: 'wrap' },
      expName: { fontSize: 18, fontWeight: 700, fontFamily: mono },
      expDomain: { fontSize: 12.5, color: C.textFaint },
      closeBtn: { fontFamily: 'inherit', fontSize: 15, color: C.textDim, background: C.soft, border: `1px solid ${C.cardBorder}`, borderRadius: 8, width: 34, height: 34, cursor: 'pointer', lineHeight: 1 },
      expGrid: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 },
      expChartCard: { background: C.soft, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 },
      expSideCol: { display: 'flex', flexDirection: 'column', gap: 14 },
      expWideRow: { gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
      expMiniCard: { background: C.soft, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 },
      cardSubTitle: { fontSize: 12, fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase', color: C.textFaint },
      expBigChart: { width: '100%' },
      expMiniChart: { width: '100%' },
      miniMetaRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
      miniMeta: { fontSize: 12, color: C.textDim, fontFamily: mono },
      flakyBig: { fontSize: 14, color: C.textDim },
      flakyNum: { fontFamily: mono, fontWeight: 700, fontSize: 22, color: C.broken, marginRight: 6 },
      detailsBox: { position: 'relative', marginTop: 'auto' },
      detailsSummary: { listStyle: 'none', fontSize: 12.5, fontWeight: 600, color: C.textDim, background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 8, padding: '8px 12px', cursor: 'pointer', userSelect: 'none' },
      reportsList: { marginTop: 6, maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 8, padding: 6 },
      defectList: { display: 'flex', flexDirection: 'column', gap: 9 },
      defectRow: { display: 'flex', alignItems: 'center', gap: 10 },
      defectName: { fontSize: 13, color: C.text, flex: '0 0 40%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
      defectTrack: { flex: 1, height: 9, background: C.track, borderRadius: 4, overflow: 'hidden' },
      defectCount: { fontFamily: mono, fontWeight: 600, color: C.textDim, minWidth: 24, textAlign: 'right' },
      lowList: { display: 'flex', flexDirection: 'column', gap: 8 },
      lowRow: { display: 'flex', alignItems: 'center', gap: 10 },
      lowName: { fontFamily: mono, fontSize: 12.5, color: C.text, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
      lowDur: { fontFamily: mono, fontSize: 12, color: C.textFaint },
      expActions: { display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' },
      btnPrimary: { fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: '#fff', background: C.accent, borderRadius: 9, padding: '10px 18px', textDecoration: 'none' },
      btnGhost: { fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: C.text, background: C.soft, border: `1px solid ${C.cardBorder}`, borderRadius: 9, padding: '10px 16px', textDecoration: 'none' },
      btnHuly: { fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: C.accent, background: 'transparent', border: `1.5px solid ${C.accent}`, borderRadius: 9, padding: '9px 16px', cursor: 'pointer', marginLeft: 'auto' },

      empty: { textAlign: 'center', padding: '60px 20px', color: C.textDim, fontSize: 14 },
      footer: { marginTop: 28, paddingTop: 16, borderTop: `1px solid ${C.cardBorder}`, display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: C.textFaint, fontFamily: mono, flexWrap: 'wrap' },
      footDot: { color: C.textFaint },

      loadOverlay: { position: 'fixed', inset: 0, background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, zIndex: 50 },
      loadSpinner: { fontSize: 40, color: C.accent, animation: 'amx-spin 0.9s linear infinite' },
      loadText: { fontSize: 14, color: C.textDim, fontWeight: 500 },

      toast: { position: 'fixed', bottom: 24, right: 24, zIndex: 60, display: 'flex', alignItems: 'center', gap: 12, background: C.panel, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: '14px 18px', boxShadow: '0 16px 40px rgba(0,0,0,0.32)', animation: 'amx-fade 0.25s ease', maxWidth: 380 },
      toastIcon: { width: 30, height: 30, borderRadius: '50%', background: C.green, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, flexShrink: 0 },
      toastTitle: { fontSize: 13.5, fontWeight: 700, fontFamily: mono },
      toastSub: { fontSize: 12, color: C.textDim, marginTop: 2 },
      toastLink: { fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: C.accent, textDecoration: 'none', marginLeft: 'auto', whiteSpace: 'nowrap' },
    }
  }

  render() {
    const v = this.renderVals()
    const ui = v.ui
    const kpi = v.kpi
    const exp = v.expanded

    return (
      <div style={ui.page}>
        <div style={ui.shell}>

          <header style={ui.header}>
            <div style={ui.brandWrap}>
              <div style={ui.brandMark}>A<span style={ui.brandMarkDot}></span></div>
              <div>
                <div style={ui.brandTitle}>Allure Overview</div>
                <div style={ui.brandSub}>Cross-project autotest health · Allure 3</div>
              </div>
            </div>
            <div style={ui.headRight}>
              <div style={ui.liveWrap}>
                <span style={ui.liveDot}></span>
                <span style={ui.agoText}>Updated {v.lastUpdatedAgo}</span>
              </div>
              <button style={ui.iconBtn} onClick={v.toggleAuto} title="Auto-refresh every 5 min">{v.autoLabel}</button>
              <button style={ui.refreshBtn} onClick={v.refresh} title="Refresh now">
                <span style={v.refreshSpinStyle}>⟳</span> Refresh
              </button>
              <div style={ui.segWrap}>
                {v.themeOpts.map((opt) => (
                  <button key={opt.key} style={opt.style} onClick={opt.onClick} title={opt.title}>{opt.label}</button>
                ))}
              </div>
            </div>
          </header>

          <section style={ui.kpiRow}>
            <div style={ui.kpiTile}>
              <div style={ui.kpiLabel}>Total tests</div>
              <div style={ui.kpiValue}>{kpi.totalTests}</div>
              <div style={ui.kpiSub}>across {kpi.projectsCount} projects</div>
            </div>
            <div style={ui.kpiTile}>
              <div style={ui.kpiLabel}>Overall pass rate</div>
              <div style={kpi.passStyle}>{kpi.overallPass}%</div>
              <div style={ui.kpiSub}>{kpi.passedTotal} passed · {kpi.failedTotal} failed</div>
            </div>
            <div style={ui.kpiTile}>
              <div style={ui.kpiLabel}>Health</div>
              <div style={ui.healthRow}>
                <span style={kpi.greenChip}>{kpi.green} green</span>
                <span style={kpi.amberChip}>{kpi.amber} amber</span>
                <span style={kpi.redChip}>{kpi.red} red</span>
              </div>
              <div style={ui.kpiSub}>{kpi.belowText}</div>
            </div>
            <div style={ui.kpiTile}>
              <div style={ui.kpiLabel}>Flaky tests</div>
              <div style={ui.kpiValueAmber}>{kpi.flakyTotal}</div>
              <div style={ui.kpiSub}>retries across suites</div>
            </div>
            <div style={ui.aggCard}>
              <div style={ui.aggHead}>
                <span style={ui.aggTitle}>Aggregated execution trend</span>
                <span style={ui.aggLegend}>
                  <span style={ui.legPass}><span style={ui.legDotPass}></span>passed</span>
                  <span style={ui.legBroken}><span style={ui.legDotBroken}></span>broken</span>
                  <span style={ui.legFail}><span style={ui.legDotFail}></span>failed</span>
                </span>
              </div>
              <div style={ui.aggChart}>{v.aggTrendEl}</div>
            </div>
          </section>

          <section style={ui.toolbar}>
            <div style={ui.searchWrap}>
              <span style={ui.searchIcon}>⌕</span>
              <input style={ui.search} placeholder="Search projects…" value={v.search} onChange={v.onSearch} aria-label="Search projects" />
            </div>
            <button style={v.onlyBadStyle} onClick={v.toggleOnlyBad} title="Show only red & amber">● red / amber</button>
            <div style={ui.threshWrap}>
              <span style={ui.threshLabel}>Alert &lt;</span>
              <input style={ui.threshInput} type="number" min="50" max="99" value={v.threshold} onChange={v.onThreshold} aria-label="Pass rate alert threshold" />
              <span style={ui.threshLabel}>%</span>
            </div>
            <div style={ui.spacer}></div>
            <label style={ui.sortLabel}>Sort
              <select style={ui.select} value={v.sortField} onChange={v.onSortField} aria-label="Sort field">
                {v.sortOpts.map((opt) => (
                  <option key={opt.key} value={opt.key}>{opt.label}</option>
                ))}
              </select>
            </label>
            <button style={ui.dirBtn} onClick={v.toggleDir} title="Toggle sort direction">{v.dirArrow}</button>
            <div style={ui.segWrap}>
              {v.cardStyleOpts.map((opt) => (
                <button key={opt.key} style={opt.style} onClick={opt.onClick} title={opt.title}>{opt.label}</button>
              ))}
            </div>
            <div style={ui.segWrap}>
              {v.densityOpts.map((opt) => (
                <button key={opt.key} style={opt.style} onClick={opt.onClick} title={opt.title}>{opt.label}</button>
              ))}
            </div>
            <div style={ui.segWrap}>
              {v.viewOpts.map((opt) => (
                <button key={opt.key} style={opt.style} onClick={opt.onClick} title={opt.title}>{opt.label}</button>
              ))}
            </div>
          </section>

          {v.hasExpanded && exp && (
            <section style={ui.expandPanel}>
              <div style={ui.expHead}>
                <div style={ui.expHeadLeft}>
                  <span style={exp.statusDotStyle}></span>
                  <span style={ui.expName}>{exp.name}</span>
                  <span style={ui.expDomain}>{exp.domain}</span>
                  <span style={exp.healthBadgeStyle}>{exp.pct}% pass</span>
                </div>
                <button style={ui.closeBtn} onClick={v.closeExpand} title="Close">✕</button>
              </div>

              <div style={ui.expGrid}>
                <div style={ui.expChartCard}>
                  <div style={ui.cardSubTitle}>Execution trend · passed / broken / failed</div>
                  <div style={ui.expBigChart}>{exp.stackedEl}</div>
                  <div style={ui.aggLegend}>
                    <span style={ui.legPass}><span style={ui.legDotPass}></span>passed</span>
                    <span style={ui.legBroken}><span style={ui.legDotBroken}></span>broken</span>
                    <span style={ui.legFail}><span style={ui.legDotFail}></span>failed</span>
                    <span style={ui.legSkip}><span style={ui.legDotSkip}></span>skipped</span>
                  </div>
                </div>

                <div style={ui.expSideCol}>
                  <div style={ui.expMiniCard}>
                    <div style={ui.cardSubTitle}>Duration trend</div>
                    <div style={ui.expMiniChart}>{exp.durationEl}</div>
                    <div style={ui.miniMetaRow}>
                      <span style={ui.miniMeta}>last {exp.durText}</span>
                      <span style={exp.durTrendStyle}>{exp.durTrendText}</span>
                    </div>
                  </div>
                  <div style={ui.expMiniCard}>
                    <div style={ui.cardSubTitle}>Flaky &amp; reports</div>
                    <div style={ui.flakyBig}><span style={ui.flakyNum}>{exp.flaky}</span> flaky</div>
                    <details style={ui.detailsBox}>
                      <summary style={ui.detailsSummary}>Past runs ▾</summary>
                      <div style={ui.reportsList}>
                        {exp.reports.map((r) => (
                          <a key={r.n} style={ui.reportLink} href={r.url} target="_blank" rel="noopener">
                            <span style={ui.reportN}>#{r.n}</span>
                            <span style={r.rateStyle}>{r.pct}%</span>
                            <span style={ui.reportTs}>{r.clock}</span>
                          </a>
                        ))}
                      </div>
                    </details>
                  </div>
                </div>

                <div style={ui.expWideRow}>
                  <div style={ui.expMiniCard}>
                    <div style={ui.cardSubTitle}>Defect distribution</div>
                    <div style={ui.defectList}>
                      {exp.defectsView.map((d) => (
                        <div key={d.name} style={ui.defectRow}>
                          <span style={ui.defectName}>{d.name}</span>
                          <div style={ui.defectTrack}><div style={d.barStyle}></div></div>
                          <span style={ui.defectCount}>{d.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={ui.expMiniCard}>
                    <div style={ui.cardSubTitle}>Low-performing tests</div>
                    <div style={ui.lowList}>
                      {exp.lowView.map((t, i) => (
                        <div key={i} style={ui.lowRow}>
                          <span style={ui.lowName}>{t.name}</span>
                          <span style={ui.lowDur}>{t.durText}</span>
                          <span style={t.rateStyle}>{t.successRate}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div style={ui.expActions}>
                <a style={ui.btnPrimary} href={exp.latestReportUrl} target="_blank" rel="noopener">Open full Allure report ↗</a>
                <a style={ui.btnGhost} href={exp.ci.lastPipelineUrl} target="_blank" rel="noopener">GitLab pipeline ↗</a>
                <button style={ui.btnHuly} onClick={exp.onHuly} title="Create a task in Huly (MCP)">＋ Create task in Huly</button>
              </div>
            </section>
          )}

          {v.showCards && (
            <section style={ui.grid}>
              {v.list.map((p) => (
                <div key={p.id} style={p.cardStyle} onClick={p.onExpand}>
                  <div style={ui.cardHead}>
                    <div style={ui.cardHeadLeft}>
                      <span style={p.statusDotStyle}></span>
                      <div style={ui.cardNameWrap}>
                        <div style={ui.cardName}>{p.name}</div>
                        <div style={ui.cardDomain}>{p.domain}</div>
                      </div>
                    </div>
                    <div style={ui.cardHeadRight}>
                      <span style={p.healthBadgeStyle}>{p.healthLabel}</span>
                      {p.belowThreshold && (
                        <span style={p.alertPillStyle}>▼ {v.threshold}%</span>
                      )}
                    </div>
                  </div>

                  <div style={p.bodyStyle}>
                    {p.showDonut && (
                      <div style={p.donutStyle}>
                        <div style={ui.donutInner}>
                          <span style={p.donutPctStyle}>{p.pct}<span style={ui.donutPctSign}>%</span></span>
                          <span style={ui.donutPctLabel}>pass</span>
                        </div>
                      </div>
                    )}
                    {p.showBar && (
                      <div style={ui.barCol}>
                        <div style={ui.barTopRow}>
                          <span style={p.barPctStyle}>{p.pct}%</span>
                          <span style={ui.barTotal}>{p.statistic.total} tests</span>
                        </div>
                        <div style={ui.barTrack}>
                          {p.barSegs.map((seg) => (
                            <div key={seg.key} style={seg.style}></div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div style={ui.statGrid}>
                      <div style={ui.statCell}><span style={ui.statDotPass}></span><span style={ui.statNum}>{p.statistic.passed}</span><span style={ui.statLbl}>passed</span></div>
                      <div style={ui.statCell}><span style={ui.statDotFail}></span><span style={ui.statNum}>{p.statistic.failed}</span><span style={ui.statLbl}>failed</span></div>
                      <div style={ui.statCell}><span style={ui.statDotBroken}></span><span style={ui.statNum}>{p.statistic.broken}</span><span style={ui.statLbl}>broken</span></div>
                      <div style={ui.statCell}><span style={ui.statDotSkip}></span><span style={ui.statNum}>{p.statistic.skipped}</span><span style={ui.statLbl}>skipped</span></div>
                    </div>
                  </div>

                  <div style={ui.sparkRow}>
                    <div style={ui.sparkWrap}>{p.sparkEl}</div>
                    <span style={p.flakyChipStyle}>⚡ {p.flaky}</span>
                  </div>

                  <div style={ui.metaRow}>
                    <span style={ui.metaText}>{p.startClock} · {p.durText}</span>
                    <span style={ui.metaText}>{p.agoText}</span>
                  </div>

                  <div style={ui.cardActions} onClick={p.stop}>
                    <a style={ui.cardBtnPrimary} href={p.latestReportUrl} target="_blank" rel="noopener">Open report ↗</a>
                    <details style={ui.detailsBoxSm}>
                      <summary style={ui.detailsSummarySm}>Past runs ▾</summary>
                      <div style={ui.reportsListSm}>
                        {p.reports.map((r) => (
                          <a key={r.n} style={ui.reportLink} href={r.url} target="_blank" rel="noopener">
                            <span style={ui.reportN}>#{r.n}</span>
                            <span style={r.rateStyle}>{r.pct}%</span>
                            <span style={ui.reportTs}>{r.clock}</span>
                          </a>
                        ))}
                      </div>
                    </details>
                    <button style={ui.cardExpandBtn} onClick={p.onExpand} title="Expand trend">Details</button>
                  </div>
                </div>
              ))}
            </section>
          )}

          {v.showTable && (
            <section style={ui.tableWrap}>
              <table style={ui.table}>
                <thead>
                  <tr>
                    <th style={ui.thLeft} onClick={v.sortHandlers.name}>Project {v.arrows.name}</th>
                    <th style={ui.th} onClick={v.sortHandlers.passRate}>Pass % {v.arrows.passRate}</th>
                    <th style={ui.th}>passed</th>
                    <th style={ui.th} onClick={v.sortHandlers.failed}>failed {v.arrows.failed}</th>
                    <th style={ui.th}>broken</th>
                    <th style={ui.th} onClick={v.sortHandlers.flaky}>flaky {v.arrows.flaky}</th>
                    <th style={ui.th}>trend</th>
                    <th style={ui.th} onClick={v.sortHandlers.duration}>duration {v.arrows.duration}</th>
                    <th style={ui.th} onClick={v.sortHandlers.ts}>last run {v.arrows.ts}</th>
                    <th style={ui.thRight}>report</th>
                  </tr>
                </thead>
                <tbody>
                  {v.list.map((p) => (
                    <tr key={p.id} style={p.rowStyle} onClick={p.onExpand}>
                      <td style={ui.tdLeft}><span style={p.statusDotStyle}></span><span style={ui.tdName}>{p.name}</span></td>
                      <td style={ui.td}><span style={p.tablePctStyle}>{p.pct}%</span></td>
                      <td style={ui.tdPass}>{p.statistic.passed}</td>
                      <td style={ui.tdFail}>{p.statistic.failed}</td>
                      <td style={ui.tdBroken}>{p.statistic.broken}</td>
                      <td style={ui.td}>{p.flaky}</td>
                      <td style={ui.td}><div style={ui.tableSpark}>{p.sparkEl}</div></td>
                      <td style={ui.tdMono}>{p.durText}</td>
                      <td style={ui.tdMono}>{p.agoText}</td>
                      <td style={ui.tdRight} onClick={p.stop}><a style={ui.tableLink} href={p.latestReportUrl} target="_blank" rel="noopener">open ↗</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {v.isEmpty && (
            <div style={ui.empty}>No projects match the current filter.</div>
          )}

          <footer style={ui.footer}>
            <span>{v.apiBaseText}</span>
            <span style={ui.footDot}>·</span>
            <span>Read-only overview · data via fetchProjects()</span>
          </footer>
        </div>

        {v.loading && (
          <div style={ui.loadOverlay}>
            <div style={ui.loadSpinner}>⟳</div>
            <div style={ui.loadText}>Loading reports…</div>
          </div>
        )}

        {v.hulyToast.show && (
          <div style={ui.toast}>
            <div style={ui.toastIcon}>✓</div>
            <div>
              <div style={ui.toastTitle}>Task created in Huly · {v.hulyToast.key}</div>
              <div style={ui.toastSub}>{v.hulyToast.name} — failures attached via MCP</div>
            </div>
            <a style={ui.toastLink} href={v.hulyToast.url} target="_blank" rel="noopener">Open ↗</a>
          </div>
        )}
      </div>
    )
  }
}
