// R7.27 ภ.ง.ด.3/53 + PDF 016/009 (uat.account) — ห้ามกด Mark Filed
import { mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { openAs, shot, R, log, q, settle, sleep, mainText, BASE } from './_h.mjs'
log('=== R7.27', new Date().toISOString())
const DL = 'uat/fixtures/downloads-R7cv3'; mkdirSync(DL, { recursive: true })
const ids = q("select certificate_number||'='||id from wht_certificates where certificate_number in ('WHT-2569-009','WHT-2569-016')").split('\n').map(x => x.trim()).filter(x => x.startsWith('WHT-')).map(x => x.split('='))
const s = await openAs('uat.account'); const p = s.page
await p.goto(`${BASE}/accounting?tab=wht`); await settle(p); await sleep(1200)
const mt = await mainText(p, 4000)
const i = mt.indexOf('สรุปรอบนำส่ง'); log('27 summary', mt.slice(i, i + 420))
await shot(p, R, '27a-wht-pnd-summary')
await p.locator('main').getByRole('button', { name: 'ยกเลิก', exact: true }).first().click().catch(e => log('filter err', e.message.slice(0, 80)))
await settle(p); await sleep(800)
log('27 filter cancelled rows', (await p.locator('tbody tr').allInnerTexts()).map(x => x.replace(/\s+/g, ' ')).slice(0, 5))
await shot(p, R, '27b-wht-filter-cancelled')
for (const [num, id] of ids) {
  const r = await p.request.get(`${BASE}/api/accounting/wht-certificates/${id}/pdf`)
  const b = await r.body(); const f = `${DL}/${num}.pdf`; writeFileSync(f, b)
  log('27 pdf', num, r.status(), r.headers()['content-type'], r.headers()['content-disposition'], b.length, 'sha256', createHash('sha256').update(b).digest('hex').slice(0, 16), f)
}
log('27 api summary', (await (await p.request.get(`${BASE}/api/accounting/wht-filing-summary`)).text()).slice(0, 500))
log('27 errs', s.consoleErrors.slice(0, 4), s.serverErrors)
await s.browser.close()
