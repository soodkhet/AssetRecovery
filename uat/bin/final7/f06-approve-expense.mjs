// Flow 6 — อนุมัติรายการเบิก FINAL7-001 ผ่านหน้าจอ (ขั้น 1 ผู้จัดการ → ขั้น 2 การเงิน) · ตรวจรายได้เกิดหลังขั้นสุดท้าย
import { openAs, shot, log, q } from './_h.mjs'
import { collect, trackApi } from '../r2/_h.mjs'
const [u, tab = 'approval', REF = 'FINAL7-001', TYPE = ''] = process.argv.slice(2)
const s = await openAs(u); const { page } = s; const api = trackApi(page)
await page.goto(`http://localhost:3000/finance?tab=${tab}`); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1200)
const row = page.locator('tr', { hasText: REF }).filter({ hasText: TYPE }).filter({ has: page.getByRole('button', { name: /อนุมัติ/ }) }).first()
log('f06', u, 'row:', (await row.innerText().catch(() => 'NO ROW')).replace(/\s+/g, ' ').slice(0, 300))
log('f06', 'row buttons:', (await row.getByRole('button').allInnerTexts().catch(() => [])).join('|'))
// ตีกลับเหตุผลว่าง (validation)
const rb = row.getByRole('button', { name: /ตีกลับ|ปฏิเสธ/ }).first()
if (await rb.count()) { await rb.click(); await page.waitForTimeout(700); const d = page.getByRole('dialog').last()
  const c = d.getByRole('button', { name: /ยืนยัน|ตีกลับ|ปฏิเสธ/ }).last(); log('f06', 'reject confirm disabled w/o reason:', await c.isDisabled().catch(() => '?'))
  if (!(await c.isDisabled().catch(() => true))) { await c.click(); await page.waitForTimeout(800); log('f06', 'reject empty msgs:', await collect(page, 1500), (await d.innerText()).replace(/\s+/g, ' ').slice(0, 300)) }
  await shot(page, 'final/flow', `f06-${u}-reject-empty`); log('f06', 'api (must be no 2xx):', api.splice(0).map(x => x.slice(0, 120)))
  await d.getByRole('button', { name: /ยกเลิก|ปิด/ }).first().click().catch(() => page.keyboard.press('Escape')); await page.waitForTimeout(500) }
await row.getByRole('button', { name: /^(✓ )?อนุมัติ/ }).first().click(); await page.waitForTimeout(700)
const d = page.getByRole('dialog').last()
if (await d.isVisible().catch(() => false)) { log('f06', 'dlg:', (await d.innerText()).replace(/\s+/g, ' ').slice(0, 400)); await d.getByRole('button', { name: /ยืนยัน|อนุมัติ/ }).last().click() }
log('f06', 'approve', await collect(page, 4000), api.splice(0).map(x => x.slice(0, 160)))
await shot(page, 'final/flow', `f06-${u}-approved`)
log('f06', q(`select x.status,x.approval_step_current from expenses x join cases c on c.id=x.case_id where c.case_ref='${REF}' and x.expense_type='commission'`))
log('f06', 'revenue:', q(`select r.status,r.gross_satang,r.vat_satang,r.total_satang,r.vat_rate_pct_used,r.vat_mode_snapshot,r.revenue_date from revenues r join cases c on c.id=r.case_id where c.case_ref='${REF}'`))
log('f06', 'console', s.consoleErrors, s.serverErrors); await s.browser.close()
