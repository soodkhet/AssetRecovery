// R15c.05 U107 — in1 (มือถือ) ยกเลิก CRT-0006 ผ่านหน้าจอ → PDF ป้ายยกเลิก → เพดานเดือนคืน (เบิกใหม่ ฿500) → ออกใบใหม่แทน
import { writeFileSync } from 'node:fs'
import { openAs, shot, BASE, settle, sleep, toasts, trackMutations, log, R, q, post, DL } from './_h.mjs'
const CRT6 = '20f59bf2-f3f4-47e4-9321-05a072c04699'
const T = new Date().toISOString()
const flat = s => s.replace(/\s+/g, ' ')
const { browser, page, serverErrors, consoleErrors } = await openAs('uat.agent.in1', { mobile: true })
log('== c05', T)
const hb = (d, amt, desc) => ({ expenseDate: d, amountSatang: amt, hotelNights: 1, receiptInCompanyName: false, sharedWithUserId: null, receiptFileUrl: null,
  substituteReceipt: { lines: [{ lineDate: d, description: desc, amountSatang: amt, note: null }] }, note: 'UAT R15c เพดานใบรับรอง' })
log('pre: cap probe ฿1.00:', await post(page, '/api/field/expenses/hotel', hb('2026-11-10', 100, 'ทดสอบเพดานเดือนก่อนยกเลิก'), 400))
const mut = trackMutations(page)
const openList = async () => { await page.goto(`${BASE}/field/expenses`); await settle(page); await sleep(1000); await page.getByRole('button', { name: 'เบิกแยก', exact: true }).click(); await sleep(900) }
const cardOf = no => page.getByText(new RegExp(no)).first().locator('xpath=ancestor::*[.//a[contains(., "ดาวน์โหลดใบรับรอง")]][1]')
await openList()
await cardOf('CRT-2569-0006').getByRole('button', { name: 'ยกเลิกใบรับรอง' }).click(); await sleep(800)
let dlg = page.getByRole('dialog').last()
await dlg.locator('textarea').fill('UAT R15c เจ้าของที่พักออกใบเสร็จจริงให้ภายหลัง')
mut.res.length = 0
await dlg.getByRole('button', { name: 'ยืนยันยกเลิกใบรับรอง' }).click(); await sleep(2500)
log('cancel toasts', await toasts(page, 1200), 'res', mut.res)
await shot(page, R, 'c-05-cancel-result', { fullPage: true })
log('card after cancel', flat(await cardOf('CRT-2569-0006').innerText()))
log(q(`select receipt_number,status,cancel_reason,cancelled_at,deleted_at from substitute_receipts where id='${CRT6}'`))
const r = await page.request.get(`${BASE}/api/substitute-receipts/${CRT6}/pdf`, { failOnStatusCode: false })
writeFileSync(`${DL}/CRT-2569-0006-cancelled.pdf`, await r.body()); log('pdf', r.status(), r.headers()['content-disposition'])
log('cancel again (API):', await post(page, `/api/substitute-receipts/${CRT6}/cancel`, { reason: 'ยกเลิกซ้ำ' }, 300))
// เพดานเดือนคืน ⇒ เบิกค่าที่พักใหม่ ฿500 ผ่านหน้าจอ
await page.getByRole('button', { name: /เบิกที่พัก/ }).click(); await sleep(900)
dlg = page.getByRole('dialog').filter({ hasText: 'เบิกค่าที่พัก' }).last(); await dlg.waitFor()
await dlg.locator('input[type=date]').first().fill('2026-11-10')
await dlg.getByText('ไม่มีใบเสร็จ', { exact: true }).click(); await sleep(600)
await dlg.getByLabel('วันที่จ่าย รายการที่ 1').fill('2026-11-10')
await dlg.getByLabel('รายละเอียดรายจ่าย รายการที่ 1').fill('ค่าที่พักบ้านพักเล็ก ไม่ออกใบเสร็จ (UAT R15c ใช้เพดานที่คืนมา)')
await dlg.getByLabel('จำนวนเงิน (บาท) รายการที่ 1').fill('500')
mut.res.length = 0
await dlg.getByRole('button', { name: 'ส่งคำขอเบิก' }).click(); await sleep(3000)
log('new claim toasts', await toasts(page, 1200), 'res', mut.res)
log(q(`select receipt_number,status,issue_date,total_satang from substitute_receipts where created_at>'${T}' order by created_at`))
// ออกใบใหม่แทน CRT-0006 — เพดานเต็มอีกครั้ง ⇒ คาดว่าถูกปัด
await openList()
await cardOf('CRT-2569-0006').getByRole('button', { name: 'ออกใบใหม่แทน' }).click(); await sleep(900)
dlg = page.getByRole('dialog').last()
log('reissue modal', flat(await dlg.innerText()).slice(0, 700))
mut.res.length = 0
await dlg.getByRole('button', { name: 'ออกใบรับรองใหม่' }).click(); await sleep(2500)
log('reissue#1 res', mut.res, 'dialog', flat(await dlg.innerText()).slice(0, 400))
await shot(page, R, 'c-05-reissue-cap-blocked', { fullPage: true })
log('5xx', serverErrors, consoleErrors.slice(0, 3))
await browser.close()
