import { openAs, shot, R, log, settle, sleep, mainText, BASE } from './_h.mjs'
const f = await openAs('uat.finance'); const p = f.page
await p.goto(`${BASE}/finance`); await settle(p)
await p.getByRole('tab', { name: 'รออนุมัติ' }).or(p.getByRole('button', { name: 'รออนุมัติ', exact: true })).first().click(); await settle(p); await sleep(1000)
log('url', p.url()); const mt = await mainText(p, 5000); const k = mt.indexOf('เลยกำหนด'); log('banner', k >= 0 ? mt.slice(Math.max(0,k-80), k+160) : '(not found) ' + mt.slice(150, 600))
await shot(p, R, '22c-approvals-overdue-banner', { fullPage: true })
await f.browser.close()
