// R5.09 (เสริม) กดปุ่มรูป 'ด้านหน้า' ใน modal รายละเอียดเครื่อง → signed URL เปิดได้
import { openAs, shot, BASE, settle, sleep, log, R } from './_h.mjs'
const { browser, context, page, consoleErrors, serverErrors } = await openAs('uat.admin')
const net = []
context.on('response', r => { if (r.url().includes('/storage/v1/object/')) net.push(`${r.status()} ${r.request().method()} ${r.headers()['content-type']} ${r.url().replace(/\?.*$/, '').slice(-90)}`) })
await page.goto(`${BASE}/warehouse`); await settle(page)
await page.getByRole('tab', { name: /^ในคลัง/ }).click(); await sleep(800)
await page.getByText('บริษัท ยูเอที ลิสซิ่ง จำกัด').last().click(); await sleep(800)
await page.locator('tr', { hasText: 'UAT-CO1-001' }).first().getByRole('button', { name: 'ดู', exact: true }).click(); await sleep(1200)
const popupP = context.waitForEvent('page', { timeout: 8000 }).catch(() => null)
await page.locator('[role="dialog"]').last().getByRole('button', { name: 'ด้านหน้า', exact: true }).click(); await sleep(2500)
const pop = await popupP
log('R5.09b popup:', pop ? pop.url().replace(/token=[^&]+/, 'token=…').slice(0, 200) : '(no popup)')
log('R5.09b dialogs:', await page.locator('[role="dialog"]').count(), 'imgs:', await page.locator('[role="dialog"] img').count())
if (pop) { await pop.waitForLoadState().catch(() => {}); await shot(pop, R, 'R5.09-photo-front') } else await shot(page, R, 'R5.09-photo-front')
log('R5.09b storage net:', net, 'console', consoleErrors, 'server', serverErrors)
await browser.close()
