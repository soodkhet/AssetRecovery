// Flow 11 — การเงิน: ยืนยันผู้รับ in1 → สร้างรอบจ่าย inhouse (U133/U146 ขอบเขต) → ตรวจยอด → สร้างไฟล์โอน → ยืนยันจ่าย → 50 ทวิ
import { openAs, shot, log, q } from './_h.mjs'
import { collect, trackApi } from '../r2/_h.mjs'
const step = process.argv[2]
const s = await openAs('uat.finance'); const { page } = s; const api = trackApi(page)
const dt = async () => (await page.getByRole('dialog').last().innerText().catch(() => '')).replace(/\s+/g, ' ')
if (step === 'verify') {
  await page.goto('http://localhost:3000/finance?tab=payee'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1200)
  const row = page.locator('tr', { hasText: 'อนันต์ ตามทรัพย์' }).first()
  await row.getByRole('button', { name: 'ยืนยัน', exact: true }).click(); await page.waitForTimeout(800)
  log('f11', 'verify dlg:', (await dt()).slice(0, 800)); await shot(page, 'final/flow', 'f11-verify-dlg', { fullPage: true })
  const vb = page.getByRole('dialog').last().getByRole('button', { name: /ยืนยัน/ }).last(); log('f11', 'verify btn disabled w/o reason', await vb.isDisabled())
  await page.getByRole('dialog').last().locator('textarea, input[type=text]').last().fill('ตรวจสมุดบัญชีแล้ว ด่าน 7')
  await vb.click()
  log('f11', 'verify', await collect(page, 4000), api.splice(0).map(x => x.slice(0, 200)))
}
if (step === 'create') {
  await page.goto('http://localhost:3000/finance?tab=payout'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1200)
  await page.getByRole('button', { name: '+ สร้างรอบจ่าย' }).click(); await page.waitForTimeout(1200)
  log('f11', 'create dlg:', (await dt()).slice(0, 1800))
  log('f11', 'selects:', await page.getByRole('dialog').last().locator('select').evaluateAll(es => es.map(e => `[${e.options[e.selectedIndex]?.text}] {${[...e.options].map(o => o.text).join('/')}}`)))
  await shot(page, 'final/flow', 'f11-create-dlg', { fullPage: true })
  const d = page.getByRole('dialog').last()
  await d.locator('select').first().selectOption({ label: 'Inhouse' }); await page.waitForTimeout(1200)
  log('f11', 'inhouse cycle sel:', await d.locator('select').nth(1).evaluate(e => e.options[e.selectedIndex]?.text))
  const di = d.locator('input[type=date]'); log('f11', 'date inputs', await di.count(), await di.first().inputValue().catch(() => '-'))
  if (await di.count()) await di.first().fill('2026-10-07'); else { const cb = d.getByRole('checkbox').first(); if (await cb.count()) { await cb.uncheck().catch(() => cb.click()); await page.waitForTimeout(500); await d.locator('input[type=date]').first().fill('2026-10-07') } }
  await page.waitForTimeout(1500)
  log('f11', 'after inhouse:', (await dt()).slice(0, 2500)); await shot(page, 'final/flow', 'f11-create-inhouse', { fullPage: true })
  const name = d.locator('input[type=text]').first(); if (await name.count()) await name.fill('PB-F7-IN')
  const reason = d.locator('textarea').first(); if (await reason.count()) await reason.fill('รอบจ่ายทดสอบ ด่าน 7')
  const btn = d.getByRole('button', { name: /สร้างรอบ/ }).last(); log('f11', 'create disabled', await btn.isDisabled())
  if (!(await btn.isDisabled())) { await btn.click(); log('f11', 'create', await collect(page, 5000), api.splice(0).map(x => x.slice(0, 400))) }
}
if (step === 'act') { // ปุ่มบนแถวรอบ: argv[3]=ชื่อรอบ argv[4]=ปุ่ม
  await page.goto('http://localhost:3000/finance?tab=payout'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1200)
  const row = page.locator('tr', { hasText: process.argv[3] }).first()
  log('f11', 'row', (await row.innerText()).replace(/\s+/g, ' '))
  await row.getByRole('button', { name: process.argv[4] }).first().click(); await page.waitForTimeout(1000)
  log('f11', 'dlg:', (await dt()).slice(0, 1500)); await shot(page, 'final/flow', `f11-${process.argv[3]}-${process.argv[4].replace(/\W/g, '')}`, { fullPage: true })
  const d = page.getByRole('dialog').last()
  if (await d.isVisible().catch(() => false)) {
    for (const ta of await d.locator('textarea').all()) await ta.fill('ด่าน 7 ทดสอบ')
    const di = d.locator('input[type=date], input[type=datetime-local]'); if (await di.count()) log('f11', 'date default', await di.first().inputValue())
    await d.getByRole('button', { name: /ยืนยัน|สร้าง|บันทึก/ }).last().click()
  }
  log('f11', 'act', await collect(page, 6000), api.splice(0).filter(x => !x.includes('storage/v1')).map(x => x.slice(0, 400)))
}
log('f11', q(`select b.name,b.status,b.side,b.cycle_id is not null cyc,(select count(*)||' '||sum(i.gross_satang)||' '||sum(i.wht_satang)||' '||sum(i.net_satang) from payout_batch_items i where i.payout_batch_id=b.id) items from payout_batches b order by b.created_at desc limit 2`).slice(0, 800))
log('f11', 'console', s.consoleErrors, s.serverErrors); await s.browser.close()
