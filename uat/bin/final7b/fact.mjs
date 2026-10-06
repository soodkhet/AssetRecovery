// ปุ่มบนการ์ดหน้า Field (มือถือ 375×812) · node fact.mjs <user> <path> <ข้อความการ์ด> <ปุ่ม> [ปุ่มในกล่อง...]
// env: TA=ข้อความเหตุผล FILE=ไฟล์ GO=1 กดปุ่มสุดท้ายในกล่อง
import { openAs, shot, log, q, collect, trackApi, U, clean } from './_h.mjs'
const [u, path, cardText, btn, ...inner] = process.argv.slice(2)
const s = await openAs(u, { mobile: true }); const { page } = s; await page.setViewportSize({ width: 375, height: 812 }); const api = trackApi(page)
await page.goto(U + path); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1200)
const card = page.locator('div', { hasText: cardText }).filter({ has: page.getByRole('button', { name: btn }) }).last()
await card.getByRole('button', { name: btn }).first().click(); await page.waitForTimeout(1200)
let d = page.getByRole('dialog').last()
log('fact', u, path, cardText, btn, 'dlg:', clean(await d.innerText().catch(() => '')).slice(0, 1500))
await shot(page, `fact-${u}-${btn}`.replace(/\s/g, ''), { fullPage: true })
for (const b of inner) {
  if (process.env.TA) for (const ta of await d.locator('textarea').all()) if (await ta.isVisible()) await ta.fill(process.env.TA)
  if (process.env.FILE) { const fi = d.locator('input[type=file]'); if (await fi.count()) await fi.first().setInputFiles(process.env.FILE); await page.waitForTimeout(2500) }
  const bb = d.getByRole('button', { name: b }).last(); log('fact', 'inner', b, 'disabled=', await bb.isDisabled().catch(() => '?'))
  if (process.env.GO !== '1') break
  await bb.click(); await page.waitForTimeout(1200); d = page.getByRole('dialog').last()
  log('fact', 'after', b, clean(await d.innerText().catch(() => '')).slice(0, 600), await collect(page, 3000), api.splice(0).filter(x => !x.includes('storage/v1')).map(x => x.slice(0, 250)))
}
await shot(page, `fact-${u}-${btn}-after`.replace(/\s/g, ''), { fullPage: true })
log('fact', 'console', s.consoleErrors, s.serverErrors); await s.browser.close()
