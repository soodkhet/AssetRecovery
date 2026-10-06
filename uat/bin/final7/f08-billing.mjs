// Flow 8 — การเงิน: สร้างรอบวางบิล CO1 (U133 รอบบิลเลือกอัตโนมัติ) จากรายได้ FINAL7-001 → ส่งวางบิล → PDF ใบแจ้งหนี้
import { openAs, shot, log, q } from './_h.mjs'
import { collect, trackApi } from '../r2/_h.mjs'
import { writeFileSync } from 'node:fs'
const step = process.argv[2] ?? 'create'
const s = await openAs('uat.finance'); const { page } = s; const api = trackApi(page)
await page.goto('http://localhost:3000/finance?tab=revenue'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1200)
const dt = async () => (await page.getByRole('dialog').last().innerText().catch(() => '')).replace(/\s+/g, ' ')
if (step === 'create') {
  await page.getByRole('button', { name: '+ สร้างรอบวางบิล' }).click(); await page.waitForTimeout(1200)
  const d = page.getByRole('dialog').last()
  log('f08', 'modal:', (await dt()).slice(0, 1200))
  const sels = await d.locator('select').evaluateAll(es => es.map(e => `${e.id || e.name}: [${e.value}] ${[...e.options].map(o => o.text).join('/')}`))
  log('f08', 'selects:', sels.join(' || '))
  await shot(page, 'final/flow', 'f08-billing-modal', { fullPage: true })
  const co = d.locator('select').first(); await co.selectOption({ label: 'บจก. ยูเอที ลิสซิ่ง' }); await page.waitForTimeout(1500)
  const sels2 = await d.locator('select').evaluateAll(es => es.map(e => `${e.id || e.name}: [${e.options[e.selectedIndex]?.text}]`))
  log('f08', 'after pick CO1 selects:', sels2.join(' || '))
  log('f08', 'modal after CO1:', (await dt()).slice(0, 1500))
  await shot(page, 'final/flow', 'f08-billing-modal-co1', { fullPage: true })
  const di = d.locator('input[type=date]'); log('f08', 'proposed cutoff:', await di.inputValue())
  const create0 = d.getByRole('button', { name: /สร้าง/ }).last()
  await d.locator('textarea, input[type=text]').last().fill('abc'); log('f08', 'reason 3 chars → create disabled?', await create0.isDisabled(), (await dt()).match(/เหตุผล.{0,80}/)?.[0])
  if (process.env.CUTOFF) await di.fill(process.env.CUTOFF)
  await d.locator('textarea, input[type=text]').last().fill('วางบิลรายได้ FINAL7-001 (ด่าน 7)'); await page.waitForTimeout(800)
  log('f08', 'cutoff now:', await di.inputValue(), (await dt()).slice(-400))
  const cb = d.getByRole('checkbox'); log('f08', 'checkboxes', await cb.count())
  const create = d.getByRole('button', { name: /สร้าง/ }).last(); log('f08', 'create disabled', await create.isDisabled())
  await create.click(); log('f08', 'create', await collect(page, 4000), api.splice(0).map(x => x.slice(0, 220)))
}
if (step === 'send') {
  const row = page.locator('tr', { hasText: 'บจก. ยูเอที ลิสซิ่ง' }).filter({ hasText: 'ร่าง' }).first()
  log('f08', 'row', (await row.innerText()).replace(/\s+/g, ' '))
  await row.getByRole('button', { name: 'ส่งวางบิล' }).click(); await page.waitForTimeout(900)
  log('f08', 'send dlg:', (await dt()).slice(0, 900)); await shot(page, 'final/flow', 'f08-send-dlg', { fullPage: true })
  await page.getByRole('dialog').last().locator('textarea, input[type=text]').last().fill('ส่งวางบิล ด่าน 7 ทดสอบ')
  await page.getByRole('dialog').last().getByRole('button', { name: /ยืนยัน|ส่ง/ }).last().click()
  log('f08', 'send', await collect(page, 5000), api.splice(0).map(x => x.slice(0, 220)))
}
log('f08', q(`select b.batch_number,b.status,b.total_satang,b.due_date,b.sent_at,b.document_template_snapshot is not null tpl from billing_batches b where batch_number='BL-2569-011'`))
log('f08', 'console', s.consoleErrors, s.serverErrors); await s.browser.close()
