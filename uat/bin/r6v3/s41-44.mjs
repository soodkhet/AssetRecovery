// R6.41 สิทธิ์อ่านรอบจ่าย (บริหาร/บัญชี) · R6.42–44 ตรวจปลายรอบ
import { openAs, shot, BASE, settle, sleep, log, R, q, flat, api, guard2xx, SQLB, TODAY, T0B } from './_hb.mjs'
log('=== s41-44', new Date().toISOString())
let n = 72
for (const u of ['uat.exec', 'uat.account']) {
  const s = await openAs(u); const p = s.page
  await p.goto(`${BASE}/finance?tab=payout`); await settle(p); await sleep(1500)
  const txt = flat(await p.locator('main').innerText())
  log(`${u} payout:`, txt.slice(250, 1300))
  for (const b of ['+ สร้างรอบจ่าย', 'สร้างไฟล์โอน', '✓ ยืนยันจ่ายแล้ว', 'สร้างไฟล์โอนซ้ำ']) log(`${u} button '${b}':`, await p.getByRole('button', { name: b, exact: true }).count())
  log(`${u} download links:`, await p.getByRole('link', { name: 'ดาวน์โหลดไฟล์โอน' }).count())
  await shot(p, R, `${n++}-R6.41-${u.replace('uat.', '')}-payout-readonly`, { fullPage: true })
  const g = await api(p, 'GET', '/api/payout-batches'); log(`${u} GET`, g.slice(0, 160), '| count', (g.match(/"name":"UAT/g) ?? []).length)
  const c = await api(p, 'POST', '/api/payout-batches', { side: 'inhouse', cutoffDate: TODAY, name: 'probe' }); log(`${u} POST`, c.slice(0, 200)); guard2xx(`${u}-post`, c)
  log('5xx', s.serverErrors, s.consoleErrors.slice(0, 3))
  await s.browser.close()
}
log('R6.42 noti', q(`select n.event_code,u.username,count(*) from notifications n join users u on u.id=n.user_id where n.created_at > '2026-10-03 18:57:52+00' group by 1,2 order by 1,2`))
log('R6.43 audit R6 ทั้งรอบ', q(`select target_type, action, count(*), count(*) filter (where reason is null) no_reason from audit_logs where created_at > '2026-10-03 18:57:52+00' and action not in ('login','logout') group by 1,2 order by 1,2`))
log('R6.44', q(`select (select count(*) from expenses) exp_all, (select count(*) from expenses where status='approved') exp_appr, (select sum(gross_satang) from expenses where status='approved') exp_appr_sum, (select count(*) from expenses where status not in ('approved','superseded')) exp_other, (select count(*) from expenses where status='approved' and payout_batch_item_id is null) exp_unpaid, (select count(*) from revenues) rev, (select sum(gross_satang) from revenues) rev_g, (select sum(vat_satang) from revenues) rev_v, (select sum(total_satang) from revenues) rev_t, (select count(*) from revenues where status='billed') rev_billed`))
log(q(`select (select count(*) from payout_batches where status='file_generated') pb_fg, (select count(*) from payout_batches where status='completed') pb_done, (select sum(gross_satang) from payout_batches) pb_gross, (select sum(net_satang) from payout_batches) pb_net, (select count(*) from expense_records) er, (select sum(wht_satang) from expense_records) er_wht, (select sum(net_satang) from expense_records) er_net, (select count(*) from wht_certificates where status='active') wht_n, (select sum(wht_satang) from wht_certificates) wht_sum, (select count(*) from billing_batches where status='sent') bb_sent, (select count(*) from sales_records) sr, (select count(*) from payee_profiles where is_verified) verified, (select count(*) from case_evidences where status='pending') ev_pending, (select count(*) from field_day_settlements) fds`))
log(q(`select left(a.id::text,8) id, a.requested_satang, a.approved_satang, a.used_satang, a.return_satang, a.status, a.payout_batch_item_id is not null in_batch from advances a order by a.created_at`))
log('F4', q(`select u.username, sum(i.gross_satang) filter (where i.expense_id is not null) g, sum(i.wht_satang) w, sum(i.net_satang) filter (where i.expense_id is not null) n from payout_batch_items i join payee_profiles p on p.id=i.payee_id join users u on u.id=p.user_id group by 1 order by 1`))
log(q(`select f.short_name, b.status, b.total_satang, b.due_date, b.wht_withheld_by_customer_satang, b.received_satang from billing_batches b join finance_companies f on f.id=b.company_id order by 1`))
log(q(`select status, count(*), sum(gross_satang) from expenses group by 1 order by 1`))
log(q(`select c.case_ref, r.gross_satang, r.vat_satang, r.total_satang, r.status from revenues r join cases c on c.id=r.case_id order by 1`))
log(q(`select (select require_payee_id_document from finance_policy_settings) req_doc, (select test_status from bank_file_formats limit 1) bff`))
