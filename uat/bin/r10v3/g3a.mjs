// R10g.3 เอกสารชุด: UAT-CO1-901 → โหมดชุด → probe 26MB → อัป 12MB → บันทึก → ส่งตรวจสอบ
import { openAs, shot, BASE } from '../lib.mjs'
import { log } from './_h.mjs'
const F = 'uat/fixtures/files/R10g/'
const o = await openAs('uat.admin'); const pg = o.page
await pg.goto(BASE + '/cases/submit'); await pg.waitForLoadState('networkidle')
const row = () => pg.locator('tr', { hasText: 'UAT-CO1-901' })
await row().getByRole('button', { name: 'แก้ไข' }).click(); await pg.waitForTimeout(1000)
const dlg = pg.getByRole('dialog')
await dlg.getByText('เอกสารชุดเดียว (สแกนรวมเล่ม)', { exact: true }).click(); await pg.waitForTimeout(400)
const slot = dlg.locator('div.rounded-lg', { hasText: 'เอกสารชุด (สแกนรวมเล่ม)' }).last()
await slot.locator('input[type=file]').setInputFiles(F + 'R10g-bundle-26MB-probe.pdf'); await pg.waitForTimeout(800)
const t1 = await dlg.innerText()
log('probe 26MB notice:', (t1.match(/ไฟล์บางรายการใช้ไม่ได้[\s\S]{0,160}/) ?? ['(ไม่มี)'])[0].replace(/\n/g, ' '))
await dlg.getByText('รูปแบบเอกสารที่ได้รับ').scrollIntoViewIfNeeded(); await shot(pg, 'R10v3', 'g3-01-bundle-26mb-rejected')
await slot.locator('input[type=file]').setInputFiles(F + 'R10g-bundle-12MB-8pages.pdf'); await pg.waitForTimeout(800)
await shot(pg, 'R10v3', 'g3-02-bundle-12mb-staged')
await dlg.getByRole('button', { name: 'บันทึกการแก้ไข' }).click()
await pg.waitForTimeout(12000)
log('after save dialog visible=', await dlg.isVisible().catch(() => false), (await pg.locator('body').innerText()).match(/(บันทึก|อัปโหลด)[^\n]{0,80}/g)?.slice(0, 4).join(' / '))
await shot(pg, 'R10v3', 'g3-03-after-save')
log('row buttons', (await row().getByRole('button').allInnerTexts()).join(' | '))
log('srvErr', o.serverErrors.join(';'), 'console', o.consoleErrors.slice(0, 3).join(';'))
await o.browser.close()
