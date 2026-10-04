// R12.22 ระงับ CO2 ผ่านหน้าจอ Superadmin → ตรวจ portal → คืนสถานะทันที (finally)
import { chromium, request } from '@playwright/test'
import { shot, BASE, credentials } from '../lib.mjs'
import { sess, call, qa, ID } from './_h.mjs'
import { writeFileSync } from 'node:fs'
const out = {}
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const mk = async u => { const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'th-TH', timezoneId: 'Asia/Bangkok', storageState: `uat/.auth/${u}.json` }); return c.newPage() }
const settle = async p => { await p.waitForLoadState('networkidle'); await p.waitForTimeout(900) }
const card = p => p.locator('div').filter({ has: p.getByText('บริษัท ยูเอที แคปปิตอล จำกัด', { exact: true }) }).filter({ has: p.getByRole('button', { name: /ระงับ|เปิดใช้งาน/ }) }).last()
const ad = await mk('admin'); const co2 = await sess('uat.co2.admin'); const co1 = await sess('uat.co1.mgr')
async function setStatus(label, reason, shotName) {
  await ad.goto(BASE + '/settings/companies'); await settle(ad)
  await card(ad).getByRole('button', { name: label }).click()
  await ad.locator('#company-status-reason').fill(reason)
  if (shotName) await shot(ad, 'R12', shotName)
  await ad.getByRole('button', { name: label === /ระงับ/ ? 'ยืนยันระงับบริษัท' : /ยืนยัน/ }).last().click(); await settle(ad)
}
let suspended = false
try {
  out.before = qa(`select status||'|'||coalesce(suspended_reason,'-') from finance_companies where id='${ID.CO2}'`)
  await ad.goto(BASE + '/settings/companies'); await settle(ad)
  await card(ad).getByRole('button', { name: '🚫 ระงับ' }).click()
  await ad.locator('#company-status-reason').fill('UAT R12 ทดสอบระงับชั่วคราว')
  await shot(ad, 'R12', '22a-suspend')
  await ad.getByRole('button', { name: 'ยืนยันระงับบริษัท' }).click(); await settle(ad)
  out.afterSuspend = qa(`select status||'|'||coalesce(suspended_reason,'-') from finance_companies where id='${ID.CO2}'`)
  suspended = out.afterSuspend.startsWith('suspended')
  await shot(ad, 'R12', '22a2-suspended-card')
  // API ด้วย session เดิม
  out.api = []
  for (const p of ['/api/portal/dashboard', `/api/portal/cases/${ID.C5}`, '/api/portal/company-profile', `/api/portal/assets/${ID.AS5}/photos/0`]) { const r = await call(co2, 'GET', p); out.api.push(`${p.replace('/api/portal/', '')}=${r.status}:${r.code}:${r.msg}`) }
  out.co1Unaffected = (await call(co1, 'GET', '/api/portal/dashboard')).status
  // หน้า
  const pg = await mk('uat.co2.admin'); await pg.goto(BASE + '/portal'); await settle(pg)
  out.page = { url: pg.url().replace(BASE, ''), text: (await pg.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 400) }
  await shot(pg, 'R12', '22b-suspended-page')
  // login ใหม่ (รหัสถูก) — ไม่ log body ของคำขอ
  const c = credentials('uat.co2.admin'); const anon = await request.newContext({ baseURL: BASE })
  const lr = await anon.post('/api/auth/login', { data: { identifier: c.username, password: c.password }, failOnStatusCode: false })
  let lj = null; try { lj = await lr.json() } catch {}
  out.relogin = `${lr.status()}:${lj?.error?.code}:${lj?.error?.message}`
  // ลองผ่านหน้า login ด้วย (เห็นข้อความ)
  const lp = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'th-TH' })).newPage()
  await lp.goto(BASE + '/login'); await lp.locator('#identifier').fill(c.username); await lp.locator('#password').fill(c.password)
  await lp.getByRole('button', { name: 'เข้าสู่ระบบ' }).click(); await settle(lp)
  out.loginPage = { url: lp.url().replace(BASE, ''), text: (await lp.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 300) }
  await shot(lp, 'R12', '22b2-login-suspended')
} finally {
  if (suspended || qa(`select status from finance_companies where id='${ID.CO2}'`) !== 'active') {
    await ad.goto(BASE + '/settings/companies'); await settle(ad)
    await card(ad).getByRole('button', { name: '✓ เปิดใช้งาน' }).click()
    await ad.locator('#company-status-reason').fill('UAT R12 คืนสถานะหลังทดสอบ')
    await ad.getByRole('button', { name: 'ยืนยันเปิดใช้งาน' }).click(); await settle(ad)
    await shot(ad, 'R12', '22c-restored')
  }
  out.afterRestore = qa(`select status||'|'||coalesce(suspended_reason,'-') from finance_companies where id='${ID.CO2}'`)
}
out.apiAfter = (await call(co2, 'GET', '/api/portal/dashboard')).status
out.audit = qa(`select action||'|'||target_type||'|'||coalesce(reason,'-')||'|'||coalesce(after_data->>'status','')||'|'||coalesce(after_data->>'code','') from audit_logs where created_at > now() - interval '5 minutes' and (target_type in ('finance_company','finance_companies') or (action='access_denied' and after_data->>'code'='COMPANY_SUSPENDED') or (action not in ('login','logout','access_denied','export'))) order by created_at`)
writeFileSync('uat/bin/r12/out/s22.json', JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1))
await browser.close()
