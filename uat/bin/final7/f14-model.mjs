// Flow 14 — Model Phone (U157–U162): ดูรุ่น Apple (iPhone 14 ซ่อน) → ฟอร์มรับเคสต้องไม่เสนอ iPhone 14 · ห้ามกด "ดึงข้อมูลตอนนี้"
import { openAs, shot, log } from './_h.mjs'
const s = await openAs('admin'); const { page } = s
const bad = []; page.on('request', r => { if (r.method() !== 'GET' && /device|catalog|rapid|sync|fetch/i.test(r.url())) bad.push(r.method() + ' ' + r.url()) })
await page.goto('http://localhost:3000/settings/device-catalog'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1000)
log('f14', 'fetch-now button present:', await page.getByRole('button', { name: /ดึงข้อมูลตอนนี้/ }).count(), '(ไม่กด)')
await page.locator('tr', { hasText: 'Apple' }).first().getByRole('button', { name: 'ดูรุ่น' }).click(); await page.waitForTimeout(1200)
const d = page.getByRole('dialog').last()
log('f14', 'Apple models:', ((await d.innerText().catch(() => '')) || (await page.locator('main').innerText())).replace(/\s+/g, ' ').slice(0, 700))
await shot(page, 'final/flow', 'f14-apple-models', { fullPage: true })
await page.keyboard.press('Escape')
await page.goto('http://localhost:3000/cases/submit'); await page.waitForLoadState('networkidle')
await page.getByRole('button', { name: '+ รับเคส (กรอกมือ)' }).click(); const f = page.getByRole('dialog'); await f.waitFor(); await page.waitForTimeout(600)
await f.locator('#asset-type').selectOption({ label: 'สมาร์ทโฟน' }).catch(() => {})
await f.locator('#asset-model').fill('iPhone'); await page.waitForTimeout(1200)
log('f14', 'suggest "iPhone":', (await page.locator('[role=option]').allInnerTexts()).join(' | '))
await shot(page, 'final/flow', 'f14-form-iphone')
log('f14', 'non-GET catalog requests (must be 0):', bad); await s.browser.close()
