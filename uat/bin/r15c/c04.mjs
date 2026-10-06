// R15c.04 แท็บการเงิน → รออนุมัติ: WHT/Net ของรายการ in1/in2 (BUG-176)
import { openAs, BASE, settle, sleep, log, shot, R } from './_h.mjs'
const f = await openAs('uat.finance'); const page = f.page
await page.goto(`${BASE}/finance?tab=approval`); await settle(page); await sleep(1500)
const flat = s => s.replace(/\s*\n+\s*/g, ' | ')
log('pending view', flat(await page.locator('main').innerText()).slice(0, 2500))
await shot(page, R, 'c-04-approval-pending', { fullPage: true })
const tabs = await page.locator('main button, main [role=tab]').allInnerTexts()
log('buttons', tabs.map(s => s.trim()).filter(Boolean).slice(0, 40))
const t = page.locator('main').getByRole('button', { name: /อนุมัติแล้ว/ }).or(page.locator('main [role=tab]').filter({ hasText: 'อนุมัติแล้ว' })).first()
if (await t.count()) { await t.click(); await settle(page); await sleep(1500) }
for (const name of ['อนันต์', 'บุญมี', 'ประเสริฐ']) {
  const rows = page.locator('tbody tr').filter({ hasText: name })
  const n = await rows.count()
  for (let i = 0; i < Math.min(n, 6); i++) { const s = flat(await rows.nth(i).innerText()); if (/12,345|10,000/.test(s)) log(name, s) }
}
await shot(page, R, 'c-04-approval-approved', { fullPage: true })
log('5xx', f.serverErrors)
await f.browser.close()
