// R15c.06 ออกใบใหม่แทน CRT-0006: เพดานเต็ม ⇒ ปัด → ยกเลิก CRT-0005 → ออกใบใหม่แทน 0006 สำเร็จ
import { writeFileSync } from 'node:fs'
import { openAs, shot, BASE, settle, sleep, toasts, trackMutations, log, R, q, DL } from './_h.mjs'
const T = new Date().toISOString()
const flat = s => s.replace(/\s+/g, ' ')
const { browser, page, serverErrors, consoleErrors } = await openAs('uat.agent.in1', { mobile: true })
log('== c06', T)
const mut = trackMutations(page)
const openList = async () => { await page.goto(`${BASE}/field/expenses`); await settle(page); await sleep(1000); await page.getByRole('button', { name: 'เบิกแยก', exact: true }).click(); await sleep(900) }
const cardOf = no => page.getByText(new RegExp(no)).first().locator('xpath=ancestor::*[.//a[contains(., "ดาวน์โหลดใบรับรอง")]][1]')
async function reissue(tag) {
  await openList()
  await cardOf('CRT-2569-0006').getByRole('button', { name: 'ออกใบใหม่แทน' }).click(); await sleep(900)
  const dlg = page.getByRole('dialog').last()
  await dlg.getByLabel('วันที่จ่าย รายการที่ 1').fill('2026-11-09')
  await dlg.getByLabel('รายละเอียดรายจ่าย รายการที่ 1').fill('ค่าที่พักไม่มีใบเสร็จ คืนที่ 6 (ออกใหม่แทนใบที่ยกเลิก)')
  await dlg.getByLabel('จำนวนเงิน (บาท) รายการที่ 1').fill('500')
  mut.res.length = 0
  await dlg.getByRole('button', { name: 'ออกใบรับรองใหม่' }).click(); await sleep(2500)
  log(tag, 'res', mut.res, 'toasts', await toasts(page, 800), 'dialog', (await dlg.isVisible()) ? flat(await dlg.innerText()).slice(0, 300) : '(closed)')
  await shot(page, R, `c-06-${tag}`, { fullPage: true })
  if (await dlg.isVisible()) await dlg.getByRole('button', { name: 'ปิด' }).click().catch(() => {})
}
await reissue('reissue-cap-full')
await openList()
await cardOf('CRT-2569-0005').getByRole('button', { name: 'ยกเลิกใบรับรอง' }).click(); await sleep(800)
const c = page.getByRole('dialog').last()
await c.locator('textarea').fill('UAT R15c คืนเพดานเพื่อทดสอบออกใบใหม่แทน CRT-0006')
mut.res.length = 0
await c.getByRole('button', { name: 'ยืนยันยกเลิกใบรับรอง' }).click(); await sleep(2500)
log('cancel 0005', mut.res, await toasts(page, 800))
await reissue('reissue-ok')
await openList()
log('card 0006', flat(await cardOf('CRT-2569-0006').innerText()))
log(q(`select receipt_number,status,expense_id,total_satang,cancel_reason from substitute_receipts where created_at>'${T}' or cancelled_at>'${T}' order by receipt_number`))
log(q(`select receipt_number,status,expense_id from substitute_receipts where expense_id='e5413f80-474a-4145-a88f-f79743a2d81d' order by receipt_number`))
const id8 = q(`select id from substitute_receipts where expense_id='e5413f80-474a-4145-a88f-f79743a2d81d' and status<>'cancelled'`).split('\n')[2]?.trim()
if (id8) { const r = await page.request.get(`${BASE}/api/substitute-receipts/${id8}/pdf`); writeFileSync(`${DL}/CRT-reissued.pdf`, await r.body()); log('pdf new', r.status(), r.headers()['content-disposition']) }
log(q(`select action,target_type,reason from audit_logs where created_at>'${T}' and action<>'login' order by created_at`))
log('5xx', serverErrors, consoleErrors.slice(0, 3))
await browser.close()
