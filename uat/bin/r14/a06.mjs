// R14.06 mgr.in อนุมัติขั้น 1 ทั้ง 6 · finance อนุมัติขั้น 2 ทั้ง 6 → รายได้ 2 รายการ
import { openAs, shot, log, settle, sleep, R, q, BASE } from './_h.mjs'
import { uiApprove } from '../r6v3/_h.mjs'
const T = new Date().toISOString()
const REFS = ['UAT-CO1-006', 'UAT-CO2-R14'], TYPES = ['คอมมิชชั่น', 'ค่าน้ำมัน', 'เบี้ยเลี้ยง']
for (const [u, step] of [['uat.mgr.in', 1], ['uat.finance', 2]]) {
  const { browser, page, serverErrors } = await openAs(u)
  await page.goto(`${BASE}/finance?tab=comp`); await settle(page); await sleep(1200)
  for (const ref of REFS) for (const t of TYPES) {
    const [st, ts] = await uiApprove(page, ref, t, step); log(`approve${step}`, ref, t, st.slice(0, 60), JSON.stringify(ts).slice(-120))
  }
  await settle(page); await sleep(800); await shot(page, R, `06-after-step${step}`, { fullPage: true })
  log('5xx', serverErrors); await browser.close()
}
log(q(`select c.case_ref,x.expense_type,x.gross_satang,x.status from expenses x join cases c on c.id=x.case_id where c.case_ref in ('UAT-CO1-006','UAT-CO2-R14') order by 1,2`))
log(q(`select c.case_ref,r.gross_satang,r.vat_satang,r.vat_rate_pct_used,r.total_satang,r.fee_model_snapshot,r.vat_mode_snapshot,r.status,r.revenue_date from revenues r join cases c on c.id=r.case_id where r.created_at>'${T}'`))
log('dup', q(`select case_id,count(*) from revenues where deleted_at is null group by 1 having count(*)>1`))
