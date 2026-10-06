// รายละเอียดเคส (ภายใน) แสดงยี่ห้อ/รุ่น/ความจุ/สี
import { openAs, shot, log, U, clean } from './_h.mjs'
const [u, REF, path = '/cases/submit'] = process.argv.slice(2)
const s = await openAs(u); const { page } = s
await page.goto(U + path); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1000)
await page.locator('tr', { hasText: REF }).first().getByRole('button', { name: /ดูรายละเอียด|รายละเอียด/ }).first().click(); await page.waitForTimeout(1500)
const t = clean(await page.getByRole('dialog').last().innerText())
log('detail', u, REF, path, t.match(/.{0,150}(ความจุ).{0,150}/)?.[0] ?? 'NO CAPACITY ' + t.slice(0, 600))
await shot(page, `detail-${REF}-${u}`, { fullPage: true }); log('detail', 'console', s.consoleErrors, s.serverErrors); await s.browser.close()
