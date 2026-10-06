// ชุด 5 — สิทธิ์จาก URL ตรง (หน้าที่ไม่อยู่ในเมนู) + API ตรง · บัญชีระงับ/ลบล็อกอินไม่ได้
import { openAs, shot, log, slug } from './_h.mjs'
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'
const CASES = {
  'uat.agent.in1': ['/finance', '/accounting', '/settings/users', '/cases/submit', '/warehouse', '/reports', '/portal', '/dashboard'],
  'uat.approver': ['/finance', '/accounting', '/warehouse', '/settings/finance', '/reports/gross-profit'],
  'uat.finance': ['/settings/companies', '/settings/roles', '/settings/service-fee', '/reports/gross-profit', '/cases/assign'],
  'uat.account': ['/finance', '/settings/users', '/settings/companies', '/cases/submit'],
  'uat.mgr.in': ['/accounting', '/settings/finance', '/reports/gross-profit', '/finance?tab=payout'],
  'uat.sup.out': ['/finance', '/accounting', '/settings/teams'],
  'uat.co1.mgr': ['/cases/submit', '/finance', '/warehouse', '/settings', '/dashboard', '/portal/view-as/dd5c5017-775f-4e5f-8d5d-4735cc88ad56'],
  'uat.co1.sup': ['/portal/billing', '/portal/tax-invoices'],
  'uat.co2.admin': ['/portal/billing', '/portal/handover', '/portal/tax-invoices'],
}
const API = {
  'uat.agent.in1': ['/api/payout-batches', '/api/billing-batches', '/api/users', '/api/reports/gross-profit'],
  'uat.finance': ['/api/reports/gross-profit'],
  'uat.co1.mgr': ['/api/billing-batches', '/api/cases?companyId=dd5c5017-775f-4e5f-8d5d-4735cc88ad56', '/api/portal/billing-batches'],
  'uat.co2.admin': ['/api/portal/billing-batches'],
}
for (const [u, urls] of Object.entries(CASES)) {
  const s = await openAs(u); const { page } = s
  for (const url of urls) {
    const r = await page.goto('http://localhost:3000' + url); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(500)
    const fin = new URL(page.url()); const t = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
    const blocked = fin.pathname + fin.search !== url || /ไม่มีสิทธิ์|ไม่พบหน้า|403|404/.test(t.slice(0, 2000))
    const f = await shot(page, 'final/s05', `${u}-${slug(url)}`)
    log('s05', `${blocked ? 'BLOCK' : 'OPEN '} ${u} ${url} → ${fin.pathname}${fin.search} st=${r?.status()} ${(t.match(/.{0,30}(ไม่มีสิทธิ์|ไม่พบหน้า).{0,60}/) ?? [''])[0]} ${f}`)
  }
  for (const a of API[u] ?? []) { const r = await page.request.get('http://localhost:3000' + a); let b = ''; try { b = JSON.stringify((await r.json())?.error ?? '').slice(0, 120) } catch {} ; log('s05', `API ${u} GET ${a} → ${r.status()} ${b}`) }
  log('s05', u, 'console', s.consoleErrors.filter(e => !/403|401|404/.test(e)).slice(0, 2), '5xx', s.serverErrors); await s.browser.close()
}
// บัญชีระงับ/ลบ
const all = JSON.parse(readFileSync('uat/personas.json', 'utf8'))
for (const u of ['uat.temp1', 'uat.temp2']) {
  const b = await chromium.launch({ channel: 'chrome' }); const p = await (await b.newContext({ locale: 'th-TH' })).newPage()
  await p.goto('http://localhost:3000/login'); await p.locator('#identifier').fill(u); await p.locator('#password').fill(all[u].password ?? 'x')
  await p.getByRole('button', { name: 'เข้าสู่ระบบ' }).click(); await p.waitForTimeout(2500)
  log('s05', `LOGIN ${u} → ${new URL(p.url()).pathname} msg=${((await p.locator('[role=alert]').allInnerTexts()).join(' | ')).replace(/\s+/g, ' ').slice(0, 200)}`)
  await shot(p, 'final/s05', `login-${u}`); await b.close()
}
