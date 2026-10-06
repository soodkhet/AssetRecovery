import { openAs, BASE, settle, sleep, log } from './_h.mjs'
for (const u of ['uat.finance', 'uat.mgr.in']) {
  const s = await openAs(u); await s.page.goto(`${BASE}/finance?tab=approval`); await settle(s.page); await sleep(1500)
  const rows = await s.page.locator('tbody tr').allInnerTexts()
  log(u, rows.length, rows.filter(t => /500\.00/.test(t) && /อนันต์/.test(t)).map(t => t.replace(/\s+/g, ' ').slice(0, 220)).slice(0, 3))
  await s.browser.close()
}
