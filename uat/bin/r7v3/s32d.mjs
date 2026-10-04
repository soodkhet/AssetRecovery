// R7.32 ต่อ — BUG-120: ดาวน์โหลด PDF 50 ทวิ ใหม่ (016 + 009) หลัง fixer แก้การตัดอักษรท้ายข้อความที่มี "ำ"
import { writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { openAs, shot, R, log, q1, settle, sleep, BASE } from './_h.mjs'
log('=== R7.32d', new Date().toISOString())
const DL = 'uat/fixtures/downloads-R7cv3'
const s = await openAs('uat.account'); const p = s.page
await p.goto(`${BASE}/accounting?tab=documents`); await settle(p); await sleep(1000)
for (const num of ['WHT-2569-016', 'WHT-2569-009']) {
  const id = q1(`select id from wht_certificates where certificate_number='${num}'`)
  const r = await p.request.get(`${BASE}/api/accounting/wht-certificates/${id}/pdf`)
  const b = await r.body(); const f = `${DL}/${num}-after-BUG120.pdf`; writeFileSync(f, b)
  log('32d pdf', num, r.status(), r.headers()['content-type'], r.headers()['content-disposition'], b.length, 'sha256', createHash('sha256').update(b).digest('hex').slice(0, 16), f)
}
const r = await p.request.get(`${BASE}/api/accounting/wht-certificates/${q1(`select id from wht_certificates where certificate_number='WHT-2569-016'`)}/pdf`)
const pp = await s.context.newPage(); await pp.goto(`${BASE}/api/accounting/wht-certificates/${q1(`select id from wht_certificates where certificate_number='WHT-2569-016'`)}/pdf`).catch(e => log('goto pdf', String(e).slice(0, 120))); await sleep(2500)
await shot(pp, R, '32k-pdf-wht016-after-bug120').catch(e => log('shot err', String(e).slice(0, 120)))
log('errs', s.consoleErrors.slice(0, 4), s.serverErrors, r.status())
await s.browser.close()
