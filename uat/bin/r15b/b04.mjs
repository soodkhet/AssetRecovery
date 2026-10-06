// R15b.04 ยกเลิกใบรับรอง: probe ไม่มีเหตุผล (API) + ยกเลิกผ่านหน้าจอ in1
import { openAs, shot, BASE, settle, sleep, toasts, trackMutations, log, R, q, post } from './_h.mjs'
const ID = '20f59bf2-f3f4-47e4-9321-05a072c04699'
const { browser, page, serverErrors } = await openAs('uat.agent.in1', { mobile: true })
log('cancel no reason:', await post(page, `/api/substitute-receipts/${ID}/cancel`, {}))
log('cancel blank reason:', await post(page, `/api/substitute-receipts/${ID}/cancel`, { reason: '   ' }))
const mut = trackMutations(page)
await page.goto(`${BASE}/field/expenses`); await settle(page); await sleep(1000)
await page.getByRole('button', { name: 'เบิกแยก', exact: true }).click(); await sleep(900)
const card = page.getByText(/CRT-2569-0006/).first().locator('xpath=ancestor::*[.//button[contains(., "ยกเลิกใบรับรอง")]][1]')
await card.getByRole('button', { name: 'ยกเลิกใบรับรอง' }).click(); await sleep(800)
const dlg = page.getByRole('dialog').last()
log('dialog:', (await dlg.innerText()).replace(/\s+/g, ' ').slice(0, 600))
log('confirm disabled when empty:', await dlg.getByRole('button', { name: 'ยืนยันยกเลิกใบรับรอง' }).isDisabled())
await dlg.locator('textarea').fill('UAT R15b ผู้รับเงินออกใบเสร็จจริงให้ภายหลัง')
await shot(page, R, 'b-04-cancel-modal', { fullPage: true })
mut.res.length = 0
await dlg.getByRole('button', { name: 'ยืนยันยกเลิกใบรับรอง' }).click(); await sleep(2500)
log('toasts', await toasts(page, 1200), 'res', mut.res)
await shot(page, R, 'b-04-cancel-result', { fullPage: true })
log(q(`select receipt_number,status,cancel_reason,deleted_at from substitute_receipts where id='${ID}'`))
log('5xx', serverErrors)
await browser.close()
