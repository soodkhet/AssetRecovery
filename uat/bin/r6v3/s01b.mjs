// R6.01 เสริม: เมนูบน header + กระดิ่ง (อ่านอย่างเดียว)
import { openAs, shot, BASE, settle, sleep, log, R, flat } from './_h.mjs'
for (const u of ['uat.mgr.in', 'uat.sup.in', 'uat.finance', 'uat.exec']) {
  const s = await openAs(u); const { page, context } = s
  await context.route('**/api/**', r => (r.request().method() === 'GET' || r.request().url().includes('/api/auth/')) ? r.continue() : r.abort())
  await page.goto(`${BASE}/dashboard`); await settle(page)
  log(`R6.01b [${u}] header:`, flat(await page.locator('header').first().innerText().catch(() => '')).slice(0, 300))
  if (u === 'uat.finance' || u === 'uat.exec') { await page.goto(`${BASE}/finance?tab=comp`); await settle(page); await sleep(600); await shot(page, R, `R6.01-${u.replace('uat.', '')}-comp-empty`) ; log(`R6.01b [${u}] finance tabs:`, flat(await page.locator('main').innerText()).slice(0, 300)) }
  if (u === 'uat.mgr.in') {
    const bell = page.locator('header button').filter({ has: page.locator('svg') }).first()
    await page.mouse.click(1102, 32); await sleep(1200)
    log(`R6.01b [${u}] bell panel:`, flat(await page.locator('body').innerText()).match(/แจ้งเตือน.{0,900}/)?.[0] ?? '(?)')
    await shot(page, R, 'R6.01-mgr-in-bell')
  }
  await s.browser.close()
}
