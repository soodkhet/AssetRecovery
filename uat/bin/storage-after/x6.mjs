import { BASE, shot } from '../lib.mjs'; import { open } from './h.mjs'
const { browser, page } = await open('uat.co1.mgr')
for (const p of ['/portal/handover', '/portal/cases']) {
  await page.goto(BASE + p); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1500)
  console.log('==', p, page.url()); console.log((await page.locator('main').innerText().catch(() => '')).replace(/\n+/g, ' | ').slice(0, 900))
  console.log((await page.getByRole('button').allInnerTexts()).slice(0, 30))
}
await browser.close()
