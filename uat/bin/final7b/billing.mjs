// การเงิน: สร้างรอบวางบิล (บริษัท + วันตัดรอบ) / ส่งวางบิล · node billing.mjs create "<บริษัท>" 2026-10-07 | send "<บริษัท>"
import { openAs, shot, log, q, collect, trackApi, U, clean } from './_h.mjs'
const [step, co, cutoff] = process.argv.slice(2)
const s = await openAs('uat.finance'); const { page } = s; const api = trackApi(page)
await page.goto(U + '/finance?tab=revenue'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1200)
const d = page.getByRole('dialog').last()
if (step === 'create') {
  await page.getByRole('button', { name: '+ สร้างรอบวางบิล' }).click(); await page.waitForTimeout(1200)
  await d.locator('select').first().selectOption({ label: co }); await page.waitForTimeout(1500)
  if (cutoff) await d.locator('input[type=date]').fill(cutoff)
  await d.locator('textarea, input[type=text]').last().fill(`วางบิล ${co} ด่าน 7 รอบทวน`); await page.waitForTimeout(1200)
  log('billing', 'modal:', clean(await d.innerText()).slice(0, 1500)); await shot(page, `billing-create-${cutoff}`, { fullPage: true })
  await d.getByRole('button', { name: /สร้าง/ }).last().click(); log('billing', 'create', await collect(page, 4000), api.splice(0).map(x => x.slice(0, 220)))
}
if (step === 'send') {
  const row = page.locator('tr', { hasText: co }).filter({ hasText: 'ร่าง' }).first()
  log('billing', 'row', clean(await row.innerText()))
  await row.getByRole('button', { name: 'ส่งวางบิล' }).click(); await page.waitForTimeout(900)
  log('billing', 'send dlg:', clean(await d.innerText()).slice(0, 600))
  await d.locator('textarea, input[type=text]').last().fill('ส่งวางบิล ด่าน 7 รอบทวน')
  await d.getByRole('button', { name: /ยืนยัน|ส่ง/ }).last().click(); log('billing', 'send', await collect(page, 5000), api.splice(0).map(x => x.slice(0, 220)))
}
log('billing', q(`select batch_number,status,total_satang,due_date from billing_batches order by created_at desc limit 1`))
log('billing', 'console', s.consoleErrors, s.serverErrors); await s.browser.close()
