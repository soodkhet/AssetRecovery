// validation IMEI/มูลหนี้ ในฟอร์มรับเคส (ไม่บันทึก)
import { openAs, shot, log } from './_h.mjs'
const s = await openAs('uat.admin'); const { page } = s
await page.goto('http://localhost:3000/cases/submit'); await page.waitForLoadState('networkidle')
await page.getByRole('button', { name: '+ รับเคส (กรอกมือ)' }).click()
const dlg = page.getByRole('dialog'); await dlg.waitFor(); await page.waitForTimeout(800)
for (const v of ['35900-ABC-0007', '12345', '3590000000070011', '35900000000700']) {
  await dlg.locator('#asset-imei').fill(v); await dlg.locator('#asset-imei').blur()
  await dlg.getByRole('button', { name: 'บันทึกเคสร่าง' }).click(); await page.waitForTimeout(800)
  const box = await dlg.locator('#asset-imei').evaluate(e => e.closest('div')?.parentElement?.innerText ?? '')
  log('p02', `IMEI «${v}» →`, box.replace(/\s+/g, ' ').slice(0, 200), '| aria-invalid=', await dlg.locator('#asset-imei').getAttribute('aria-invalid'))
}
await dlg.locator('#asset-imei').scrollIntoViewIfNeeded(); await shot(page, 'final/flow', 'p02-imei-invalid')
await s.browser.close()
