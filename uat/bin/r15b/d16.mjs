// R15b.16 probe เคลียร์เงินทดรองพร้อมใบรับรองแทนใบเสร็จ (in2) — คาดว่าโดนงวด ต.ค. ล็อก (เคลียร์ใช้วันที่ทำรายการ)
import { openAs, log, q, BASE, fmt } from './_h.mjs'
const { browser, page } = await openAs('uat.agent.in2', { mobile: true })
const body = { usedSatang: 30000, returnMethod: 'payout_offset', receiptFileUrl: null, note: 'UAT R15b probe', substituteReceipt: { lines: [{ lineDate: '2026-10-05', description: 'ค่าทางด่วน ไม่มีใบเสร็จ', amountSatang: 30000, note: null }] } }
for (const m of ['post', 'patch']) log(m, 'settle:', await fmt(await page.request[m](`${BASE}/api/advances/1959af6d-be83-40dd-9f8f-16d537785bbd/settle`, { data: body, failOnStatusCode: false }), 400))
log(q(`select status, used_satang from advances where id='1959af6d-be83-40dd-9f8f-16d537785bbd'`)); log(q(`select count(*) from substitute_receipts where advance_id is not null`))
await browser.close()
