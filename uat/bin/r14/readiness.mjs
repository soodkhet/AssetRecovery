// readiness งวด ต.ค. (uat.account) — ใช้ซ้ำ R14.07 / R14.13 · TAG=ชื่อภาพ
import { openAs, shot, log, settle, sleep, R, BASE } from './_h.mjs'
const TAG = process.env.TAG ?? '07-readiness'
const a = await openAs('uat.account'); const p = a.page
await p.goto(`${BASE}/accounting?tab=closing`); await settle(p); await sleep(1500)
await p.getByRole('button', { name: 'ตรวจความพร้อม' }).first().click(); await sleep(2500)
log(`${TAG}:`, (await p.locator('[role="dialog"]').last().innerText()).replace(/\s*\n+\s*/g, ' | ').slice(0, 2500))
await shot(p, R, TAG)
log('5xx', a.serverErrors, a.consoleErrors.slice(0, 3))
await a.browser.close()
