import { openAs, shot, R, log, q, settle, sleep, mainText, BASE } from './_h.mjs'
log('=== R7.13-15', new Date().toISOString())
const m = await openAs('uat.mgr.in'); const p = m.page
await p.goto(`${BASE}/finance?tab=comp`); await settle(p); await sleep(800)
log('url', p.url())
const sel = p.locator('main select').filter({ has: p.locator('option', { hasText: 'อนุมัติแล้ว' }) })
if (await sel.count()) await sel.first().selectOption({ label: 'อนุมัติแล้ว' }); else await p.getByRole('button', { name: 'อนุมัติแล้ว' }).first().click().catch(e => log('no filter', e.message))
await settle(p); await sleep(800)
const rows = await p.locator('tbody tr').allInnerTexts()
log('rows', rows.length)
for (const r of rows) { const t = r.replace(/\s+/g, ' '); if (/บาท\/วัน|÷|วัน ×/.test(t)) log(' daily:', t.slice(0, 260)) }
await shot(p, R, '13-bug095-comp-approved', { fullPage: true })
log('errs', m.consoleErrors.slice(0,3), m.serverErrors)
await m.browser.close()
const ad = await openAs('admin'); const ap = ad.page
await ap.goto(`${BASE}/settings/roles`); await settle(ap); await sleep(1000)
const txt = await ap.locator('main').innerText()
log('roles ** count', txt.split('**').length - 1)
const i = txt.indexOf('งานเบื้องหลัง'); log('jobs desc', i >= 0 ? txt.slice(i - 40, i + 200).replace(/\s+/g, ' ') : '(not found in first view)')
await shot(ap, R, '15-bug108-settings-roles', { fullPage: true })
log('errs', ad.consoleErrors.slice(0,3), ad.serverErrors)
await ad.browser.close()
log(q(`select event_code, link_path, count(*) from notifications group by 1,2 order by 1`))
log(q(`select action, after_data ? 'revenueByCase' rbc from audit_logs where action='lot.confirmed' or (target_type='handover_lots' and action ilike '%confirm%')`))
