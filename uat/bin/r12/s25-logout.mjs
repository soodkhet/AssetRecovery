import { chromium } from '@playwright/test'
import { shot, BASE } from '../lib.mjs'
import { login, call } from './_h.mjs'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'th-TH', timezoneId: 'Asia/Bangkok', storageState: 'uat/.auth/uat.co2.admin.json' })
const p = await ctx.newPage(); await p.goto(BASE + '/portal'); await p.waitForLoadState('networkidle')
await p.getByRole('button', { name: 'ออกจากระบบ' }).first().click(); await p.waitForURL(/\/login/, { timeout: 15000 }); await p.waitForTimeout(600)
const url = p.url().replace(BASE, ''); await shot(p, 'R12', '25-logout')
const replay = await ctx.request.get(BASE + '/api/portal/dashboard', { failOnStatusCode: false })
console.log(JSON.stringify({ url, replayAfterLogout: replay.status() }))
await browser.close()
const c = await login('uat.co2.admin'); console.log('relogin', (await call(c, 'GET', '/api/portal/dashboard')).status)
