// U140 — นับป้าย "รอนักบัญชียืนยัน" ทุกแท็บของหน้าตั้งค่าการเงิน (ดูอย่างเดียว)
import { openAs, shot, log } from './_h.mjs'
const u = process.argv[2] ?? 'admin'
const s = await openAs(u); const { page } = s
await page.goto('http://localhost:3000/settings/finance'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1200)
const tabs = page.locator('[aria-label^="แท็บ"] button'); const n = await tabs.count(); const out = []
for (let i = 0; i < n; i++) { await tabs.nth(i).click(); await page.waitForTimeout(900)
  const all = await page.getByText(/รอนักบัญชี/).count(); const vis = await page.getByText(/รอนักบัญชี/).evaluateAll(es => es.filter(e => e.offsetParent !== null).length)
  const det = await page.locator('details, [aria-expanded=false]').count()
  out.push(`${(await tabs.nth(i).innerText()).trim()}=${vis}/${all} (collapsed:${det})`) }
log('p04', u, out.join(' · '))
await s.browser.close()
