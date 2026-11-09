import { openAs, BASE } from '../lib.mjs'
const s = await openAs('uat.agent.out1', { mobile: true })
const page = s.page
await page.goto(`${BASE}/field?tab=advances`)
await page.waitForTimeout(3000)
console.log(page.url())
console.log((await page.locator('body').innerText()).replace(/\n+/g, ' | ').slice(0, 1500))
await page.screenshot({ path: `${process.env.SHOT_DIR}/dbg-agent.png` })
await s.browser.close()
