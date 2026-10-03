import { openAs, shot, BASE, toasts, inlineErrors, trackMutations, settle, log, sleep } from './_h.mjs'
const s = await openAs('admin')
const { page } = s
const m = trackMutations(page)
const txt = async () => (await page.locator('main').first().innerText()).replace(/\n+/g, ' | ')
await page.goto(`${BASE}/settings/finance?tab=cycles`); await settle(page)
for (const c of [
  { name: 'AR UATL สิ้นเดือน Net 30', scope: 'บริษัท ยูเอที ลิสซิ่ง จำกัด (UATL)', due: '30', reason: 'ตั้งรอบวางบิล AR ของบริษัทลิสซิ่งสำหรับ UAT รอบที่ 1' },
  { name: 'AR UATC สิ้นเดือน Net 15', scope: 'บริษัท ยูเอที แคปปิตอล จำกัด (UATC)', due: '15', reason: 'ตั้งรอบวางบิล AR ของบริษัทแคปปิตอลสำหรับ UAT รอบที่ 1' },
]) {
  await page.getByRole('button', { name: /สร้างรอบ/ }).first().click()
  const dlg = page.getByRole('dialog')
  await dlg.locator('#cycle-name').fill(c.name)
  await dlg.locator('#cycle-type').selectOption('AR')
  await dlg.locator('#cycle-cutoff-type').selectOption('month_end')
  await dlg.locator('#cycle-due-type').selectOption('net_days')
  await dlg.locator('#cycle-due-value').fill(c.due)
  await dlg.locator('#cycle-scope').fill(c.scope)
  await dlg.locator('#cycle-reason').fill(c.reason)
  await shot(page, 'R1', `R1.31-cycle-form-${c.due}`, { fullPage: true })
  await dlg.getByRole('button', { name: 'สร้างรอบ', exact: true }).click()
  log(c.name, 'toast', JSON.stringify(await toasts(page)), 'res', m.res.slice(-1), 'open', await dlg.isVisible())
  if (await dlg.isVisible()) { log('errors', await inlineErrors(dlg)); await dlg.getByRole('button', { name: 'ยกเลิก' }).click() }
  await settle(page); await sleep(2500)
}
log('R1.31 table', JSON.stringify((await page.locator('tbody tr').allInnerTexts()).map(x => x.replace(/\s+/g, ' ').slice(0, 220))))
await shot(page, 'R1', 'R1.31-cycle-done', { fullPage: true })
// R1.32
await page.goto(`${BASE}/settings/finance?tab=vat`); await settle(page)
log('R1.32 vat', JSON.stringify((await page.locator('tbody tr').allInnerTexts()).map(x => x.replace(/\s+/g, ' '))))
await shot(page, 'R1', 'R1.32-vat', { fullPage: true })
// R1.33
await page.goto(`${BASE}/accounting`); await settle(page)
log('R1.33 h/tabs', JSON.stringify(await page.getByRole('tab').allInnerTexts().catch(() => [])))
const t33 = await txt()
log('R1.33 text', t33.slice(0, 1500))
log('R1.33 create-period button?', await page.getByRole('button', { name: /สร้างงวด|สร้างรอบ|เปิดรอบ/ }).count())
await shot(page, 'R1', 'R1.33-periods', { fullPage: true })
// R1.34
await page.goto(`${BASE}/settings/finance?tab=lock`); await settle(page)
log('R1.34 text', (await txt()).split('การล็อกรอบและ Adjustment').slice(-1)[0].slice(0, 1200))
await shot(page, 'R1', 'R1.34-lock-policy', { fullPage: true })
log('consoleErrors', s.consoleErrors, 'serverErrors', s.serverErrors)
await s.browser.close()
