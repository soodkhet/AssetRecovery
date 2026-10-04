// R10.25 เมนู · R10.26 พิมพ์ URL ตรง ๆ · R10.28 แท็บการเงินหัวหน้าทีม
import { writeFileSync } from 'node:fs'
import { PERSONAS, sess, call, log } from './_h.mjs'
const ctx = {}; for (const u of PERSONAS) ctx[u] = await sess(u)
const menus = {}
for (const u of PERSONAS) {
  const r = await call(ctx[u], 'GET', '/api/meta/menu'); const d = r.body?.data ?? r.body
  const items = d?.items ?? d?.menu ?? d?.groups ?? (Array.isArray(d) ? d : [])
  const fmt = items.map((m) => { const ch = (m.children ?? m.items ?? []).map((c) => c.id ?? c.key ?? c.href); return (m.id ?? m.key ?? m.href) + (ch.length ? '(' + ch.join(',') + ')' : '') })
  menus[u] = { audience: d?.audience, menu: fmt }
  log('MENU', u, r.status, 'aud=' + d?.audience, fmt.join(' · '))
}
const PAGES = ['/cases/submit', '/cases/assign', '/field', '/finance', '/accounting', '/warehouse', '/reports', '/reports/kpi-summary', '/settings/roles', '/settings/finance', '/settings/companies', '/settings/users', '/settings/audit-logs', '/portal']
const res = {}
await Promise.all(PERSONAS.map(async (u) => {
  res[u] = {}
  for (const p of PAGES) {
    const r = await ctx[u].get(p, { failOnStatusCode: false, maxRedirects: 10 })
    const path = new URL(r.url()).pathname
    const html = path !== p ? await r.text() : ''
    res[u][p] = path === p ? `stay${r.status() === 200 ? '' : ':' + r.status()}` : `→${path}${/UAT-CO\d-\d{3}/.test(html) ? '!LEAK' : ''}`
  }
}))
writeFileSync('uat/bin/r10v3/pages.json', JSON.stringify({ menus, res }, null, 1))
for (const p of PAGES) log('PAGE', p, PERSONAS.map((u) => u.replace('uat.', '') + '=' + res[u][p]).join(' '))
log('--- R10.28')
for (const p of ['/api/payout-batches', '/api/billing-batches', '/api/advances', '/api/payees', '/api/adjustments', '/api/finance/dashboard-kpi']) { const r = await call(ctx['uat.mgr.in'], 'GET', p); log('MGR-FIN', p, r.status, r.code) }
