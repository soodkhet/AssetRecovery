// R13.20 การเงินแจ้งเตือน + อนุมัติขั้น 2 ทั้ง 7 → รายได้
import { openAs, shot, log, settle, sleep, R, q, BASE, toasts } from './_h.mjs'
import { uiApprove } from '../r6v3/_h.mjs'
const T = new Date().toISOString()
const { browser, page } = await openAs('uat.finance')
await page.goto(`${BASE}/notifications`); await settle(page); await sleep(1000)
log('fin noti', (await page.locator('main').innerText()).replace(/\s*\n+\s*/g, ' | ').slice(0, 700))
await shot(page, R, '20-finance-notifications')
await page.goto(`${BASE}/finance?tab=comp`); await settle(page); await sleep(1200)
for (const ref of ['UAT-CO1-901', 'UAT-CO2-007']) for (const t of ['คอมมิชชั่น', 'ค่าน้ำมัน', 'เบี้ยเลี้ยง']) {
  const [st, ts] = await uiApprove(page, ref, t, 2); log('approve2', ref, t, st.slice(0, 40), ts.at(-1))
}
const r = page.locator('tbody tr').filter({ hasText: 'ไม่ผูกเคส' }).filter({ has: page.getByRole('button', { name: 'อนุมัติขั้น 2' }) })
await r.first().getByRole('button', { name: 'อนุมัติขั้น 2' }).click(); log('hotel step2', (await toasts(page, 3000)).at(-1))
await settle(page); await sleep(800); await shot(page, R, '20-finance-after-step2', { fullPage: true })
await browser.close()
log(q(`select coalesce(c.case_ref,'-') ref,x.expense_type,x.gross_satang,x.status from expenses x left join cases c on c.id=x.case_id where x.id='d61baf6f-a5d8-4fe5-9e34-3b5cdfaf0c52' or c.case_ref in ('UAT-CO1-901','UAT-CO2-007') order by 1,2`))
log(q(`select c.case_ref,r.gross_satang,r.vat_satang,r.vat_rate_pct_used,r.total_satang,r.fee_model_snapshot,r.vat_mode_snapshot,r.status,r.revenue_date from revenues r join cases c on c.id=r.case_id where r.created_at>'${T}'`))
log(q(`select case_id,count(*) from revenues where deleted_at is null group by 1 having count(*)>1`))
