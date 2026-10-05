import { chromium, devices } from '@playwright/test'
import { credentials, BASE } from '../lib.mjs'
import { existsSync } from 'node:fs'
/** เปิด context: ใช้ session เดิมถ้ายังใช้ได้ · ไม่งั้น login สดจากหน้า /login (ไม่แตะหน้าที่ต้อง auth ก่อน — เลี่ยง cache session หมดอายุ) */
export async function open(u, opts = {}) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const base = opts.mobile ? devices['iPhone 14'] : { viewport: { width: 1440, height: 900 } }
  const statePath = `uat/.auth/${u}.json`
  const mk = (state) => browser.newContext({ ...base, locale: 'th-TH', timezoneId: 'Asia/Bangkok', storageState: state })
  let context, page
  if (!opts.fresh && existsSync(statePath)) {
    context = await mk(statePath); page = await context.newPage()
    const r = await page.request.get(BASE + '/api/auth/session')
    if (r.status() !== 200) { await context.close(); context = null }
  }
  if (!context) {
    context = await mk(undefined); page = await context.newPage()
    await page.goto(BASE + '/login')
    await page.locator('#identifier').fill(u)
    await page.locator('#password').fill(credentials(u).password)
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
    await page.waitForURL(x => !x.pathname.startsWith('/login'), { timeout: 20000 })
    await page.waitForTimeout(1500)
    if (page.url().includes('/login')) throw new Error('login loop ' + page.url())
    await context.storageState({ path: statePath })
  }
  const serverErrors = []
  page.on('response', r => { if (r.status() >= 500) serverErrors.push(`${r.status()} ${r.request().method()} ${r.url()}`) })
  return { browser, context, page, serverErrors }
}
