// R15a.07 SettingHelp ในฟอร์ม บริษัทไฟแนนซ์ / แผนค่าตอบแทน / Service fee / ผู้รับเงิน — เปิดฟอร์มแก้ไขแล้วกดยกเลิก (ไม่บันทึก)
import { appendFileSync } from 'node:fs'
import { openAs, shot, log, settle, sleep, R, BASE, yearCE } from './_h.mjs'
const SPEC = /§|ไฟล์\s*\d{2}\b|`\d{2}`|DEC-\d|มติ PO|\bU\d{2,3}\b|\bD\d{1,2}\b/g
const { browser, page, serverErrors, consoleErrors } = await openAs('admin')
page.setDefaultTimeout(15000)
for (const [name, path] of [['company', '/settings/companies'], ['plan', '/settings/compensation'], ['fee', '/settings/service-fee'], ['payee', '/settings/finance?tab=payee']]) {
  await page.goto(`${BASE}${path}`, { timeout: 30000 }); await settle(page); await sleep(800)
  const btn = page.locator('main').getByRole('button', { name: /แก้ไข/ }).first()
  if (!(await btn.count())) { log(name, 'no edit btn', (await page.locator('main button').allInnerTexts()).slice(0, 20)); continue }
  await btn.click(); const dlg = page.getByRole('dialog').last(); await dlg.waitFor(); await sleep(600)
  await dlg.evaluate(d => d.querySelectorAll('details').forEach(x => { x.open = true }))
  const helps = (await dlg.locator('details').allInnerTexts()).map(s => s.replace(/\s+/g, ' '))
  const all = await dlg.innerText()
  log(name, 'helps', helps.length, 'specRefs', [...new Set(all.match(SPEC) ?? [])], 'CE', yearCE(all))
  appendFileSync('uat/bin/r15/help-forms.txt', `\n== ${name}\n` + helps.join('\n') + '\n')
  await shot(page, R, `07-help-form-${name}`, { fullPage: true })
  await dlg.getByRole('button', { name: 'ยกเลิก' }).first().click().catch(() => page.keyboard.press('Escape'))
  await sleep(400)
}
log('5xx', serverErrors, 'console', consoleErrors.slice(0, 3))
await browser.close()
