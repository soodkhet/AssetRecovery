// probe อ่านอย่างเดียว — หน้า /login (ไม่ล็อกอิน) อ่าน Next dev overlay "Issue" + label ฟอร์ม
import { chromium } from '@playwright/test'
import { shot, BASE } from './lib.mjs'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'th-TH', timezoneId: 'Asia/Bangkok' })
const page = await ctx.newPage()
const logs = []
page.on('console', m => logs.push(`${m.type()}: ${m.text().slice(0, 400)}`))
page.on('pageerror', e => logs.push(`pageerror: ${e.message}`))
await page.goto(`${BASE}/login`)
await page.waitForLoadState('networkidle')
await page.waitForTimeout(2500)
console.log('form text:', (await page.locator('body').innerText()).slice(0, 600))
console.log('inputs:', await page.locator('input').evaluateAll(els => els.map(e => `#${e.id} ${e.type} name=${e.name} label=${document.querySelector(`label[for="${e.id}"]`)?.innerText ?? ''}`)))
await shot(page, 'R1-probe', 'login-page')
const badge = page.locator('nextjs-portal').locator('text=/Issue/i')
console.log('overlay badge count:', await badge.count())
if (await badge.count() > 0) {
  console.log('badge text:', await badge.first().innerText())
  await badge.first().click()
  await page.waitForTimeout(1500)
  const txt = await page.locator('nextjs-portal').evaluateAll(ps => ps.map(p => p.shadowRoot?.textContent ?? p.textContent).join('\n---\n'))
  console.log('overlay text:', txt.replace(/\s+/g, ' ').slice(0, 2500))
  await shot(page, 'R1-probe', 'login-dev-overlay', { fullPage: true })
}
console.log('console:', logs.slice(0, 15))
await browser.close()
