import { openAs, BASE, settle } from './_a.mjs'
const s = await openAs(process.argv[2] ?? 'superadmin')
await s.page.goto(`${BASE}/settings/roles`); await settle(s.page, 1000)
console.log(new URL(s.page.url()).pathname, (await s.page.locator('h1').first().innerText().catch(() => '')).slice(0, 40))
await s.browser.close()
