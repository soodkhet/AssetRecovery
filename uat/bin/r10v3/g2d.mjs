// R10g.2 หน้า "นำเข้า Bank Statement" — ดาวน์โหลดแม่แบบอย่างเดียว (ห้ามนำเข้า)
import { openAs, shot, BASE } from '../lib.mjs'
import { log } from './_h.mjs'
const DIR = 'uat/fixtures/downloads-R10v3'
const o = await openAs('uat.account'); const pg = o.page
await pg.goto(BASE + '/accounting'); await pg.waitForLoadState('networkidle')
await pg.locator('main').getByText('กระทบยอด', { exact: true }).first().click(); await pg.waitForTimeout(1200)
const btns = await pg.locator('main').getByRole('button').allInnerTexts(); log('bankrecon buttons', btns.filter((b) => /นำเข้า|Import/i.test(b)).join(' | '))
await pg.locator('main').getByRole('button', { name: /นำเข้า|Import/ }).first().click(); await pg.waitForTimeout(1500)
await shot(pg, 'R10v3', 'g2-bank-statement-modal')
const dl = []
let [d] = await Promise.all([pg.waitForEvent('download', { timeout: 15000 }), pg.getByRole('dialog').getByRole('button', { name: /ดาวน์โหลดไฟล์ตัวอย่าง/ }).click()])
await d.saveAs(`${DIR}/${d.suggestedFilename()}`); dl.push(d.suggestedFilename())
;[d] = await Promise.all([pg.waitForEvent('download', { timeout: 15000 }), pg.getByRole('dialog').getByText('หรือ CSV', { exact: true }).click()])
await d.saveAs(`${DIR}/${d.suggestedFilename()}`); dl.push(d.suggestedFilename())
log('bank template', dl.join(', '), 'srvErr', o.serverErrors.join(';'), 'console', o.consoleErrors.length)
await o.browser.close()
