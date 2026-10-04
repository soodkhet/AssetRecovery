// R10g.2 นำเข้าผ่าน wizard — argv: <file> <slug> <confirm:0|1>
import { openAs, shot, BASE } from '../lib.mjs'
import { log } from './_h.mjs'
const [file, slug, confirm] = process.argv.slice(2)
const o = await openAs('uat.admin'); const pg = o.page
await pg.goto(BASE + '/cases/submit'); await pg.waitForLoadState('networkidle')
await pg.getByRole('button', { name: 'Import ไฟล์' }).click(); await pg.waitForTimeout(500)
await pg.locator('#import-company').selectOption({ label: 'บริษัท ยูเอที ลิสซิ่ง จำกัด' })
await pg.locator('input[type=file]').setInputFiles(file); await pg.waitForTimeout(1500)
await shot(pg, 'R10v3', `g2-${slug}-mapping`)
const dlg = pg.getByRole('dialog')
log('mapping alerts', (await dlg.innerText()).match(/ยังจับคู่[^\n]*|จับคู่ซ้ำ[^\n]*/g)?.join(' / ') ?? 'none')
await pg.getByRole('button', { name: 'ตรวจสอบข้อมูล (ไม่บันทึก)' }).click(); await pg.waitForTimeout(2500)
await shot(pg, 'R10v3', `g2-${slug}-preview`, { fullPage: false })
const t = await dlg.innerText()
log('PREVIEW', slug, t.split('\n').filter((l) => /แถว|รายการ|ผิดพลาด|IMEI|ไม่ถูก|ยกกำลัง|E\+|UAT-CO1|สำเร็จ|ยืนยันนำเข้า/.test(l)).slice(0, 25).join(' ¦ '))
if (confirm === '1') {
  await pg.getByRole('button', { name: /ยืนยันนำเข้า/ }).click(); await pg.waitForTimeout(3000)
  await shot(pg, 'R10v3', `g2-${slug}-done`)
  log('DONE', (await pg.locator('body').innerText()).split('\n').filter((l) => /สำเร็จ|นำเข้า|ร่าง|UAT-CO1-90/.test(l)).slice(0, 10).join(' ¦ '))
}
log('srvErr', o.serverErrors.join(';'), 'console', o.consoleErrors.slice(0, 3).join(';'))
await o.browser.close()
