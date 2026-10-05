import { chromium } from '@playwright/test'
import { credentials, BASE } from '../lib.mjs'
const b = await chromium.launch({ channel: 'chrome' }); const ctx = await b.newContext(); const p = await ctx.newPage()
await p.goto(BASE + '/login'); await p.locator('#identifier').fill('uat.admin'); await p.locator('#password').fill(credentials('uat.admin').password)
await p.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
await p.waitForTimeout(6000); console.log('after login', p.url())
console.log((await p.locator('body').innerText()).slice(0,300))
await p.goto(BASE + '/cases'); await p.waitForLoadState('networkidle'); console.log('cases', p.url())
console.log((await ctx.cookies()).map(c=>c.name))
await b.close()
