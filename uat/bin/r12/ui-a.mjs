// R12.01–R12.04 · R12.06–R12.14 · R12.24 (สแกนข้อความ) — หน้าจอจริง
import { openAs, shot, BASE } from '../lib.mjs'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
const R = 'R12', out = { pages: {} }
const BAD = [/\b(19|20)\d\d\b/, /§/, /ไฟล์ \d\d/, /\b[a-z]+_[a-z_]+\b/, /\b[A-Z]+_[A-Z_]+\b/, /3567891\d{8}/]
async function scan(p, key, extra = {}) {
  await p.waitForLoadState('networkidle'); await p.waitForTimeout(900)
  const t = await p.locator('body').innerText()
  const hits = BAD.flatMap(re => { const m = t.match(new RegExp(re.source, 'g')); return m ? [...new Set(m)].slice(0, 8) : [] })
  out.pages[key] = { url: p.url().replace(BASE, ''), hits, len: t.length, text: t.replace(/\s+/g, ' ').slice(0, extra.n ?? 700) }
  return t
}
const tabs = async p => (await p.locator('header, nav').allInnerTexts()).join(' | ').replace(/\s+/g, ' ').slice(0, 400)
// R12.01 + R12.02 ผู้จัดการ
for (const u of ['uat.co1.mgr', 'uat.co1.sup', 'uat.co2.admin']) {
  const s = await openAs(u, { fresh: true }); const p = s.page
  await p.waitForLoadState('networkidle'); await p.waitForTimeout(1200)
  out[u] = { landing: p.url().replace(BASE, ''), tabs: await tabs(p) }
  await shot(p, R, `01-login-landing-${u.replace(/\./g, '-')}`)
  await scan(p, `${u}:overview`, { n: 1500 })
  await shot(p, R, u === 'uat.co1.mgr' ? '02-mgr-overview' : u === 'uat.co1.sup' ? '03-sup-overview' : '04-admin-overview', { fullPage: true })
  const blocked = u === 'uat.co1.mgr' ? [] : u === 'uat.co1.sup' ? ['/portal/billing', '/portal/tax-invoices'] : ['/portal/handover', '/portal/billing', '/portal/tax-invoices']
  out[u].blocked = {}
  for (const path of blocked) { await p.goto(BASE + path); await p.waitForLoadState('networkidle'); out[u].blocked[path] = p.url().replace(BASE, '') }
  const pages = u === 'uat.co1.mgr' ? ['/portal/cases', '/portal/billing', '/portal/tax-invoices', '/portal/handover', '/portal/company'] : u === 'uat.co1.sup' ? ['/portal/cases', '/portal/handover', '/portal/company'] : ['/portal/cases', '/portal/company']
  for (const path of pages) {
    await p.goto(BASE + path); await scan(p, `${u}:${path}`, { n: 1800 })
    if (u === 'uat.co1.mgr') {
      const name = { '/portal/cases': '06-cases', '/portal/billing': '08-billing', '/portal/tax-invoices': '09-tax-invoices', '/portal/handover': '11-handover', '/portal/company': '14-company' }[path]
      await shot(p, R, name, { fullPage: true })
    }
  }
  out[u].consoleErrors = s.consoleErrors; out[u].serverErrors = s.serverErrors
  await s.browser.close()
}
mkdirSync('uat/bin/r12/out', { recursive: true })
writeFileSync('uat/bin/r12/out/ui-a.json', JSON.stringify(out, null, 1))
console.log(JSON.stringify(Object.fromEntries(Object.entries(out).filter(([k]) => k !== 'pages')), null, 1))
for (const [k, v] of Object.entries(out.pages)) console.log('PAGE', k, v.url, 'hits=', JSON.stringify(v.hits))
