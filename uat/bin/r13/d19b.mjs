// R13.19 ข — mgr.in อนุมัติขั้น 1 รายการผูกเคส 6 · ตีกลับค่าที่พัก 800.01 (เกินเพดาน) · probe sup.in
import { openAs, shot, log, settle, sleep, R, q, BASE, toasts, post } from './_h.mjs'
import { uiApprove } from '../r6v3/_h.mjs'
const T = new Date().toISOString()
const HOTEL = 'd61baf6f-a5d8-4fe5-9e34-3b5cdfaf0c52'
const { browser, page } = await openAs('uat.mgr.in')
await page.goto(`${BASE}/finance?tab=comp`); await settle(page); await sleep(1200)
for (const ref of ['UAT-CO1-901', 'UAT-CO2-007']) for (const t of ['คอมมิชชั่น', 'ค่าน้ำมัน', 'เบี้ยเลี้ยง']) {
  const [st, ts] = await uiApprove(page, ref, t, 1); log('approve1', ref, t, st.slice(0, 60), ts)
}
const hr = page.locator('tbody tr').filter({ hasText: '800.01' })
await hr.getByRole('button', { name: 'ตีกลับ' }).click(); await sleep(900)
const dlg = page.getByRole('dialog').last()
log('reject modal', (await dlg.innerText()).replace(/\s*\n+\s*/g, ' | ').slice(0, 500))
await dlg.locator('textarea').fill('ยอดเกินเพดานค่าที่พัก 800.00 บาท/คืน — แก้ยอดเป็น 800.00 แล้วส่งใหม่ (UAT R13)')
await shot(page, R, '19-reject-hotel-modal')
await dlg.getByRole('button', { name: /ยืนยัน|ตีกลับ/ }).last().click()
log('reject toasts', await toasts(page, 3000))
await settle(page); await sleep(800); await shot(page, R, '19-mgr-in-after-step1', { fullPage: true })
await browser.close()
const s = await openAs('uat.sup.in')
await s.page.goto(`${BASE}/finance?tab=comp`); await settle(s.page); await sleep(1000)
log('sup.in url', s.page.url(), 'approve buttons', await s.page.getByRole('button', { name: /อนุมัติขั้น/ }).count())
const ex1 = q(`select x.id from expenses x join cases c on c.id=x.case_id where c.case_ref='UAT-CO1-901' and x.expense_type='commission'`).split('\n')[2].trim()
log('sup.in API approve', await s.page.request.patch(`${BASE}/api/compensation/${ex1}/approve`, { data: { step: 2 }, failOnStatusCode: false }).then(async r => `${r.status()} ${(await r.text()).slice(0, 160)}`))
await shot(s.page, R, '19-sup-in-comp')
await s.browser.close()
log(q(`select coalesce(c.case_ref,'-') ref,x.expense_type,x.gross_satang,x.status,x.approval_step_current cur,x.approval_step_total tot,x.rejection_reason from expenses x left join cases c on c.id=x.case_id where x.id='${HOTEL}' or c.case_ref in ('UAT-CO1-901','UAT-CO2-007') order by 1,2`))
log(q(`select u.username,n.event_code,n.title,n.body from notifications n join users u on u.id=n.user_id where n.created_at>'${T}' order by n.created_at`))
