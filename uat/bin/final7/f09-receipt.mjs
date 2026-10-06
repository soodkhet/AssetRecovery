// Flow 9 — บัญชี: Import statement (เงินเข้า 1,800.00 จาก CO1) → คู่ที่ระบบเสนอ (U137) → จับคู่ BL-2569-011 → ส่วนต่างค่าธรรมเนียม (U144/U163)
import { openAs, shot, log, q } from './_h.mjs'
import { collect, trackApi } from '../r2/_h.mjs'
const step = process.argv[2] ?? 'import'
const s = await openAs('uat.account'); const { page } = s; const api = trackApi(page)
const dlg = () => page.locator('[role=dialog]').last()
await page.goto('http://localhost:3000/accounting?tab=bank'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1200)
if (step === 'import') {
  await page.getByRole('button', { name: 'Import Statement' }).click(); await page.waitForTimeout(800)
  log('f09', 'modal:', (await dlg().innerText()).replace(/\s+/g, ' ').slice(0, 700))
  log('f09', 'selects:', await dlg().locator('select').evaluateAll(es => es.map(e => [...e.options].map(o => o.value + '=' + o.text).join(' / '))))
  const sel = dlg().locator('select').first(); const opts = await sel.evaluate(e => [...e.options].map(o => o.value).filter(Boolean)); await sel.selectOption(opts[0])
  await dlg().locator('input[type=file]').setInputFiles(process.env.CSV ?? 'uat/fixtures/final7/bank-F7-1.csv'); await page.waitForTimeout(600)
  await shot(page, 'final/flow', 'f09-import-modal')
  await dlg().getByRole('button', { name: /อัปโหลด|นำเข้า/ }).last().click()
  log('f09', 'import', await collect(page, 5000), api.splice(0).map(x => x.slice(0, 300)))
  log('f09', q(`select transaction_date,amount_satang,match_status::text from bank_transactions where description like '%F7-BL011%'`))
}
if (step === 'proposal') {
  const t = (await page.locator('main').innerText()); const i = t.indexOf('คู่ที่ระบบเสนอ')
  log('f09', 'proposal panel:', i < 0 ? 'NONE' : t.slice(i, i + 700).replace(/\s+/g, ' '))
  await shot(page, 'final/flow', 'f09-proposals', { fullPage: true })
  if (i >= 0) { const btn = page.getByRole('button', { name: /ยืนยันคู่|ยืนยัน/ }).first(); log('f09', 'btn', await btn.innerText())
    await btn.click(); await page.waitForTimeout(800); const d = page.getByRole('dialog').last(); if (await d.isVisible().catch(() => false)) { log('f09', 'dlg', (await d.innerText()).replace(/\s+/g, ' ').slice(0, 500)); for (const ta of await d.locator('textarea').all()) await ta.fill('ยืนยันคู่ที่ระบบเสนอ ด่าน 7'); await d.getByRole('button', { name: /ยืนยัน/ }).last().click() }
    log('f09', 'confirm proposal', await collect(page, 4000), api.splice(0).map(x => x.slice(0, 300))) }
  log('f09', q(`select amount_satang,match_status::text,matched_payout_batch_id is not null pb from bank_transactions where description like '%F7-PBIN%'`))
}
if (step === 'match') {
  const row = page.locator('tbody tr').filter({ hasText: 'F7-BL011' }).first()
  log('f09', 'row:', (await row.innerText()).replace(/\s+/g, ' '))
  log('f09', 'proposals panel (U137):', (await page.locator('main').innerText()).match(/คู่ที่ระบบเสนอ.{0,600}/s)?.[0]?.replace(/\s+/g, ' ') ?? 'ไม่พบข้อความ "คู่ที่ระบบเสนอ" บนหน้า')
  await shot(page, 'final/flow', 'f09-bank-before-match', { fullPage: true })
  await row.getByRole('button', { name: 'จับคู่ Manual' }).click(); await page.waitForTimeout(1500)
  log('f09', 'match modal:', (await dlg().innerText()).replace(/\s+/g, ' ').slice(0, 1500))
  await shot(page, 'final/flow', 'f09-match-modal', { fullPage: true })
  const opts = await dlg().locator('select option').allInnerTexts(); const vals = await dlg().locator('select option').evaluateAll(os => os.map(o => o.value))
  const i = opts.findIndex(o => o.includes('BL-2569-011')); log('f09', 'candidate idx', i, opts.slice(0, 6))
  if (i >= 0) await dlg().locator('select').first().selectOption(vals[i])
  else { const p = dlg().getByText('BL-2569-011').first(); if (await p.count()) await p.click() }
  await page.waitForTimeout(800)
  log('f09', 'after select:', (await dlg().innerText()).replace(/\s+/g, ' ').slice(0, 1500))
  await shot(page, 'final/flow', 'f09-match-selected', { fullPage: true })
  const btn = dlg().getByRole('button', { name: 'ยืนยันการจับคู่' }); log('f09', 'confirm disabled w/o note:', await btn.isDisabled())
  await dlg().locator('textarea').first().fill('รับชำระ BL-2569-011 (ด่าน 7)')
  await btn.click(); log('f09', 'match', await collect(page, 5000), api.splice(0).map(x => x.slice(0, 300)))
  log('f09', q(`select batch_number,status,received_satang,wht_withheld_by_customer_satang,bank_fee_written_off_satang from billing_batches where batch_number='BL-2569-011'`))
}
log('f09', 'console', s.consoleErrors, s.serverErrors); await s.browser.close()
