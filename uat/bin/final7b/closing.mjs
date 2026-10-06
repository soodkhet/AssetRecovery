// บัญชี: ปิดงวด — ตรวจความพร้อม ต.ค. · ปุ่มส่ง/ล็อกก่อน 01/11 · งวด ก.ย. ปิดแล้ว
import { openAs, shot, log, q, collect, trackApi, U, clean } from './_h.mjs'
const s = await openAs('uat.account'); const { page } = s; const api = trackApi(page)
await page.goto(U + '/accounting?tab=closing'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1200)
const oct = page.locator('tr', { hasText: 'ตุลาคม 2569' }).first()
const send = oct.getByRole('button', { name: 'ส่งสำนักงานบัญชี' }); log('cl', 'oct send disabled:', await send.isDisabled().catch(() => 'no btn'), await send.getAttribute('title').catch(() => ''))
await oct.getByRole('button', { name: 'ตรวจความพร้อม' }).click(); await page.waitForTimeout(2500)
const d = page.getByRole('dialog').last(); const t = clean(await (await d.count() ? d : page.locator('main')).innerText())
log('cl', 'readiness oct:', t.slice(0, 1800)); await shot(page, 'cl-readiness-oct', { fullPage: true })
log('cl', 'api', api.splice(0).map(x => x.slice(0, 250)))
if (await d.count()) { await d.getByRole('button', { name: /ปิด|ยกเลิก/ }).first().click().catch(() => page.keyboard.press('Escape')); await page.waitForTimeout(500) }
const sep = page.locator('tr', { hasText: 'กันยายน 2569' }).first(); log('cl', 'sep row', clean(await sep.innerText()), '| btns', (await sep.getByRole('button').allInnerTexts()).join('|'))
log('cl', 'console', s.consoleErrors, s.serverErrors); await s.browser.close()
