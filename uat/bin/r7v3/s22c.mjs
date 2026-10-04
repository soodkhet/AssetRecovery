import { openAs, shot, R, log, settle, sleep, BASE } from './_h.mjs'
const f = await openAs('uat.finance'); const p = f.page
await p.goto(`${BASE}/finance`); await settle(p)
await p.getByRole('tab', { name: 'รออนุมัติ' }).or(p.getByRole('button', { name: 'รออนุมัติ', exact: true })).first().click(); await settle(p); await sleep(1200)
const b = p.getByText(/รายการเลยกำหนดเคลียร์ยอดแล้ว/)
log('banner count', await b.count(), await b.first().innerText().catch(()=>'-'))
if (await b.count()) { await b.first().scrollIntoViewIfNeeded(); await shot(p, R, '22c-approvals-overdue-banner') }
await f.browser.close()
