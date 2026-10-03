import { openAs, shot, BASE, settle, log, sleep } from './_h.mjs'
const s = await openAs('admin')
const { page } = s
const apis = []
page.on('response', r => { if (r.url().includes('/api/users')) apis.push(`${r.status()} ${r.url().replace(BASE, '')}`) })
await page.goto(`${BASE}/settings/users`); await settle(page)
for (let i = 0; i < 10; i++) { const n = await page.locator('tbody tr').count(); const t = await page.locator('tbody tr').first().innerText().catch(() => ''); log(i, n, t.slice(0, 60).replace(/\s+/g, ' ')); if (!t.includes('กำลังโหลด')) break; await sleep(1000) }
log('apis', apis)
log('rows', JSON.stringify((await page.locator('tbody tr').allInnerTexts()).map(r => r.replace(/\s+/g, ' ').slice(0, 110))))
await shot(page, 'R1', 'R1.22-users-admin', { fullPage: true })
log('consoleErrors', s.consoleErrors, 'serverErrors', s.serverErrors)
await s.browser.close()
