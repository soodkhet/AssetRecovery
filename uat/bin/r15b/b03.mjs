// R15b.03 เพดานต่อใบ/ต่อเดือนของใบรับรองแทนใบเสร็จ (in1 ผ่าน API ของหน้าจอเดียวกัน)
import { openAs, BASE, log, q, post } from './_h.mjs'
const { browser, page } = await openAs('uat.agent.in1', { mobile: true })
const body = (d, amt, desc) => ({ expenseDate: d, amountSatang: amt, hotelNights: 1, receiptInCompanyName: false, sharedWithUserId: null, receiptFileUrl: null,
  substituteReceipt: { lines: [{ lineDate: d, description: desc, amountSatang: amt, note: null }] }, note: 'UAT R15b เพดานใบรับรอง' })
log('per-doc 500.01:', await post(page, '/api/field/expenses/hotel', body('2026-11-04', 50001, 'ทดสอบเกินเพดานต่อใบ')))
for (const [i, d] of ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09'].entries())
  log(`ok #${i + 2}:`, await post(page, '/api/field/expenses/hotel', body(d, 50000, `ค่าที่พักไม่มีใบเสร็จ คืนที่ ${i + 2}`), 300))
log('month cap +1.00:', await post(page, '/api/field/expenses/hotel', body('2026-11-10', 100, 'ทดสอบเกินเพดานต่อเดือน')))
log(q(`select receipt_number,status,issue_date,total_satang from substitute_receipts order by receipt_number`))
await browser.close()
