// R4.26–R4.28 v2 in2 มือถือ: เห็นการตีกลับ (กระดิ่ง → /field/tracking) · probe ส่งใหม่ไม่แก้ไฟล์ (UI+API) · แทนรูปสินค้า v1→v2 ส่งใหม่ · หน้าเบิก/รายได้
import { openAs, shot, BASE, settle, sleep, collect, trackMutations, mainText, q, log, C, post, pick, F, SQL } from './_h.mjs'
import { trackApi } from '../r2/_h.mjs'
const R = 'R4v2'
const T0B = '2026-10-03 12:45:00+00'
const flat = s => s.replace(/\s*\n+\s*/g, ' | ')
log('=== s13 R4b v2', new Date().toISOString())
const { browser, context, page, consoleErrors, serverErrors } = await openAs('uat.agent.in2', { mobile: true })
const mut = trackMutations(page)
const api = trackApi(page)
await page.goto(`${BASE}/field`); await settle(page); await sleep(1000)
const bell = page.getByRole('button', { name: /แจ้งเตือน/ }).first()
await bell.click(); await sleep(1200)
const panel = flat(await page.locator('body').innerText()); const pi = panel.indexOf('แจ้งเตือนล่าสุด')
log('R4.26 bell panel:', panel.slice(pi, pi + 400))
await shot(page, R, '26-in2-bell')
await page.getByText('หลักฐานปิดงานถูกตีกลับ').first().click(); await sleep(2000); await settle(page)
log('R4.26 after click url:', page.url())
const mt = await mainText(page, 900)
log('R4.26 tracking:', mt, '404?', mt.includes('404'))
await shot(page, R, '26-in2-tracking-revision', { fullPage: true })
const block = page.locator('div.border-orange-300', { hasText: 'นางมณี ส่งช้า' }).first()
log('R4.26 block buttons:', await block.getByRole('button').allInnerTexts())
await block.getByRole('button', { name: /แก้ไขหลักฐาน/ }).click()
let dlg = page.getByRole('dialog').last(); await dlg.waitFor(); await sleep(1500)
const dt = flat(await dlg.innerText())
log('R4.26 dialog:', dt.slice(0, 1300))
log('R4.26 has Draft btn:', await dlg.getByRole('button', { name: 'บันทึก Draft' }).count(), 'checkin btn:', await dlg.getByRole('button', { name: /แตะเพื่อเช็คอิน/ }).count())
await shot(page, R, '26-in2-revision-dialog', { fullPage: true })
// UI probe ส่งทันที
mut.reqs.length = 0
await dlg.getByRole('button', { name: 'ส่งกลับยืนยันอีกครั้ง' }).click()
log('R4.26 UI probe toasts:', await collect(page, 2500), 'reqs:', mut.reqs)
await shot(page, R, '26-in2-no-revision-toast')
// API probe
const ev = JSON.parse(q(`select json_build_object('p',photos,'v',videos,'pp',product_photos,'a',audio_url)::text from case_evidences where case_id='${C.C4}' and status='rejected'`).split('\n')[2])
log('R4.26 original paths:', ev)
log('R4.26 API resubmit same files:', await post(page, `/api/field/cases/${C.C4}/resubmit-close`, { photos: ev.p, videos: ev.v, productPhotos: ev.pp, audioUrl: ev.a, note: 'แก้แค่ข้อความ' }))
log('R4.26 API checkin:', await post(page, `/api/field/cases/${C.C4}/checkin`, { latitude: 13.77, longitude: 100.5737 }))
log(q(`select (select count(*) from expenses where case_id='${C.C4}') ex,(select count(*) from case_evidences where case_id='${C.C4}') ev,(select count(*) from check_ins where case_id='${C.C4}') ci,(select status from case_assignments where case_id='${C.C4}' and status<>'reassigned_away') asg,(select count(*) from audit_logs where created_at>'${T0B}' and action<>'login') aud`))

// R4.27 แทนรูปสินค้า v1 → v2
const del = dlg.getByRole('button', { name: 'ลบรูปสินค้ายืนยันลำดับที่ 1' })
log('R4.27 del btn:', await del.count())
mut.reqs.length = 0
await del.click(); await sleep(800)
if (await page.getByRole('alertdialog').count()) { log('R4.27 confirm dialog:', flat(await page.getByRole('alertdialog').last().innerText())) }
log('R4.27 after delete reqs:', mut.reqs, 'pp section:', (flat(await dlg.innerText()).match(/รูปสินค้ายืนยัน[^|]*\|[^|]*\|[^|]*/) || [''])[0])
await pick(page, dlg, 'รูปสินค้ายืนยัน', F('R4-C4-product-v2.jpg'))
log('R4.27 after pick reqs:', mut.reqs, 'api:', api.slice(-4))
await shot(page, R, '27-in2-product-v2', { fullPage: true })
mut.reqs.length = 0; mut.res.length = 0
await dlg.getByRole('button', { name: 'ส่งกลับยืนยันอีกครั้ง' }).click()
log('R4.27 toasts:', await collect(page, 4500), 'res:', mut.res)
await settle(page); await sleep(1000)
log('R4.27 tracking after:', await mainText(page, 500))
await shot(page, R, '27-in2-tracking-after')
await page.goto(`${BASE}/field/closed`); await settle(page); await sleep(1000)
log('R4.27 closed:', await mainText(page, 600))
await shot(page, R, '27-in2-closed')
log(q(`select c.case_ref,a.status from case_assignments a join cases c on c.id=a.case_id where c.case_ref='UAT-CO1-004' and a.status<>'reassigned_away'`))
log(q(`select e.status,cardinality(e.photos) p,cardinality(e.videos) v,cardinality(e.product_photos) pp,e.product_photos,e.note,(select count(*) from jsonb_object_keys(coalesce(e.file_hashes,'{}'::jsonb))) hashed,e.reject_reason,e.submitted_at from case_evidences e where e.case_id='${C.C4}' order by e.submitted_at, e.created_at`))
log(q(`select regexp_replace(k.key,'^.*/[0-9a-f-]{36}-','') f,e.status,k.value->>'sha256' sha from case_evidences e, jsonb_each(e.file_hashes) k where e.case_id='${C.C4}' order by e.created_at,1`))
log(q(`select x.expense_type,x.gross_satang,x.status,x.expense_date,x.comp_plan_id,x.comp_plan_version,x.approval_step_total,x.id,x.superseded_by_expense_id,n.expense_type new_type,to_char(x.created_at,'HH24:MI:SS') ct from expenses x left join expenses n on n.id=x.superseded_by_expense_id where x.case_id='${C.C4}' order by x.created_at,x.expense_type`))
log(q(`select expense_type,count(*) from expenses where case_id='${C.C4}' and status<>'superseded' group by 1`))
log(q(`select (select count(*) from check_ins where case_id='${C.C4}') ci,(select count(*) from assets where case_id='${C.C4}') assets,(select count(*) from revenues) revenues,(select count(*) from close_case_drafts) drafts`))
log(q(`select to_char(a.created_at,'HH24:MI:SS') t,u.username,a.actor_role,a.action,a.target_type,a.target_id,a.reason,a.after_data->'events' ev from audit_logs a left join users u on u.id=a.actor_id where a.created_at > '${T0B}' and a.action<>'login' order by a.created_at`))
log(q(`select a.target_id,a.before_data->>'status' b,a.after_data->>'status' af,a.after_data->>'supersededByExpenseId' sb,left(a.after_data::text,300) after from audit_logs a where a.created_at > '${T0B}' and a.target_type='expenses' order by a.created_at`))
log(q(`select left(a.after_data::text,700) after from audit_logs a where a.created_at > '${T0B}' and a.target_type='case_assignments' and a.action='status_change' order by a.created_at`))
log(q(`select to_char(n.created_at,'HH24:MI:SS') t,u.username,n.event_code,n.title,n.body,n.link_path from notifications n join users u on u.id=n.user_id where n.created_at > '${T0B}' order by n.created_at`))

// R4.28 หน้าเบิก/รายได้
await page.goto(`${BASE}/field/expenses`); await settle(page); await sleep(1200)
log('R4.28 expenses:', await mainText(page, 1200))
await shot(page, R, '28-in2-expenses', { fullPage: true })
const fsel = page.locator('main select').first()
if (await fsel.count()) {
  log('R4.28 filter options:', (await fsel.locator('option').allInnerTexts()).join(' / '))
  const opt = (await fsel.locator('option').allInnerTexts()).find(o => o.includes('แทนที่'))
  if (opt) { await fsel.selectOption({ label: opt }); await settle(page); await sleep(900); log('R4.28 filter superseded:', await mainText(page, 900)); await shot(page, R, '28-in2-expenses-superseded', { fullPage: true }) }
} else {
  const chips = await page.getByRole('button').allInnerTexts(); log('R4.28 buttons:', chips.join(' / ').slice(0, 400))
  const sb = page.getByRole('button', { name: /แทนที่/ }).first()
  if (await sb.count()) { await sb.click(); await sleep(900); log('R4.28 filter superseded:', await mainText(page, 900)); await shot(page, R, '28-in2-expenses-superseded', { fullPage: true }) }
}
await page.goto(`${BASE}/field/income`); await settle(page); await sleep(1200)
log('R4.28 income:', await mainText(page, 900))
await shot(page, R, '28-in2-income', { fullPage: true })
await page.goto(`${BASE}/field`); await settle(page); await sleep(1000)
log('R4.28 dashboard:', await mainText(page, 400))
log('console', consoleErrors, 'server', serverErrors)
await browser.close()
