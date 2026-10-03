// แก้ charge_per_tracking_round ของ T1/T2 ให้ตรง DATASET (false) — แก้ผ่าน UI = สร้างเวอร์ชันใหม่
import { openAs, shot, BASE, toasts, fields, trackMutations, settle, log } from './_h.mjs'
const s = await openAs('admin')
const { page } = s
const m = trackMutations(page)
await page.goto(`${BASE}/settings/service-fee`); await settle(page)
for (const [name, tag] of [['UAT Success 5%', 't1'], ['UAT Flat 7,490', 't2']]) {
  const other = tag === 't1' ? 'UAT Flat 7,490' : 'UAT Success 5%'; const card = page.locator('div').filter({ hasText: name }).filter({ hasNotText: other }).filter({ has: page.getByRole('button', { name: '⚙️ แก้ไขข้อมูล' }) }).last()
  await card.getByRole('button', { name: '⚙️ แก้ไขข้อมูล' }).click()
  const dlg = page.getByRole('dialog')
  log(tag, 'title', await dlg.locator('h2,h3').first().innerText())
  log(tag, 'fields\n  ' + await fields(dlg))
  const cb = dlg.getByRole('checkbox', { name: /คิดค่าบริการต่อรอบการติดตาม/ })
  log(tag, 'per-round checked before', await cb.isChecked())
  await cb.uncheck()
  await dlg.locator('textarea').last().fill('ปิดการคิดค่าบริการต่อรอบการติดตามให้ตรงชุดข้อมูล UAT (DATASET M2)')
  await shot(page, 'R1', `R1.03b-sf-${tag}-edit-form`, { fullPage: true })
  const btns = await dlg.getByRole('button').allInnerTexts()
  log(tag, 'buttons', btns)
  await dlg.getByRole('button', { name: /บันทึก/ }).last().click()
  log(tag, 'toast', await toasts(page))
  await settle(page); await page.waitForTimeout(2500)
}
await shot(page, 'R1', 'R1.03b-sf-versions-done', { fullPage: true })
log('mutations', m.res)
log('consoleErrors', s.consoleErrors, 'serverErrors', s.serverErrors)
await s.browser.close()
