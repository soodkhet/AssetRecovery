// R5.13 probe หลังมีล็อต + PDF/Excel · R5.14 ยืนยันโดยไม่แนบใบเซ็นรับ
import { writeFileSync } from 'node:fs'
import { openAs, shot, BASE, settle, sleep, dlgText, mainText, log, q, api, guard2xx, R, SQL, A, CO1, CO2, LOT1 } from './_h.mjs'
const { browser, page, consoleErrors, serverErrors } = await openAs('uat.admin')
log('=== s13-14', new Date().toISOString())
const TODAY = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10)
const L = { companyId: CO1, type: 'finance_pickup', scheduledAt: `${TODAY}T10:00:00+07:00` }
for (const [k, m, p, b] of [
  ['a', 'POST', '/api/handover-lots', { ...L, assetIds: [A.C1] }],
  ['b', 'POST', '/api/handover-lots', { companyId: CO2, assetIds: [A.C5], type: 'finance_pickup', scheduledAt: `${TODAY}T10:00:00+07:00` }],
  ['c', 'POST', `/api/assets/${A.C1}/reject-intake`, { rejectReason: 'ทดสอบ' }],
]) { const r = await api(page, m, p, b); log(`R5.13 ${k}:`, r); guard2xx(`R5.13 ${k}`, r) }
log(q(SQL.seq))
// หน้าจอ
await page.goto(`${BASE}/warehouse`); await settle(page)
await page.getByRole('tab', { name: /^รอส่งมอบ/ }).click(); await sleep(900)
await page.getByRole('button', { name: 'ดูรายการ' }).first().click(); await sleep(1200); await settle(page)
log('R5.13 lot detail:', await mainText(page, 1500))
log('R5.13 links:', JSON.stringify(await page.locator('main a, main button').evaluateAll(els => els.map(e => `${e.tagName}:${e.innerText.trim()}${e.href ? '→' + new URL(e.href).pathname : ''}`).filter(s => /Excel|PDF|แนบ|เอกสาร/.test(s)))))
await shot(page, R, 'R5.13-lot1-detail', { fullPage: true })
let r = await page.request.get(`${BASE}/api/handover-lots/${LOT1}/pdf`)
log('R5.13 pdf:', r.status(), r.headers()['content-type'], r.headers()['content-disposition'])
if (r.ok()) writeFileSync('uat/shots/R5v2/R5.13-DLV-2569-003.pdf', await r.body())
r = await page.request.get(`${BASE}/api/handover-lots/${LOT1}/export-excel`)
log('R5.13 xlsx:', r.status(), r.headers()['content-type'], r.headers()['content-disposition'])
if (r.ok()) writeFileSync('uat/shots/R5v2/R5.13-LOT-2569-003.xlsx', await r.body())
// R5.14
await page.goto(`${BASE}/warehouse`); await settle(page)
await page.getByRole('tab', { name: /^รอส่งมอบ/ }).click(); await sleep(900)
await page.getByRole('button', { name: 'แนบเอกสาร', exact: true }).first().click(); await sleep(1000)
log('R5.14 modal:', await dlgText(page, 1400))
const dlg = page.locator('[role="dialog"]').last()
log('R5.14 confirm disabled:', await dlg.getByRole('button', { name: 'ยืนยันส่งมอบสำเร็จ' }).isDisabled())
await shot(page, R, 'R5.14-confirm-disabled')
await dlg.getByRole('button', { name: 'ยกเลิก' }).click(); await sleep(400)
r = await api(page, 'PATCH', `/api/handover-lots/${LOT1}/confirm`, {}); log('R5.14 confirm {}:', r); guard2xx('R5.14', r)
log('console', consoleErrors, 'server', serverErrors)
await browser.close()
log(q(`select lot_number,status from handover_lots order by 1`)); log(q(`select case_ref,asset_status from assets order by 1`))
log(q(`select x.status,count(*) from expenses x group by 1`))
log(q(`select count(*) audit_after_lot2 from audit_logs where created_at > '2026-10-03 18:45:30+00' and action not in ('login','logout')`))
