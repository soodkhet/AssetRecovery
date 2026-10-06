import { openAs, shot, BASE } from '../lib.mjs'
const users = ['admin','uat.exec','uat.finance','uat.account','uat.admin','uat.mgr.in','uat.sup.in','uat.mgr.out']
for (const u of users) {
  const { browser, page, consoleErrors, serverErrors } = await openAs(u)
  await page.goto(`${BASE}/dashboard`); await page.waitForLoadState('networkidle').catch(()=>{}); await page.waitForTimeout(2500)
  const txt = (await page.locator('main').innerText().catch(()=>'')).replace(/\s+/g,' ')
  const ce = txt.match(/\b20\d\d\b/g)
  const err = txt.match(/โหลดไม่สำเร็จ|เกิดข้อผิดพลาด|ไม่สามารถ/g)
  await shot(page, 'R15', `d-dashboard-${u}`, { fullPage: true })
  console.log(u, '| url', new URL(page.url()).pathname, '| CE', ce?.slice(0,3) ?? '-', '| err', err ?? '-', '| 5xx', serverErrors.length, '| console', consoleErrors.length, '|', txt.slice(0,260))
  await browser.close()
}
