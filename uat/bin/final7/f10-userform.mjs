// Flow 10 — ฟอร์มผู้ใช้ + ข้อมูลรับเงิน (U131/U164): เปิดแก้ in1 (inhouse) และ out2 (outsource นิติ) ดูช่อง Tax Profile · validation เลขบัญชี
import { openAs, shot, log, q } from './_h.mjs'
import { collect, trackApi } from '../r2/_h.mjs'
const who = process.argv[2] ?? 'uat.finance'
const s = await openAs(who); const { page } = s; const api = trackApi(page)
await page.goto('http://localhost:3000/settings/users'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1000)
log('f10', who, 'url', page.url())
await page.getByRole('tab', { name: /เจ้าหน้าที่ติดตามทรัพย์/ }).click().catch(() => {}); await page.waitForTimeout(800)
for (const name of (process.env.NAMES ?? 'อนันต์ ตามทรัพย์|uat.agent.out2').split('|')) {
  if (name.includes('out')) { await page.getByRole('button', { name: 'Outsource', exact: true }).click().catch(() => {}); await page.waitForTimeout(1200) }
  const row = page.locator('tr', { hasText: name }).first()
  log('f10', 'row', (await row.innerText().catch(() => 'NO ROW')).replace(/\s+/g, ' ').slice(0, 300))
  await row.getByRole('button', { name: /แก้ไข/ }).first().click(); await page.waitForTimeout(1500)
  const d = page.getByRole('dialog').last()
  const t = (await d.innerText()).replace(/\s+/g, ' ')
  log('f10', name, 'payee section:', t.slice(t.indexOf('ข้อมูลรับเงิน'), t.indexOf('ข้อมูลรับเงิน') + 1500))
  const sel = await d.locator('select').evaluateAll(es => es.map(e => `${e.id}: [${e.options[e.selectedIndex]?.text}] {${[...e.options].map(o => o.text).join(' / ')}}`))
  log('f10', name, 'selects:', sel.join(' || '))
  await shot(page, 'final/flow', `f10-userform-${name.split(' ')[0]}`, { fullPage: true })
  await d.getByRole('button', { name: /ยกเลิก|ปิด/ }).first().click().catch(() => page.keyboard.press('Escape')); await page.waitForTimeout(600)
}
log('f10', 'api (must be none)', api.splice(0)); log('f10', 'console', s.consoleErrors, s.serverErrors); await s.browser.close()
