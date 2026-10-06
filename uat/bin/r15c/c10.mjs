// R15c.10 ส่ง + ล็อกงวด ต.ค. 2569 คืนด้วย dev asOf 2026-11-01
import { sess, call } from '../r10v3/_h.mjs'
import { openAs, shot, log, settle, sleep, R, BASE, q, mainText } from './_h.mjs'
const PER = '879302b0-bb29-4bae-9f9a-1e16aba8bb31', INV8 = 'a02be95b-e136-49cd-8396-4c838bb4cbdc'
const T = new Date().toISOString()
const show = (tag, r) => log(tag, r.status, r.code, (r.msg ?? '').slice(0, 160), r.status < 300 ? JSON.stringify(r.body?.data ?? {}).slice(0, 200) : '')
log('before', q(`select period_label,status from accounting_periods where id='${PER}'`).replace(/\s+/g, ' '))
const acc = await sess('uat.account')
show('send', await call(acc, 'POST', `/api/dev/accounting-periods/${PER}/send`, { reason: 'UAT R15c ปิดงวดจำลอง (ล็อกคืนหลังเล่นต่อ R15)', asOf: '2026-11-01' }))
log('mid', q(`select status from accounting_periods where id='${PER}'`).replace(/\s+/g, ' '))
show('lock', await call(acc, 'POST', `/api/dev/accounting-periods/${PER}/lock`, { reason: 'UAT R15c ล็อกงวดจำลอง (ล็อกคืนหลังเล่นต่อ R15)', asOf: '2026-11-01' }))
log('after', q(`select period_label,status from accounting_periods where id='${PER}'`).replace(/\s+/g, ' '))
const { browser, page } = await openAs('uat.account')
await page.goto(`${BASE}/accounting?tab=closing`); await settle(page); await sleep(1500)
log('closing tab', await mainText(page, 900)); await shot(page, R, 'c-10-period-locked', { fullPage: true })
await page.goto(`${BASE}/accounting?tab=sales`); await settle(page); await sleep(1500)
await browser.close()
log(q(`select a.action,a.target_type,a.reason from audit_logs a where a.created_at>'${T}' and a.action not in ('login') order by a.created_at`))
