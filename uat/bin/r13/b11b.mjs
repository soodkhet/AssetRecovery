// R13.11 ต่อ — ดูแถวค่าที่พักที่เพิ่งสร้าง (80001) + ปุ่มที่มี + ดูใบเสร็จ
import { openAs, shot, log, settle, sleep, R, BASE, toasts, trackMutations, mainText } from './_h.mjs'
const { browser, context, page } = await openAs('uat.agent.in1', { mobile: true })
const m = trackMutations(page)
await page.goto(`${BASE}/field/expenses`); await settle(page); await sleep(1200)
log('expenses top', await mainText(page, 700))
await page.getByRole('button', { name: 'เบิกแยก', exact: true }).click(); await sleep(1000)
log('tab เบิกแยก', await mainText(page, 1200))
log('buttons', (await page.getByRole('button').allInnerTexts()).map(s => s.trim()).filter(Boolean))
await shot(page, R, '11-hotel-receipt', { fullPage: true })
const rb = page.getByRole('button', { name: /ดูใบเสร็จ/ }).or(page.getByRole('link', { name: /ดูใบเสร็จ/ })).first()
if (await rb.count()) {
  const pop = context.waitForEvent('page', { timeout: 8000 }).catch(() => null)
  await rb.click(); const np = await pop
  if (np) { await np.waitForLoadState().catch(() => {}); const u = np.url(); log('receipt url host/path', u.split('?')[0].slice(0, 160), 'signed?', /token=|sign/.test(u)); await sleep(1000); await shot(np, R, '11-hotel-receipt-open'); await np.close() }
  else { log('no popup', await toasts(page, 1500), m.res); await shot(page, R, '11-hotel-receipt-open') }
}
await browser.close()
