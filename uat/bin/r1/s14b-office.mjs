import { openAs, BASE, log, settle } from './_h.mjs'
const s = await openAs('uat.admin')
for (const p of ['/api/users?roleGroup=inhouse&status=all', '/api/users?roleGroup=system&status=all']) {
  const r = await s.page.request.get(BASE + p); const j = await r.json().catch(() => null)
  log(p, r.status(), j?.error?.code ?? `rows=${Array.isArray(j?.data) ? j.data.length : JSON.stringify(j?.data)?.slice(0, 80)}`)
}
for (const p of ['/settings', '/settings/users']) { await s.page.goto(BASE + p); await settle(s.page); log(p, '→', new URL(s.page.url()).pathname) }
await s.browser.close()
