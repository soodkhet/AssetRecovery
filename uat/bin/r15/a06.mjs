// R15a.06 กล่องคำอธิบายค่าตั้ง (SettingHelp) ทุกแท็บตั้งค่าบัญชี/การเงิน — กางทุกกล่อง เก็บข้อความ + ตรวจเลขอ้างอิงสเปค/ปี ค.ศ.
import { writeFileSync } from 'node:fs'
import { openAs, shot, log, settle, sleep, R, BASE, yearCE } from './_h.mjs'
const SPEC = /§|ไฟล์\s*\d{2}|`\d{2}`|DEC-\d|มติ PO|\bU\d{2,3}\b|\bO\d{2}\b/g
const tabs = ['cycles', 'approval', 'bank', 'payee', 'tax', 'whtpolicy', 'vat', 'cost', 'docs', 'bankfile', 'export', 'permission', 'lock', 'numbering', 'taxdoc', 'sla', 'assignment', 'retention', 'holidays']
const { browser, page, serverErrors, consoleErrors } = await openAs('admin')
const dump = {}
for (const t of tabs) {
  await page.goto(`${BASE}/settings/finance?tab=${t}`); await settle(page); await sleep(700)
  const sums = page.locator('main details > summary')
  const n = await sums.count()
  for (let i = 0; i < n; i++) await sums.nth(i).click().catch(() => {})
  await sleep(300)
  const helps = (await page.locator('main details').allInnerTexts()).map(s => s.replace(/\s+/g, ' '))
  const all = await page.locator('main').innerText()
  dump[t] = helps
  log(t, 'helps', n, 'specRefs', [...new Set(all.match(SPEC) ?? [])], 'CE', yearCE(all))
  await shot(page, R, `06-help-${t}`, { fullPage: true })
}
writeFileSync('uat/bin/r15/help-dump.json', JSON.stringify(dump, null, 1))
log('5xx', serverErrors, 'console', consoleErrors.slice(0, 3))
await browser.close()
