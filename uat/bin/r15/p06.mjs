// probe: บริบทของคำที่ดูเป็นเลขอ้างอิง/ปี ค.ศ.
import { openAs, log, settle, sleep, BASE } from './_h.mjs'
const { browser, page } = await openAs('admin')
page.setDefaultTimeout(15000)
for (const [t, re] of [['docs', /.{0,80}ไฟล์\s*\d{2}.{0,60}/g], ['export', /.{0,50}ไฟล์\s*\d{2}.{0,40}/g], ['sla', /.{0,100}มติ PO.{0,60}/g], ['holidays', /.{0,80}2026.{0,40}/g]]) {
  await page.goto(`${BASE}/settings/finance?tab=${t}`, { timeout: 30000 }); await settle(page); await sleep(700)
  await page.evaluate(() => document.querySelectorAll('main details').forEach(d => { d.open = true }))
  const all = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
  log(t, [...new Set(all.match(re) ?? [])].slice(0, 4))
}
await browser.close()
