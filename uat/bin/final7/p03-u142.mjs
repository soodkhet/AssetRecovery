// U142 — ค่าเริ่มต้นเดือนของแท็บ "ส่งมอบแล้ว": เข้าตรง vs ผ่านแท็บ "รอส่งมอบ"
import { openAs, shot, log } from './_h.mjs'
const s = await openAs('uat.admin'); const { page } = s
const label = async () => (await page.locator('main').innerText()).replace(/\s+/g, ' ').match(/เดือนก่อน (.{0,20}) เดือนถัดไป(.{0,60})/)?.slice(1).join(' | ')
await page.goto('http://localhost:3000/warehouse'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(800)
await page.getByRole('tab', { name: /^ส่งมอบแล้ว/ }).click(); await page.waitForTimeout(1500)
log('p03', 'direct → ส่งมอบแล้ว:', await label()); await shot(page, 'final/flow', 'p03-u142-direct', { fullPage: true })
await page.getByRole('tab', { name: /^รอส่งมอบ/ }).click(); await page.waitForTimeout(1200)
await page.getByRole('tab', { name: /^ส่งมอบแล้ว/ }).click(); await page.waitForTimeout(1500)
log('p03', 'via รอส่งมอบ → ส่งมอบแล้ว:', await label()); await shot(page, 'final/flow', 'p03-u142-via-pending', { fullPage: true })
await page.goto('http://localhost:3000/warehouse'); await page.waitForLoadState('networkidle'); await page.getByRole('tab', { name: /^ส่งมอบแล้ว/ }).click(); await page.waitForTimeout(1200)
await page.getByRole('button', { name: /บจก. ยูเอที ลิสซิ่ง/ }).first().click().catch(() => page.getByText('บจก. ยูเอที ลิสซิ่ง').last().click()); await page.waitForTimeout(1000)
log('p03', 'expanded CO1:', (await page.locator('main').innerText()).replace(/\s+/g, ' ').match(/บจก\. ยูเอที ลิสซิ่ง.{0,500}/)?.[0])
await shot(page, 'final/flow', 'p03-u142-expanded', { fullPage: true })
await s.browser.close()
