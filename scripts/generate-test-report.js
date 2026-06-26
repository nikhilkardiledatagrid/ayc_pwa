/**
 * generate-test-report.js
 *
 * Reads raw Vitest JSON (_raw.json), adds severity per test case, and writes:
 *   - testcases_report/test-report-YYYY-MM-DD_HH-MM-SS.json
 *   - testcases_report/test-report-YYYY-MM-DD_HH-MM-SS.html
 *
 * Run via: npm run test:report
 */

import fs   from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT      = path.resolve(__dirname, '..')
const RAW_FILE  = path.join(ROOT, 'testcases_report', '_raw.json')
const OUT_DIR   = path.join(ROOT, 'testcases_report')

if (!fs.existsSync(RAW_FILE)) {
  console.error('❌  _raw.json not found. Run npm run test first.')
  process.exit(1)
}

const raw = JSON.parse(fs.readFileSync(RAW_FILE, 'utf-8'))

// ── Timestamp ─────────────────────────────────────────────────────────────────
const now       = new Date()
const pad       = (n) => String(n).padStart(2, '0')
const datestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
const timestamp = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
const generated = `${datestamp}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`

// ── Severity rules ─────────────────────────────────────────────────────────────
// Suite-level base severity (core PWA utils are Critical, API layer High, UI Medium)
const SUITE_SEVERITY = {
  sessionManager:   'Critical',
  eventQueue:       'Critical',
  returnToIdle:     'Critical',
  urlParams:        'High',
  timeoutManager:   'High',
  pwaApiService:    'High',
  store:            'High',
  HomeScreen:       'Medium',
  WaiterCallScreen: 'Medium',
  ReviewScreen:     'Medium',
  wifiScreen:       'Medium',
}

// Keywords in a test name that bump severity up one level
const HIGH_BUMP_KEYWORDS   = ['error', 'fail', 'network failure', 'offline', 'missing', 'invalid', 'timeout']
const CRITICAL_BUMP_KEYWORDS = ['crash', 'auth', 'session end', 'sendBeacon']

const SEVERITY_RANK = { Critical: 3, High: 2, Medium: 1, Low: 0 }

function suiteSeverity(suitePath) {
  for (const [key, sev] of Object.entries(SUITE_SEVERITY)) {
    if (suitePath.includes(key)) return sev
  }
  return 'Low'
}

function testSeverity(baseSev, testName) {
  const lower = testName.toLowerCase()
  let rank = SEVERITY_RANK[baseSev]
  if (CRITICAL_BUMP_KEYWORDS.some(k => lower.includes(k))) rank = Math.max(rank, SEVERITY_RANK['Critical'])
  else if (HIGH_BUMP_KEYWORDS.some(k => lower.includes(k)))  rank = Math.max(rank, SEVERITY_RANK['High'])
  return Object.keys(SEVERITY_RANK).find(k => SEVERITY_RANK[k] === rank) ?? baseSev
}

// ── Build suites ──────────────────────────────────────────────────────────────
const suites = (raw.testResults ?? []).map((file) => {
  const suitePath = path.relative(ROOT, file.testFilePath ?? file.name ?? 'unknown')
  const base      = suiteSeverity(suitePath)

  const tests = (file.assertionResults ?? file.tests ?? []).map((t) => {
    const name = t.fullName ?? t.title ?? t.name ?? 'unnamed'
    return {
      name,
      status:   t.status === 'passed' ? 'passed' : t.status === 'failed' ? 'failed' : 'skipped',
      severity: testSeverity(base, name),
      duration: t.duration != null ? Math.round(t.duration) : null,
      error:    t.failureMessages?.join('\n') ?? t.errors?.map(e => e.message).join('\n') ?? null,
    }
  })

  const passed  = tests.filter(t => t.status === 'passed').length
  const failed  = tests.filter(t => t.status === 'failed').length
  const skipped = tests.filter(t => t.status === 'skipped').length

  return { suite: suitePath, total: tests.length, passed, failed, skipped, tests }
})

// ── Summary ───────────────────────────────────────────────────────────────────
const summary = suites.reduce(
  (acc, s) => { acc.total += s.total; acc.passed += s.passed; acc.failed += s.failed; acc.skipped += s.skipped; return acc },
  { total: 0, passed: 0, failed: 0, skipped: 0 }
)

const report = {
  app: 'pwa', generated_at: generated, date: datestamp,
  result: summary.failed === 0 ? 'PASS' : 'FAIL',
  summary, suites,
}

// ── Write JSON ────────────────────────────────────────────────────────────────
const baseName = `test-report-${datestamp}_${timestamp}`
fs.writeFileSync(path.join(OUT_DIR, `${baseName}.json`), JSON.stringify(report, null, 2))
fs.unlinkSync(RAW_FILE)

// ── Build HTML ────────────────────────────────────────────────────────────────
const statusBadge = (s) => {
  const map = { passed: '#16a34a', failed: '#dc2626', skipped: '#d97706' }
  return `<span style="background:${map[s]??'#6b7280'};color:#fff;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;text-transform:uppercase">${s}</span>`
}

const severityBadge = (s) => {
  const map = { Critical: '#7c3aed', High: '#ea580c', Medium: '#0284c7', Low: '#64748b' }
  return `<span style="background:${map[s]??'#64748b'};color:#fff;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600">${s}</span>`
}

const rows = suites.flatMap(suite =>
  suite.tests.map((t, i) => `
    <tr style="background:${i % 2 === 0 ? '#f9fafb' : '#ffffff'}">
      ${i === 0 ? `<td rowspan="${suite.tests.length}" style="padding:10px 14px;font-size:12px;color:#374151;vertical-align:top;border-right:1px solid #e5e7eb;max-width:220px;word-break:break-word;font-weight:500">${suite.suite}</td>` : ''}
      <td style="padding:10px 14px;font-size:13px;color:#111827">${t.name}</td>
      <td style="padding:10px 14px;text-align:center">${statusBadge(t.status)}</td>
      <td style="padding:10px 14px;text-align:center">${severityBadge(t.severity)}</td>
      <td style="padding:10px 14px;text-align:center;font-size:12px;color:#6b7280">${t.duration != null ? t.duration + ' ms' : '—'}</td>
      <td style="padding:10px 14px;font-size:12px;color:#dc2626;max-width:260px;word-break:break-word">${t.error ? `<pre style="margin:0;white-space:pre-wrap">${t.error}</pre>` : ''}</td>
    </tr>`)
).join('')

const resultColor = summary.failed === 0 ? '#16a34a' : '#dc2626'

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>PWA Test Report — ${generated}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f1f5f9; padding: 32px; }
    h1  { font-size: 22px; color: #0f172a; margin-bottom: 4px; }
    .meta { font-size: 13px; color: #64748b; margin-bottom: 24px; }
    .cards { display: flex; gap: 16px; margin-bottom: 28px; flex-wrap: wrap; }
    .card { background: #fff; border-radius: 10px; padding: 16px 24px; min-width: 130px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    .card .label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; }
    .card .value { font-size: 28px; font-weight: 700; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    thead th { background: #1e293b; color: #fff; padding: 12px 14px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
    td { border-bottom: 1px solid #e5e7eb; }
    tr:last-child td { border-bottom: none; }
  </style>
</head>
<body>
  <h1>PWA Test Report</h1>
  <p class="meta">Generated: ${generated} &nbsp;|&nbsp; App: ${report.app} &nbsp;|&nbsp; Result: <strong style="color:${resultColor}">${report.result}</strong></p>

  <div class="cards">
    <div class="card"><div class="label">Total</div><div class="value" style="color:#0f172a">${summary.total}</div></div>
    <div class="card"><div class="label">Passed</div><div class="value" style="color:#16a34a">${summary.passed}</div></div>
    <div class="card"><div class="label">Failed</div><div class="value" style="color:#dc2626">${summary.failed}</div></div>
    <div class="card"><div class="label">Skipped</div><div class="value" style="color:#d97706">${summary.skipped}</div></div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="min-width:180px">Suite</th>
        <th>Test Case</th>
        <th style="width:90px;text-align:center">Status</th>
        <th style="width:100px;text-align:center">Severity</th>
        <th style="width:90px;text-align:center">Duration</th>
        <th style="min-width:180px">Error</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`

fs.writeFileSync(path.join(OUT_DIR, `${baseName}.html`), html)

// ── Build CSV ─────────────────────────────────────────────────────────────────
const csvEscape = (v) => {
  const s = v == null ? '' : String(v).replace(/\r?\n/g, ' ')
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
}

const csvRows = [
  ['App', 'Generated At', 'Overall Result', 'Suite', 'Test Case', 'Status', 'Severity', 'Duration (ms)', 'Error'],
  ...suites.flatMap(suite =>
    suite.tests.map(t => [
      report.app,
      generated,
      report.result,
      suite.suite,
      t.name,
      t.status,
      t.severity,
      t.duration ?? '',
      t.error ?? '',
    ])
  ),
]

const csv = csvRows.map(row => row.map(csvEscape).join(',')).join('\r\n')
fs.writeFileSync(path.join(OUT_DIR, `${baseName}.csv`), csv)

// ── Console summary ───────────────────────────────────────────────────────────
console.log('\n──────────────────────────────────────────')
console.log(`  PWA Test Report — ${generated}`)
console.log('──────────────────────────────────────────')
console.log(`  Total   : ${summary.total}`)
console.log(`  Passed  : ${summary.passed}`)
console.log(`  Failed  : ${summary.failed}`)
console.log(`  Skipped : ${summary.skipped}`)
console.log(`  Result  : ${summary.failed === 0 ? '✅ PASS' : '❌ FAIL'}`)
console.log(`  JSON    : testcases_report/${baseName}.json`)
console.log(`  HTML    : testcases_report/${baseName}.html`)
console.log(`  CSV     : testcases_report/${baseName}.csv`)
console.log('──────────────────────────────────────────\n')
