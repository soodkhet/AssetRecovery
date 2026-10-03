import { execFileSync } from 'node:child_process'
// R4.30–R4.32 in1 เงินทดรอง (probe UI/API · ADV1 ดับเบิลคลิก · ADV2 ซ้อน) — แยกจาก s14 หลัง s14 ล้มที่ query หลังสร้างค่าที่พักแล้ว
import { openAs, shot, BASE, settle, sleep, collect, trackMutations, mainText, q, log, post, F } from './_h.mjs'
import { trackApi } from '../r2/_h.mjs'
const R = 'R4v3'
// v3: ตั้ง T0B = เวลาเริ่ม R4b (UTC) ผ่าน env ได้ — ค่าเริ่ม = หลัง R4.23b เสร็จ
const T0B = process.env.T0B ?? '2026-10-03 17:48:30+00'
// v3: คำนวณวันที่ตอนรัน (เวลาไทย) — ห้าม hardcode
const _d = execFileSync('uat/bin/q.sh', ["select to_char((now() at time zone 'Asia/Bangkok')::date,'YYYY-MM-DD'), to_char((now() at time zone 'Asia/Bangkok')::date-1,'YYYY-MM-DD'), to_char((now() at time zone 'Asia/Bangkok')::date+7,'YYYY-MM-DD')"], { encoding: 'utf8' }).split('\n')[3].split('|').map(x => x.trim())
const [TODAY, YESTERDAY, TODAY7] = _d
const flat = s => s.replace(/\s*\n+\s*/g, ' | ')
const { browser, page, consoleErrors, serverErrors } = await openAs('uat.agent.in1', { mobile: true })
const mut = trackMutations(page)
const api = trackApi(page)
log('=== s15 R4b v3', new Date().toISOString())
// R4.30 เงินทดรอง
await page.goto(`${BASE}/field`); await settle(page); await sleep(800)
await page.getByRole('button', { name: 'เปิดเมนู' }).click().catch(() => {}); await sleep(700)
const menu = page.getByRole('link', { name: /เงินทดรองจ่าย/ }).first()
log('R4.30 menu link count:', await menu.count())
if (await menu.count()) { await menu.click(); await settle(page); await sleep(1000) } else { await page.goto(`${BASE}/field/advances`); await settle(page); await sleep(1000) }
log('R4.30 url:', page.url(), await mainText(page, 500))
await shot(page, R, '30-advances-empty')
await page.getByRole('button', { name: /ขอเงินทดรอง/ }).click(); await sleep(800)
const ad = page.getByRole('dialog').filter({ hasText: 'ขอเบิกเงินทดรองจ่าย' }).last(); await ad.waitFor()
log('R4.30 modal:', flat(await ad.innerText()).slice(0, 400))
const aAmt = ad.locator('input[inputmode=decimal]'), aPur = ad.locator('textarea'), aDate = ad.locator('input[type=date]')
log('R4.30 date min:', await aDate.getAttribute('min'))
await shot(page, R, '30-advance-modal')
const aSend = ad.getByRole('button', { name: 'ส่งคำขออนุมัติ' })
const aErr = async () => (await ad.locator('.text-red-600, [role=alert]').allInnerTexts().catch(() => [])).map(s => s.trim()).filter(Boolean)
mut.reqs.length = 0
for (const v of ['0', '-100', '100.505']) { await aAmt.fill(v); await aPur.fill('abc'); await aDate.fill(TODAY7); await aSend.click(); await sleep(600); log(`R4.30 probe amount ${v} + purpose abc:`, await aErr()) }
await shot(page, R, '30-advance-probe')
log('R4.30 probe reqs:', mut.reqs)
log('R4.30 API yesterday:', await post(page, '/api/advances', { requestedSatang: 300000, purpose: 'UAT probe วันย้อนหลัง', dueClearDate: YESTERDAY }))
log('R4.30 API 2026-02-30:', await post(page, '/api/advances', { requestedSatang: 300000, purpose: 'UAT probe วันย้อนหลัง', dueClearDate: '2026-02-30' }))
log(q(`select count(*) adv from advances`))

// R4.31 ADV1 ดับเบิลคลิก
await aAmt.fill('3000'); await aPur.fill('UAT ADV1 สำรองค่าเดินทางติดตามทรัพย์ ต.ค.'); await aDate.fill(TODAY7)
mut.reqs.length = 0; mut.res.length = 0
await aSend.dblclick()
log('R4.31 toasts:', await collect(page, 3500), 'reqs:', mut.reqs, 'res:', mut.res)
await settle(page); await sleep(800)
log('R4.31 list:', await mainText(page, 700))
await shot(page, R, '31-adv1-listed', { fullPage: true })
log(q(`select u.username,a.requested_satang,a.approved_satang,a.status,a.due_clear_date,a.purpose,a.id from advances a join payee_profiles p on p.id=a.payee_id join users u on u.id=p.user_id order by a.created_at`))

// R4.32 ADV2 ซ้อน
await page.getByRole('button', { name: /ขอเงินทดรอง/ }).click(); await sleep(800)
const ad2 = page.getByRole('dialog').filter({ hasText: 'ขอเบิกเงินทดรองจ่าย' }).last(); await ad2.waitFor()
await ad2.locator('input[inputmode=decimal]').fill('1000'); await ad2.locator('textarea').fill('UAT ADV2 ขอซ้อนระหว่าง ADV1 รออนุมัติ'); await ad2.locator('input[type=date]').fill(TODAY7)
mut.res.length = 0
await ad2.getByRole('button', { name: 'ส่งคำขออนุมัติ' }).click()
log('R4.32 toasts:', await collect(page, 3500), 'res:', mut.res)
await settle(page); await sleep(800)
log('R4.32 list:', await mainText(page, 900))
await shot(page, R, '32-adv2-listed', { fullPage: true })
log(q(`select u.username,a.requested_satang,a.approved_satang,a.status,a.due_clear_date,a.purpose,a.id from advances a join payee_profiles p on p.id=a.payee_id join users u on u.id=p.user_id order by a.created_at`))
log(q(`select to_char(a.created_at,'HH24:MI:SS') t,u.username,a.actor_role,a.action,a.target_type,a.after_data->'events' ev from audit_logs a left join users u on u.id=a.actor_id where a.created_at > '${T0B}' and a.target_type='advances'`))
log('console', consoleErrors, 'server', serverErrors)
await browser.close()
