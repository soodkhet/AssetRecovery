// R8.25 ต่อ — แถวของรายงาน F/E/A หลัง Adjustment
import { openAs, log, BASE } from './_h.mjs'
const e = await openAs('uat.exec'); const p = e.page
const drop = new Set(['__key', 'key'])
for (const path of ['finance/gross-profit', 'finance/revenue-summary', 'executive/company-scorecard', 'executive/team-scorecard', 'executive/kpi-summary', 'finance/ar-aging', 'finance/compensation', 'finance/advance-overdue', 'accounting/wht-summary', 'accounting/tax-invoice']) {
  const j = await (await p.request.get(`${BASE}/api/reports/${path}`)).json()
  const d = j.data ?? {}
  const rows = (d.rows ?? []).map(r => Object.entries(r).filter(([k]) => !drop.has(k)).map(([k, v]) => `${k}=${typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(2) : v}`).join(','))
  log(`25b ${path}`, JSON.stringify({ rows, total: d.totals ?? d.total ?? d.summary ?? null, cache: d.cache ?? d.meta ?? null }).slice(0, 1500))
}
await e.browser.close()
