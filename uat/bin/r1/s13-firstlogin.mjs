import { chromium, devices } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { shot, BASE, P, log, sleep, toasts } from './_h.mjs'
const LIST = process.argv.slice(2)
const browser = await chromium.launch({ channel: 'chrome' })
async function firstLogin(u, mobile) {
  const ctx = await browser.newContext({ ...(mobile ? devices['iPhone 14'] : { viewport: { width: 1440, height: 900 } }), locale: 'th-TH', timezoneId: 'Asia/Bangkok' })
  const page = await ctx.newPage()
  const errs = []; page.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
  page.on('response', r => { if (r.status() >= 500) errs.push(`${r.status()} ${r.url()}`) })
  await page.goto(`${BASE}/login`)
  await page.locator('#identifier').fill(u)
  await page.locator('#password').fill(P[u].initial)
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await page.waitForURL(/\/auth\/change-password/, { timeout: 25000 })
  return { ctx, page, errs }
}
async function change(u, page, ctx, shotForm) {
  await page.locator('#current-password').fill(P[u].initial)
  await page.locator('#new-password').fill(P[u].password)
  await page.locator('#confirm-password').fill(P[u].password)
  if (shotForm) await shot(page, 'R1', shotForm, { fullPage: true })
  await page.getByRole('button', { name: 'บันทึกรหัสผ่านใหม่' }).click()
  await page.waitForURL(u2 => !u2.pathname.startsWith('/auth/change-password'), { timeout: 25000 })
  await page.waitForLoadState('networkidle').catch(() => {}); await sleep(800)
  mkdirSync('uat/.auth', { recursive: true })
  await ctx.storageState({ path: `uat/.auth/${u}.json` })
  const nav = (await page.locator('header a, nav a').allInnerTexts()).map(x => x.trim()).filter(Boolean)
  log(u, 'landing', new URL(page.url()).pathname, '| h1', JSON.stringify(await page.locator('h1').allInnerTexts()), '| nav', JSON.stringify([...new Set(nav)].slice(0, 14)))
}
if (LIST[0] === 'finance') {
  const u = 'uat.finance'
  const { ctx, page, errs } = await firstLogin(u)
  log('R1.37 page text', (await page.locator('body').innerText()).replace(/\n+/g, ' | ').slice(0, 500))
  await shot(page, 'R1', 'R1.37-forced-change-page', { fullPage: true })
  await page.goto(`${BASE}/dashboard`); await sleep(1500)
  log('R1.37 goto /dashboard →', new URL(page.url()).pathname)
  const r = await page.request.get(`${BASE}/api/users`)
  log('R1.37 GET /api/users', r.status(), (await r.text()).slice(0, 250))
  await page.locator('#current-password').fill(P[u].initial)
  await page.locator('#new-password').fill(P[u].initial)
  await page.locator('#confirm-password').fill(P[u].initial)
  await page.getByRole('button', { name: 'บันทึกรหัสผ่านใหม่' }).click(); await sleep(1500)
  log('R1.37 same-password msg', (await page.locator('body').innerText()).match(/[^\n]*ไม่ซ้ำ[^\n]*|[^\n]*ไม่ผ่านเงื่อนไข[^\n]*/g), 'url', new URL(page.url()).pathname)
  await shot(page, 'R1', 'R1.37-same-password-error', { fullPage: true })
  await change(u, page, ctx, 'R1.38-uat.finance-form')
  await shot(page, 'R1', 'R1.38-uat.finance-landing', { fullPage: true })
  log(u, 'errs', errs)
  await ctx.close()
} else {
  for (const u of LIST) {
    const mobile = u.startsWith('uat.agent')
    try {
      const { ctx, page, errs } = await firstLogin(u, mobile)
      await change(u, page, ctx)
      await shot(page, 'R1', `R1.39-${u}-landing`, { fullPage: !mobile })
      if (errs.length) log(u, 'errs', errs)
      await ctx.close()
    } catch (e) { log(u, 'FAIL', e.message.split('\n')[0]) }
  }
}
await browser.close()
