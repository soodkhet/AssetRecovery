// Flow 16 — บัญชี: สร้าง Export Pack ต.ค. เวอร์ชันใหม่ (ห้ามทับ v1) → ตรวจรายการเวอร์ชัน
import { openAs, shot, log, q } from './_h.mjs'
import { collect, trackApi } from '../r2/_h.mjs'
const s = await openAs('uat.account'); const { page } = s; const api = trackApi(page)
await page.goto('http://localhost:3000/accounting?tab=export'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1200)
await page.getByRole('button', { name: 'สร้างชุดเอกสารใหม่' }).click(); await page.waitForTimeout(1200)
const d = page.getByRole('dialog').last(); log('f16', 'dlg', (await d.innerText()).replace(/\s+/g, ' ').slice(0, 1200))
log('f16', 'selects', await d.locator('select').evaluateAll(es => es.map(e => `[${e.options[e.selectedIndex]?.text}]`)))
await shot(page, 'final/flow', 'f16-export-dlg', { fullPage: true })
for (const ta of await d.locator('textarea').all()) await ta.fill('Export ต.ค. หลังทดสอบ flow ด่าน 7')
log('f16', 'btns', await d.getByRole('button').allInnerTexts()); const b = d.getByRole('button', { name: /สร้าง|Export|ส่งออก|ดาวน์โหลด/ }).last(); log('f16', 'btn disabled', await b.isDisabled())
if (!(await b.isDisabled())) { await b.click(); log('f16', 'export', await collect(page, 15000), api.splice(0).map(x => x.slice(0, 300))) }
await page.waitForTimeout(1500); log('f16', 'list', (await page.locator('main').innerText()).replace(/\s+/g, ' ').match(/รอบบัญชี Version.{0,700}/)?.[0])
await shot(page, 'final/flow', 'f16-export-after', { fullPage: true })
log('f16', 'console', s.consoleErrors, s.serverErrors); await s.browser.close()
