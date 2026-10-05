// R13.51 ส่งงวด ต.ค. ก่อนสิ้นเดือน → PERIOD_NOT_ENDED (หน้าจอ + dev asOf 2026-10-31) · finance เรียก dev route → 403
import { openAs, shot, BASE, settle, sleep, toasts, log, R, q, mainText, post } from './_h.mjs'
log('=== l51', new Date().toISOString())
const PID = '879302b0-bb29-4bae-9f9a-1e16aba8bb31'
const a = await openAs('uat.account'); const p = a.page
const res = []; p.on('response', async r => { if (r.url().includes('/api/') && r.request().method() !== 'GET') res.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname} ${(await r.text().catch(() => '')).slice(0, 400)}`) })
await p.goto(`${BASE}/accounting?tab=closing`); await settle(p); await sleep(1500)
log('closing:', await mainText(p, 1200))
await p.getByRole('button', { name: 'ตรวจความพร้อม' }).first().click(); await sleep(2500)
log('readiness:', (await p.locator('[role="dialog"]').last().innerText()).replace(/\s*\n+\s*/g, ' | ').slice(0, 2000))
await shot(p, R, '51-readiness'); await p.keyboard.press('Escape'); await sleep(600)
const send = p.getByRole('button', { name: 'ส่งสำนักงานบัญชี', exact: true }).first()
log('send btn disabled?', await send.isDisabled(), 'title', await send.getAttribute('title'))
if (!(await send.isDisabled())) {
  await send.click(); await sleep(700)
  const d = p.locator('[role="dialog"]').last()
  await d.locator('textarea').fill('UAT R13 ทดสอบส่งงวดก่อนสิ้นเดือน')
  const btns = d.getByRole('button'); const n = await btns.count()
  log('modal:', (await d.innerText()).replace(/\s+/g, ' ').slice(0, 500))
  await btns.nth(n - 1).click(); await sleep(2500)
  log('toast', await toasts(p, 300)); log('responses', res)
  await shot(p, R, '51-send-rejected')
}
log('R13.51 dev asOf 10-31', await post(p, `/api/dev/accounting-periods/${PID}/send`, { reason: 'UAT R13', asOf: '2026-10-31' }))
await a.browser.close()
const f = await openAs('uat.finance')
log('R13.51 finance dev send', await post(f.page, `/api/dev/accounting-periods/${PID}/send`, { reason: 'UAT R13 probe', asOf: '2026-11-01' }))
log('R13.51 finance dev lock', await post(f.page, `/api/dev/accounting-periods/${PID}/lock`, { reason: 'UAT R13 probe', asOf: '2026-11-01' }))
await f.browser.close()
log(q(`select period_label,status from accounting_periods`))
