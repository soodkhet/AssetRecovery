// R13.11 ค่าที่พัก (เบิกแยก) 800.00 + probe 800.01 + ดูใบเสร็จ · R13.12 ขอเงินทดรอง ADV5 500.00
import { openAs, shot, log, settle, sleep, R, q, BASE, toasts, trackMutations, mainText, F } from './_h.mjs'
const TODAY = '2026-10-05', TODAY7 = '2026-10-12'
const T = new Date().toISOString()
const flat = s => s.replace(/\s*\n+\s*/g, ' | ')
const { browser, context, page, serverErrors } = await openAs('uat.agent.in1', { mobile: true })
const m = trackMutations(page)
if (process.env.SKIP11 !== '1') {
await page.goto(`${BASE}/field/expenses`); await settle(page); await sleep(1200)
await page.getByRole('button', { name: 'เบิกแยก', exact: true }).click(); await sleep(1000)
await page.getByRole('button', { name: /เบิกที่พัก/ }).click(); await sleep(1000)
const dlg = page.getByRole('dialog').filter({ hasText: 'เบิกค่าที่พัก' }).last(); await dlg.waitFor()
log('modal', flat(await dlg.innerText()).slice(0, 500))
const send = dlg.getByRole('button', { name: 'ส่งคำขอเบิก' })
const errText = async () => (await dlg.locator('.text-red-600, [role=alert], .text-rose-600').allInnerTexts().catch(() => [])).map(s => s.trim()).filter(Boolean)
await dlg.locator('input[type=date]').fill(TODAY)
const [ch] = await Promise.all([page.waitForEvent('filechooser'), dlg.getByText(/แตะเพื่อแนบใบเสร็จ/).click()])
await ch.setFiles(F('R4-C1-photo.jpg')); await sleep(1500)
await dlg.locator('textarea').fill('UAT R13 ค้างคืนหลังปิด 901/007')
const amt = dlg.locator('input[inputmode=decimal]')
await amt.fill('800.01'); m.res.length = 0; await send.click(); await sleep(1500)
log('probe 800.01 inline', await errText(), 'toasts', await toasts(page, 1500), 'res', m.res.splice(0))
await shot(page, R, '11-hotel-probe-800-01')
await amt.fill('800'); await send.click()
log('800 toasts', await toasts(page, 3500), 'res', m.res.splice(0))
await settle(page); await sleep(800)
log('tab เบิกแยก', await mainText(page, 900))
const rb = page.getByRole('button', { name: /ดูใบเสร็จ/ }).first()
log('ดูใบเสร็จ count', await page.getByRole('button', { name: /ดูใบเสร็จ/ }).count(), 'links', await page.getByRole('link', { name: /ดูใบเสร็จ/ }).count())
await shot(page, R, '11-hotel-receipt', { fullPage: true })
const target = (await rb.count()) ? rb : page.getByRole('link', { name: /ดูใบเสร็จ/ }).first()
if (await target.count()) {
  const pop = context.waitForEvent('page', { timeout: 8000 }).catch(() => null)
  await target.click(); const np = await pop
  if (np) { await np.waitForLoadState().catch(() => {}); log('receipt tab url', np.url().replace(/token=[^&]+/, 'token=…').slice(0, 200)); const r = await np.request.get(np.url()).catch(() => null); log('receipt status', r?.status(), r?.headers()['content-type']); await np.close() }
  else log('no popup; toasts', await toasts(page, 1500), 'res', m.res.splice(0))
}
}
// R13.12
await page.goto(`${BASE}/field/advances`); await settle(page); await sleep(1000)
await page.getByRole('button', { name: /ขอเงินทดรอง/ }).click(); await sleep(800)
const ad = page.getByRole('dialog').filter({ hasText: 'ขอเบิกเงินทดรองจ่าย' }).last(); await ad.waitFor()
await ad.locator('input[inputmode=decimal]').fill('500'); await ad.locator('textarea').fill('UAT R13 ค่าเดินทาง'); await ad.locator('input[type=date]').fill(TODAY7)
await shot(page, R, '12-adv5-form')
await ad.getByRole('button', { name: 'ส่งคำขออนุมัติ' }).click()
log('adv toasts', await toasts(page, 3500), 'res', m.res.splice(0))
await settle(page); await sleep(800)
log('advances', await mainText(page, 700)); await shot(page, R, '12-adv5-listed', { fullPage: true })
log('5xx', serverErrors)
await browser.close()
log(q(`select x.id,x.expense_type,x.gross_satang,x.status,x.expense_date,x.receipt_file_url from expenses x where x.expense_type='hotel' and x.created_at>'${T}'`))
log(q(`select id,status,requested_satang,purpose,due_clear_date from advances where created_at>'${T}'`))
log(q(`select u.username,n.event_code,n.title,n.body from notifications n join users u on u.id=n.user_id where n.created_at>'${T}' order by n.created_at`))
