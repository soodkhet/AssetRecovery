// การเงิน: ปุ่มบนแถวรอบจ่าย · node payout.mjs <ชื่อรอบ> [ปุ่ม] (ไม่ใส่ปุ่ม = แสดงปุ่ม) · ดาวน์โหลดไฟล์ถ้าเกิด download
import { openAs, shot, log, q, collect, trackApi, U, clean } from './_h.mjs'
import { mkdirSync } from 'node:fs'
const [name, btn] = process.argv.slice(2)
const s = await openAs('uat.finance'); const { page } = s; const api = trackApi(page)
await page.goto(U + '/finance?tab=payout'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1200)
const row = page.locator('tr', { hasText: name }).first()
log('pb', 'row', clean(await row.innerText()), '| buttons', (await row.getByRole('button').allInnerTexts()).join('|'))
if (btn) {
  mkdirSync('uat/shots/final2/files', { recursive: true })
  const dl = page.waitForEvent('download', { timeout: 6000 }).catch(() => null)
  await row.getByRole('button', { name: btn }).first().click(); await page.waitForTimeout(1200)
  const d = page.getByRole('dialog').last()
  if (await d.isVisible().catch(() => false)) {
    log('pb', 'dlg:', clean(await d.innerText()).slice(0, 1800)); await shot(page, `pb-${name}-${btn.replace(/\s/g, '')}`, { fullPage: true })
    if (process.env.GO === '1') { for (const ta of await d.locator('textarea').all()) await ta.fill(process.env.REASON ?? 'ยืนยันจ่ายตามสลิป ด่าน 7 รอบทวน')
      const dl2 = page.waitForEvent('download', { timeout: 8000 }).catch(() => null)
      await d.getByRole('button', { name: new RegExp(process.env.CONFIRM ?? 'ยืนยัน|สร้าง|บันทึก|ดาวน์โหลด') }).last().click()
      const f2 = await dl2; if (f2) { const p = `uat/shots/final2/files/${f2.suggestedFilename()}`; await f2.saveAs(p); log('pb', 'downloaded', p) } }
  }
  const f = await dl; if (f) { const p = `uat/shots/final2/files/${f.suggestedFilename()}`; await f.saveAs(p); log('pb', 'downloaded', p) }
  log('pb', 'act', await collect(page, 5000), api.splice(0).filter(x => !x.includes('storage/v1')).map(x => x.slice(0, 300)))
}
log('pb', q(`select name,status,gross_satang,wht_satang,net_satang,payment_file_url from payout_batches where name='${name}'`))
log('pb', 'console', s.consoleErrors, s.serverErrors); await s.browser.close()
