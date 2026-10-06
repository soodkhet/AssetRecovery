// Flow 16 — บัญชี: สร้าง Export Pack ต.ค. เวอร์ชันใหม่ (ห้ามทับ v1) → ตรวจรายการเวอร์ชัน
import { openAs, shot as shot0, log, q, collect, trackApi } from '../final7b/_h.mjs'

const s = await openAs('uat.account'); const { page } = s; const api = trackApi(page)
await page.goto('http://localhost:3000/accounting?tab=export'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1200)
await page.getByRole('button', { name: 'สร้างชุดเอกสารใหม่' }).click(); await page.waitForTimeout(1200)
const d = page.getByRole('dialog').last(); log('exp', 'dlg', (await d.innerText()).replace(/\s+/g, ' ').slice(0, 1200))
log('exp', 'selects', await d.locator('select').evaluateAll(es => es.map(e => `[${e.options[e.selectedIndex]?.text}]`)))
await shot0(page, 'f16-export-dlg', { fullPage: true })
for (const ta of await d.locator('textarea').all()) await ta.fill('Export ต.ค. หลังทดสอบ flow ด่าน 7 รอบทวน')
log('exp', 'btns', await d.getByRole('button').allInnerTexts()); const b = d.getByRole('button', { name: /สร้าง|Export|ส่งออก|ดาวน์โหลด/ }).last(); log('exp', 'btn disabled', await b.isDisabled())
if (!(await b.isDisabled())) { await b.click(); log('exp', 'export', await collect(page, 15000), api.splice(0).map(x => x.slice(0, 300))) }
await page.waitForTimeout(1500); log('exp', 'list', (await page.locator('main').innerText()).replace(/\s+/g, ' ').match(/รอบบัญชี Version.{0,700}/)?.[0])
await shot0(page, 'f16-export-after', { fullPage: true })
log('exp', 'console', s.consoleErrors, s.serverErrors); await s.browser.close()
