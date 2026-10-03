// R5.22 กระดิ่งการเงิน
import { openAs, shot, BASE, settle, sleep, mainText, log, R } from './_h.mjs'
const s = await openAs('uat.finance'); const p = s.page
await p.goto(`${BASE}/`); await settle(p); await sleep(800)
await p.getByRole('button', { name: /แจ้งเตือน/ }).first().click(); await sleep(1200)
const t = (await p.locator('body').innerText()).replace(/\s*\n+\s*/g, ' | '); const i = t.indexOf('แจ้งเตือนล่าสุด')
log('R5.22 finance bell:', t.slice(i, i + 700))
await shot(p, R, 'R5.22-finance-bell')
await p.getByText('ยืนยันส่งมอบล็อตแล้ว').first().click(); await sleep(2500); await settle(p)
log('R5.22 click →', new URL(p.url()).pathname + new URL(p.url()).search)
log('R5.22 page:', await mainText(p, 700))
await shot(p, R, 'R5.22-finance-revenue')
log('console', s.consoleErrors, 'server', s.serverErrors)
await s.browser.close()
