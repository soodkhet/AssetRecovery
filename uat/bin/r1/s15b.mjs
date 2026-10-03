import { openAs, BASE, log, settle } from './_h.mjs'
const s = await openAs('uat.co1.mgr'); const page = s.page
const apis = []; page.on('response', r => { if (r.url().includes('/api/')) apis.push(`${r.status()} ${r.url().replace(BASE, '')}`) })
for (const p of ['/cases', '/warehouse', '/dashboard']) { apis.length = 0; await page.goto(BASE + p); await settle(page); log(p, JSON.stringify(apis), '|', (await page.locator('main').first().innerText()).replace(/\n+/g, ' | ').slice(0, 250)) }
await s.browser.close()
