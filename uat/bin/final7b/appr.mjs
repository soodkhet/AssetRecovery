// อนุมัติรายการเบิกทุกแถวของ REF ที่ user เห็นปุ่มอนุมัติ (แท็บการเงิน → รออนุมัติ)
import { openAs, shot, log, q, collect, trackApi, U, clean } from './_h.mjs'
const [u, REF] = process.argv.slice(2)
const s = await openAs(u); const { page } = s; const api = trackApi(page)
for (let i = 0; i < 8; i++) {
  await page.goto(U + '/finance?tab=approval'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1200)
  const row = page.locator('tr', { hasText: REF }).filter({ has: page.getByRole('button', { name: /^(✓ )?อนุมัติ/ }) }).first()
  if (!(await row.count())) break
  log('appr', u, 'row:', clean(await row.innerText()).slice(0, 260))
  await row.getByRole('button', { name: /^(✓ )?อนุมัติ/ }).first().click(); await page.waitForTimeout(700)
  const d = page.getByRole('dialog').last()
  if (await d.isVisible().catch(() => false)) await d.getByRole('button', { name: /ยืนยัน|อนุมัติ/ }).last().click()
  log('appr', u, 'approve', await collect(page, 3000), api.splice(0).map(x => x.slice(0, 120)))
}
await shot(page, `appr-${u}-${REF}`, { fullPage: true })
log('appr', q(`select x.expense_type,x.gross_satang,x.status from expenses x join cases c on c.id=x.case_id where c.case_ref='${REF}'`))
log('appr', 'revenue:', q(`select r.status,r.gross_satang,r.vat_satang,r.total_satang,r.revenue_date from revenues r join cases c on c.id=r.case_id where c.case_ref='${REF}'`))
log('appr', 'console', s.consoleErrors, s.serverErrors); await s.browser.close()
