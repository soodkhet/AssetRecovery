// R12.19 · R12.20 · R12.23 · R12.12 (รูปแอดมิน) · R12.25
import { chromium, devices } from '@playwright/test'
import { shot, BASE } from '../lib.mjs'
import { writeFileSync } from 'node:fs'
const R = 'R12', out = {}
async function open(u, mobile) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const base = mobile ? devices['iPhone 14'] : { viewport: { width: 1440, height: 900 } }
  const context = await browser.newContext({ ...base, locale: 'th-TH', timezoneId: 'Asia/Bangkok', storageState: `uat/.auth/${u}.json` })
  const page = await context.newPage(); const errs = []
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()) }); page.on('response', r => { if (r.status() >= 500) errs.push(`${r.status()} ${r.url()}`) })
  return { browser, page, errs }
}
const settle = async p => { await p.waitForLoadState('networkidle'); await p.waitForTimeout(900) }
// R12.19
out.internal = {}
for (const u of ['admin', 'uat.admin', 'uat.finance']) {
  const { browser, page: p } = await open(u); await p.goto(BASE + '/portal'); await settle(p)
  out.internal[u] = p.url().replace(BASE, ''); if (u === 'uat.finance') await shot(p, R, '19-internal-portal'); await browser.close()
}
// R12.20
{ const { browser, page: p } = await open('uat.co1.mgr'); out.companyPages = {}
  for (const path of ['/dashboard', '/cases', '/finance', '/settings/companies', '/warehouse', '/reports', '/accounting']) { await p.goto(BASE + path); await settle(p); out.companyPages[path] = p.url().replace(BASE, '') }
  await shot(p, R, '20-company-internal'); await browser.close() }
// R12.12 แอดมิน CO2 รูป (รอโหลด)
{ const { browser, page: p, errs } = await open('uat.co2.admin')
  await p.goto(BASE + '/portal/cases'); await settle(p)
  await p.getByRole('row', { name: /UAT-CO2-005/ }).getByText('ดูรายละเอียด').click(); await settle(p); await p.waitForTimeout(3000)
  out.co2Imgs = await p.evaluate(() => [...document.images].filter(i => i.src.includes('/api/portal/assets/')).map(i => i.complete && i.naturalWidth > 0))
  await shot(p, R, '12b-admin-case-photo'); out.co2Errs = errs; await browser.close() }
// R12.23 mobile
out.mobile = {}
for (const u of ['uat.co1.mgr', 'uat.co1.sup', 'uat.co2.admin']) {
  const { browser, page: p, errs } = await open(u, true); out.mobile[u] = {}
  const pages = { 'uat.co1.mgr': ['/portal', '/portal/cases', '/portal/billing', '/portal/tax-invoices', '/portal/handover', '/portal/company'], 'uat.co1.sup': ['/portal', '/portal/cases', '/portal/handover'], 'uat.co2.admin': ['/portal', '/portal/cases'] }[u]
  for (const path of pages) {
    await p.goto(BASE + path); await settle(p)
    const t = await p.locator('body').innerText()
    out.mobile[u][path] = { url: p.url().replace(BASE, ''), hscroll: await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), ce: (t.match(/\b20\d\d\b/g) ?? []).slice(0, 3), raw: (t.match(/\b[a-z]+_[a-z_]+\b|§/g) ?? []).slice(0, 3) }
    if (u === 'uat.co1.mgr') await shot(p, R, `23-mobile-mgr${path.replace('/portal', '').replace('/', '-') || '-overview'}`, { fullPage: true })
  }
  out.mobile[u].bottomNav = (await p.getByLabel('เมนูหลัก (จอเล็ก)').innerText().catch(() => 'n/a')).replace(/\s+/g, ' ')
  if (u !== 'uat.co1.mgr') await shot(p, R, `23-mobile-${u.replace(/\./g, '-')}`)
  out.mobile[u].errs = errs; await browser.close()
}
writeFileSync('uat/bin/r12/out/ui-c.json', JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1))
