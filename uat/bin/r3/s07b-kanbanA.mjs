import { openAs, shot, BASE, log, sleep } from './_h.mjs'
const m = await openAs('uat.mgr.in')
await m.page.goto(`${BASE}/cases/assign`); await m.page.waitForLoadState('networkidle'); await sleep(600)
await m.page.getByRole('button', { name: 'ดูภาพรวมทีม' }).click(); await m.page.waitForLoadState('networkidle')
await m.page.getByText('อนันต์ ตามทรัพย์').first().waitFor({ timeout: 15000 }); await sleep(800)
const txt = (await m.page.locator('main').innerText()).replace(/\s*\n+\s*/g, ' | ')
log('mgrin kanban A:', txt.slice(txt.indexOf('รอความยินยอมเปลี่ยนผู้รับผิดชอบ')).slice(0, 700))
await shot(m.page, 'R3', '19-mgrin-kanban-ทีมA', { fullPage: true })
await m.browser.close()
