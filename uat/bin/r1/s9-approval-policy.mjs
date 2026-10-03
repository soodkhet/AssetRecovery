import { openAs, shot, BASE, toasts, inlineErrors, fields, trackMutations, settle, log, sleep } from './_h.mjs'
const s = await openAs('admin')
const { page } = s
const m = trackMutations(page)
await page.goto(`${BASE}/settings/finance?tab=approval`); await settle(page)
// probe empty
await page.getByRole('button', { name: /เพิ่มกติกา/ }).first().click()
let dlg = page.getByRole('dialog')
log('R1.26 fields\n  ' + await fields(dlg))
await dlg.getByRole('button', { name: 'เพิ่มกติกา', exact: true }).click(); await sleep(700)
log('R1.26 probe errors', JSON.stringify(await inlineErrors(dlg)), 'mut', m.reqs)
await shot(page, 'R1', 'R1.26-approval-required', { fullPage: true })
await dlg.getByRole('button', { name: 'ยกเลิก' }).click()
async function rule(r, { dbl = false, form, done }) {
  await page.getByRole('button', { name: /เพิ่มกติกา/ }).first().click()
  dlg = page.getByRole('dialog')
  await dlg.locator('#approval-condition').fill(r.cond)
  await dlg.locator('#approval-threshold').fill(r.thr)
  for (let i = 0; i < r.flow.length; i++) {
    if (i > 0) await dlg.getByRole('button', { name: /เพิ่มขั้นอนุมัติ/ }).click()
    const el = dlg.getByLabel(`บทบาทผู้อนุมัติขั้นที่ ${i + 1}`)
    const tag = await el.evaluate(e => e.tagName)
    if (tag === 'SELECT') await el.selectOption({ label: r.flow[i] }); else await el.fill(r.flow[i])
    if (i === 0) log('step input tag', tag)
  }
  const sod = dlg.getByRole('checkbox', { name: /แยกหน้าที่/ })
  log('SoD default', await sod.isChecked()); await sod.check()
  await dlg.locator('#approval-reason').fill(r.reason)
  await shot(page, 'R1', form, { fullPage: true })
  const n0 = m.reqs.length
  const btn = dlg.getByRole('button', { name: 'เพิ่มกติกา', exact: true })
  if (dbl) await btn.dblclick(); else await btn.click()
  log(r.cond, 'toast', JSON.stringify(await toasts(page, 2500)), 'reqs', m.reqs.slice(n0), 'res', m.res)
  if (await dlg.isVisible()) { log('errors', await inlineErrors(dlg)); await dlg.getByRole('button', { name: 'ยกเลิก' }).click() }
  await settle(page); await sleep(1500)
  log('table', JSON.stringify((await page.locator('tbody tr').allInnerTexts()).map(x => x.replace(/\s+/g, ' ').slice(0, 200))))
  await shot(page, 'R1', done, { fullPage: true })
}
await rule({ cond: 'ยอดไม่เกิน 5,000 บาท', thr: '5,000.00', flow: ['ผู้จัดการทีมติดตามทรัพย์', 'การเงิน'], reason: 'ตั้งสายอนุมัติสำหรับ UAT รอบที่ 1 (ยอดไม่เกินเพดาน)' }, { form: 'R1.26-approval-rule1-form', done: 'R1.26-approval-rule1-done' })
await sleep(2500)
await rule({ cond: 'ยอดเกิน 5,000 บาท', thr: '', flow: ['ผู้จัดการทีมติดตามทรัพย์', 'การเงิน', 'บริหาร'], reason: 'ตั้งสายอนุมัติสำหรับ UAT รอบที่ 1 (ยอดเกินเพดาน)' }, { dbl: true, form: 'R1.27-approval-rule2-form', done: 'R1.27-approval-done' })

// R1.28 policy
await sleep(2500)
const card = page.locator('main')
log('R1.28 policy defaults', 'adv', await page.locator('#policy-advance-max').inputValue(), 'wo', await page.locator('#policy-writeoff').inputValue())
await page.locator('#policy-reason').fill('')
const n0 = m.reqs.length
await page.getByRole('button', { name: 'บันทึกนโยบายการเงิน' }).click(); await sleep(800)
log('R1.28 probe errors', JSON.stringify(await inlineErrors(card)), 'toast', JSON.stringify(await toasts(page, 500)), 'reqs', m.reqs.slice(n0))
await shot(page, 'R1', 'R1.28-policy-noreason', { fullPage: true })
await page.locator('#policy-advance-max').fill('5,000.00')
await page.locator('#policy-reason').fill('กำหนดเพดานเงินทดรองต่อครั้ง 5,000 บาท สำหรับ UAT รอบที่ 1')
await page.getByRole('button', { name: 'บันทึกนโยบายการเงิน' }).click()
log('R1.28 toast', JSON.stringify(await toasts(page)), 'res', m.res.slice(-1))
await settle(page)
log('R1.28 last edited', (await card.innerText()).match(/แก้ไขล่าสุด[^\n]*/)?.[0])
await shot(page, 'R1', 'R1.28-policy-done', { fullPage: true })
log('consoleErrors', s.consoleErrors, 'serverErrors', s.serverErrors)
await s.browser.close()
