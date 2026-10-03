// R6.32 การเงินขั้น 2 C4×3 → C3×3 · R6.33 ADV3 · R6.34 guard ฐาน in2 · R6.35 probe IN-2 unverified
import { openAs, shot, BASE, settle, sleep, log, R, q, waitToast, flat, dlgText, api, uiApprove, SQL, SQLB, PY, ADV, TL, T0B, TODAY } from './_hb.mjs'
log('=== s32-35', new Date().toISOString())
const ev = () => q(`select ce.status from case_evidences ce join cases c on c.id=ce.case_id where c.case_ref='UAT-CO2-003' and ce.status<>'rejected'`).split('\n')[2]?.trim()
const f = await openAs('uat.finance'); const p = f.page
await p.goto(`${BASE}/finance?tab=comp`); await settle(p); await sleep(1200)
await shot(p, R, '59-R6.32-finance-queue-c3c4', { fullPage: true })
for (const [ref, t] of [['UAT-CO1-004', TL.f], ['UAT-CO1-004', TL.a], ['UAT-CO1-004', TL.c], ['UAT-CO2-003', TL.f], ['UAT-CO2-003', TL.a], ['UAT-CO2-003', TL.n]]) {
  const [st, ts] = await uiApprove(p, ref, t, 2)
  log(`R6.32 ${ref} ${t}:`, st.slice(0, 50), ts.at(-1), '| revenues', q(`select count(*) from revenues`).split('\n')[2]?.trim(), '| C3 evidence', ev())
  await sleep(1200)
}
await shot(p, R, '60-R6.32-finance-queue-done', { fullPage: true })
log(q(SQL.rev))
log(q(`select left(target_id::text,8) tid, after_data->'revenue_ids_created' rev, after_data->>'evidence_approved_id' evid from audit_logs where action='approve' and target_type='expenses' and created_at > '${T0B}' order by created_at`))
// R6.33 ADV3
await p.goto(`${BASE}/finance?tab=approval`); await settle(p); await sleep(1000)
const ar = p.locator('tbody tr').filter({ hasText: 'บุญมี ภาคสนาม' }).filter({ hasText: '2,000.00' }).filter({ has: p.getByRole('button', { name: 'อนุมัติ', exact: true }) })
log('ADV3 row:', await ar.count(), flat(await ar.first().innerText().catch(() => '')).slice(0, 200))
await ar.first().getByRole('button', { name: 'อนุมัติ', exact: true }).click(); await sleep(600)
log('R6.33 modal:', await dlgText(p, 700)); await shot(p, R, '61-R6.33-adv3-approve-modal')
const advRes = []; p.on('response', r => { if (r.url().includes('/api/advances/') && r.request().method() !== 'GET') advRes.push(`${r.status()} ${(r.url().split('/api/')[1])}`) })
await p.locator('[role="dialog"]').last().getByRole('button', { name: 'อนุมัติและปล่อยเงิน' }).click()
log('R6.33 toast:', await waitToast(p, 8000)); await sleep(1200); log('R6.33 res', advRes)
log(q(SQL.adv))
// R6.34 guard
const g = q(`select count(*) filter (where e.status='approved') appr, count(*) filter (where e.status not in ('approved','superseded')) not_yet, sum(e.gross_satang) filter (where e.status='approved' and e.payout_batch_item_id is null) base from expenses e where e.payee_id='${PY.in2}'`)
log('R6.34 guard', g)
if (!/\b6\s*\|\s*0\s*\|\s*105000\b/.test(g)) { log('!!! STOP guard in2 ไม่ผ่าน'); process.exit(9) }
// R6.35 probe ผ่าน UI
await p.goto(`${BASE}/finance?tab=payout`); await settle(p); await sleep(1000)
const posts = []; p.on('response', async r => { if (r.request().method() === 'POST' && r.url().endsWith('/api/payout-batches')) posts.push(`${r.status()} ${(await r.text().catch(() => '')).slice(0, 500)}`) })
await p.getByRole('button', { name: '+ สร้างรอบจ่าย' }).click(); await sleep(500)
const d = p.locator('[role="dialog"]').last()
await d.locator('select').first().selectOption('inhouse'); await d.locator('input[type=date]').fill(TODAY); await d.locator('input:not([type=date])').last().fill('UAT IN-2')
await d.getByRole('button', { name: 'สร้างรอบจ่าย' }).click()
const t = await waitToast(p, 8000); await sleep(800)
log('R6.35 POST', posts, 'toast', t)
await shot(p, R, '62-R6.35-unverified-blocked')
await p.keyboard.press('Escape')
log(q(SQLB.pb))
log(q(`select count(*) filter (where payout_batch_item_id is not null) linked_in2 from expenses where payee_id='${PY.in2}'`), q(`select payout_batch_item_id from advances where id='${ADV.A3}'`))
log(q(SQLB.auditNB))
log('5xx', f.serverErrors, f.consoleErrors.slice(0, 3))
await f.browser.close()
