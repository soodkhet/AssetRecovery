// R13.17 คลังเฉพาะทีมหลังรับเข้า
import { openAs, shot, log, settle, sleep, R, BASE } from './_h.mjs'
for (const u of ['uat.mgr.in', 'uat.mgr.out']) {
  const { browser, page } = await openAs(u)
  await page.goto(`${BASE}/warehouse`); await settle(page); await sleep(900)
  const tabs = (await page.getByRole('tab').allInnerTexts()).map(s => s.replace(/\s+/g, ' '))
  await page.getByRole('tab', { name: /ในคลัง/ }).click(); await settle(page); await sleep(800)
  const rows = await page.locator('tbody tr').allInnerTexts()
  log(u, 'tabs', tabs, 'ในคลัง rows', rows.map(r => r.split(/\s+/)[0]))
  log(u, 'buttons', (await page.getByRole('button').allInnerTexts()).map(s => s.trim()).filter(Boolean))
  await shot(page, R, `17-${u.replace(/\./g, '-')}-in-custody`, { fullPage: true })
  await browser.close()
}
