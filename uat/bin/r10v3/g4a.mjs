// R10g.4a UAT-CO1-902: โหมดแยก แนบสัญญา+บัตร ไม่แนบรูปสินค้า → บันทึก → ส่งตรวจ (คาดไม่ได้)
import { openAs, shot, BASE } from '../lib.mjs'
import { log } from './_h.mjs'
const F = 'uat/fixtures/files/R10g/'
const o = await openAs('uat.admin'); const pg = o.page
const resps = []; pg.on('response', async (x) => { if (/\/api\/cases\//.test(x.url()) && x.request().method() !== 'GET') resps.push(x.request().method() + ' ' + x.url().replace(BASE, '') + ' ' + x.status() + ' ' + (x.status() >= 400 ? (await x.text().catch(() => '')).slice(0, 220) : '')) })
await pg.goto(BASE + '/cases/submit'); await pg.waitForLoadState('networkidle')
const row = pg.locator('tr', { hasText: 'UAT-CO1-902' })
await row.getByRole('button', { name: 'แก้ไข' }).click(); await pg.waitForTimeout(1000)
const dlg = pg.getByRole('dialog')
log('mode checked:', await dlg.getByRole('radio', { name: 'แยกตามประเภท' }).isChecked())
await dlg.locator('div.rounded-lg', { hasText: 'สัญญาเช่าซื้อ/สัญญาผ่อนชำระ' }).last().locator('input[type=file]').setInputFiles(F + 'R10g-902-contract.pdf')
await dlg.locator('div.rounded-lg', { hasText: 'บัตรประชาชน/Passport ลูกหนี้' }).last().locator('input[type=file]').setInputFiles(F + 'R10g-902-idcard.png')
await pg.waitForTimeout(500)
await dlg.getByText('รูปแบบเอกสารที่ได้รับ').scrollIntoViewIfNeeded(); await shot(pg, 'R10v3', 'g4-01-separate-staged')
await dlg.getByRole('button', { name: 'บันทึกการแก้ไข' }).click(); await pg.waitForTimeout(5000)
log('dialog closed=', !(await dlg.isVisible().catch(() => false)))
await row.getByRole('button', { name: 'ส่งตรวจสอบเคส' }).click(); await pg.waitForTimeout(1500)
if (await pg.getByRole('dialog').isVisible().catch(() => false)) { log('submit dialog:', (await pg.getByRole('dialog').innerText()).slice(0, 300).replace(/\n/g, ' ')); }
log('screen:', ((await pg.locator('body').innerText()).match(/[^\n]*(รูปสินค้า|ไม่ครบ|ส่งตรวจ[^\n]*ไม่)[^\n]*/g) ?? []).slice(0, 5).join(' / '))
await shot(pg, 'R10v3', 'g4-02-submit-blocked-no-photo')
log('resps', resps.join(' || '))
log('srvErr', o.serverErrors.join(';'))
await o.browser.close()
