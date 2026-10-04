// R8.26 exception critical หลังล็อก · R8.27 export ถูกปัด · R8.28 บริหารอนุมัติยกเว้น · R8.29 Export Pack v3
import { mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { openAs, shot, R, ID, log, q, q1, settle, sleep, waitToast, mainText, dlgText, BASE, api, guard2xx, auditSince } from './_h.mjs'
log('=== R8.26-29', new Date().toISOString())
const T = q1('select now()'); log('T', T)
const DL = 'uat/fixtures/downloads-R8v3'; mkdirSync(DL, { recursive: true })
const s = await openAs('uat.account'); const p = s.page
await p.goto(`${BASE}/accounting?tab=documents`); await settle(p); await sleep(1000)
await p.locator('main').getByRole('button', { name: 'บันทึกข้อยกเว้น' }).click(); await sleep(700)
const d = p.locator('[role="dialog"]').last()
log('26 module options', await d.locator('#exception-module option').evaluateAll(o => o.map(x => x.value + '=' + x.textContent)))
await d.locator('#exception-level').selectOption('critical')
await d.locator('#exception-module').selectOption('billing')
const persel = d.locator('select').nth(2); if (await persel.count()) { const v = await persel.inputValue().catch(() => ''); if (!v) await persel.selectOption(ID.PERIOD).catch(() => {}) }
await d.locator('#exception-title').fill('UAT R8 ยังไม่ได้รับ 50 ทวิ ต้นฉบับจาก CO1 (ภาษีถูกหัก 111.90 บาท)')
await d.locator('#exception-description').fill('ลูกค้าหักภาษี ณ ที่จ่าย 3% จากรอบวางบิล ต.ค. 2569 แต่ยังไม่ส่งหนังสือรับรองตัวจริง — ใช้เครดิตภาษีไม่ได้จนกว่าจะได้รับ')
log('26 dlg', await dlgText(p, 1400))
await shot(p, R, '26a-exception-form')
{ const rp = p.waitForResponse(r => r.url().includes('/api/exceptions') && r.request().method() === 'POST', { timeout: 15000 })
  await d.getByRole('button', { name: 'บันทึกข้อยกเว้น' }).click()
  const resp = await rp; log('26 resp', resp.status(), (await resp.text()).slice(0, 500)) }
log('26 toast', await waitToast(p)); await settle(p); await sleep(800)
log('26 after', await mainText(p, 1600))
await shot(p, R, '26b-exception-open', { fullPage: true })
const EXC = q1(`select id from exceptions where status='open' order by created_at desc limit 1`); log('EXC', EXC)
log('26 sql', q(`select level, status, module, title, (select year_be||'-'||month from accounting_periods ap where ap.id=e.period_id) per from exceptions e order by created_at`))
// R8.27
await p.goto(`${BASE}/accounting?tab=closing`); await settle(p); await sleep(800)
log('27 closing', await mainText(p, 1100)); await shot(p, R, '27a-closing-critical', { fullPage: true })
await p.goto(`${BASE}/accounting?tab=export`); await settle(p); await sleep(1000)
log('27 export tab', await mainText(p, 1100))
await p.locator('main').getByRole('button', { name: 'สร้างชุดเอกสารใหม่' }).click(); await sleep(800)
{ const d2 = p.locator('[role="dialog"]').last(); const sel = d2.locator('select').first(); if (!(await sel.inputValue())) await sel.selectOption(ID.PERIOD); await sleep(500)
  await d2.locator('textarea').fill('probe R8 ขณะมี critical')
  log('27 dlg', await dlgText(p, 1200)); await shot(p, R, '27b-export-modal-blocked')
  const btn = d2.getByRole('button', { name: 'ดาวน์โหลดไฟล์ (.zip)' })
  log('27 btn disabled', await btn.isDisabled())
  if (!(await btn.isDisabled())) { const rp = p.waitForResponse(r => r.url().includes('/api/accounting/export-pack') && r.request().method() === 'POST', { timeout: 60000 }); await btn.click(); const x = await rp; const t = `${x.status()} ${(await x.text()).slice(0, 400)}`; log('27 ui export', t); guard2xx('27ui', t); log('27 toast', await waitToast(p)); await shot(p, R, '27c-export-blocked-toast') }
  await p.keyboard.press('Escape') }
let r = await api(p, 'POST', '/api/accounting/export-pack', { periodId: ID.PERIOD, note: 'probe' }); log('27 api export', r); guard2xx('27', r)
log('27 export_records', q1('select count(*) from export_records'))
r = await api(p, 'POST', `/api/exceptions/${EXC}/authorize`, { authorizeNote: 'probe' }); log('27 account authorize', r); guard2xx('27a', r)
const f = await openAs('uat.finance')
r = await api(f.page, 'POST', `/api/exceptions/${EXC}/authorize`, { authorizeNote: 'probe' }); log('27 finance authorize', r); guard2xx('27f', r)
// R8.28
const e = await openAs('uat.exec'); const ep = e.page
r = await api(ep, 'POST', `/api/exceptions/${EXC}/authorize`, { authorizeNote: '  ' }); log('28 exec authorize ว่าง', r); guard2xx('28e', r)
await ep.goto(`${BASE}/accounting?tab=documents`); await settle(ep); await sleep(1000)
log('28 exec documents', await mainText(ep, 1500))
await shot(ep, R, '28a-exec-exceptions', { fullPage: true })
const row = ep.locator('tbody tr').filter({ hasText: 'UAT R8' }).first()
log('28 row buttons', (await row.locator('button').allInnerTexts()).join(' / '))
await row.getByRole('button', { name: /อนุมัติยกเว้น/ }).first().click(); await sleep(800)
const d3 = ep.locator('[role="dialog"]').last()
const ok = d3.getByRole('button', { name: /ยืนยันอนุมัติยกเว้น/ })
log('28 dlg', await dlgText(ep, 1400), '| confirm disabled (ว่าง):', await ok.isDisabled().catch(() => '?'))
await shot(ep, R, '28b-authorize-modal-empty')
await d3.locator('textarea').fill('ยอมรับความเสี่ยงสำหรับงวด ต.ค. 2569 เท่านั้น — ห้ามใช้เครดิตภาษี 111.90 บาทจนกว่าได้ 50 ทวิ ต้นฉบับ ติดตามกับ CO1')
await shot(ep, R, '28c-authorize-modal-filled')
{ const rp = ep.waitForResponse(x => x.url().includes(`/api/exceptions/${EXC}/authorize`), { timeout: 15000 }); await ok.click(); const x = await rp; log('28 authorize', x.status(), (await x.text()).slice(0, 500)) }
log('28 toast', await waitToast(ep)); await settle(ep); await sleep(800)
log('28 after', await mainText(ep, 1500)); await shot(ep, R, '28d-exception-authorized', { fullPage: true })
r = await api(ep, 'POST', `/api/exceptions/${EXC}/authorize`, { authorizeNote: 'ซ้ำ probe อนุมัติยกเว้นอีกครั้ง' }); log('28 authorize ซ้ำ', r); guard2xx('28dup', r)
log('28 sql', q(`select status, level, authorized_by=(select id from users where username='uat.exec') by_exec, left(authorize_note,60) note, authorized_at from exceptions where id='${EXC}'`))
await ep.goto(`${BASE}/accounting?tab=closing`); await settle(ep); await sleep(800)
log('28 closing', await mainText(ep, 1100)); await shot(ep, R, '28e-closing-after-authorize', { fullPage: true })
// R8.29
const before = q('select version, status, left(file_hash,16) h from export_records order by version'); log('29 before', before)
await p.goto(`${BASE}/accounting?tab=export`); await settle(p); await sleep(1000)
await p.locator('main').getByRole('button', { name: 'สร้างชุดเอกสารใหม่' }).click(); await sleep(800)
let rec
{ const d4 = p.locator('[role="dialog"]').last(); const sel = d4.locator('select').first(); if (!(await sel.inputValue())) await sel.selectOption(ID.PERIOD); await sleep(500)
  await d4.locator('textarea').fill('UAT R8 ชุดที่ 3 หลังรายการปรับปรุง A1')
  log('29 dlg', await dlgText(p, 1400)); await shot(p, R, '29a-export-modal-v3')
  const rp = p.waitForResponse(x => x.url().includes('/api/accounting/export-pack') && x.request().method() === 'POST', { timeout: 90000 })
  await d4.getByRole('button', { name: 'ดาวน์โหลดไฟล์ (.zip)' }).click()
  const x = await rp; let j = {}; try { j = await x.json() } catch {} log('29 resp', x.status(), JSON.stringify(j).slice(0, 900)); rec = j.data }
log('29 toast', await waitToast(p)); await sleep(3000); await settle(p)
log('29 history', await mainText(p, 2000)); await shot(p, R, '29b-export-history-v3', { fullPage: true })
if (rec?.id) {
  const res = await p.request.get(`${BASE}/api/accounting/export-history/${rec.id}/download`)
  const b = await res.body(); const fn = `${DL}/export-pack-v${rec.version}.zip`; writeFileSync(fn, b)
  log('29 dl', res.status(), res.headers()['content-type'], b.length, 'sha256', createHash('sha256').update(b).digest('hex'), fn)
}
log('29 after', q('select id, version, status, file_hash, file_urls from export_records order by version'))
log('audit since T', q(auditSince(T)))
log('errs', s.serverErrors, e.serverErrors, f.serverErrors, s.consoleErrors.slice(0, 3), e.consoleErrors.slice(0, 3))
await Promise.all([s, e, f].map(x => x.browser.close()))
