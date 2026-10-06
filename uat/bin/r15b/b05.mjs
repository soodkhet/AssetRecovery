// R15b.05 probe สิทธิ์ยกเลิก/ออกใหม่ใบรับรอง (ผูกใบเบิก CRT-0006) — ทุกคำขอคาดว่าไม่เปลี่ยนข้อมูล
import { openAs, log, q, post, get } from './_h.mjs'
const ID = q(`select id from substitute_receipts where receipt_number='CRT-2569-0006'`).split('\n')[2].trim()
const body = { reason: 'UAT R15b probe สิทธิ์ยกเลิก' }
for (const u of ['uat.agent.in2', 'uat.mgr.in', 'uat.account', 'uat.finance', 'uat.exec']) {
  const { browser, page } = await openAs(u, { mobile: u.startsWith('uat.agent') })
  log(u, 'GET list?', await get(page, `/api/substitute-receipts/${ID}/pdf`.replace('/pdf', ''), 160))
  log(u, 'cancel:', await post(page, `/api/substitute-receipts/${ID}/cancel`, body, 260))
  if (u === 'uat.finance') log(u, 'reissue (not cancelled):', await post(page, `/api/substitute-receipts/${ID}/reissue`, { lines: [{ lineDate: '2026-11-09', description: 'probe', amountSatang: 50000, note: null }] }, 300))
  await browser.close()
}
log(q(`select receipt_number,status from substitute_receipts where id='${ID}'`))
