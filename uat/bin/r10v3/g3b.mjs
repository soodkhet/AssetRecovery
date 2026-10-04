// R10g.3 ส่งตรวจ (ธุรการ) → ผู้ตรวจรับโดยไม่ติ๊ก (ถูกปัด) → ติ๊กแล้วรับ
import { openAs, shot, BASE } from '../lib.mjs'
import { log } from './_h.mjs'
const a = await openAs('uat.admin'); let pg = a.page
await pg.goto(BASE + '/cases/submit'); await pg.waitForLoadState('networkidle')
let row = pg.locator('tr', { hasText: 'UAT-CO1-901' })
await row.getByRole('button', { name: 'ส่งตรวจสอบเคส' }).click(); await pg.waitForTimeout(800)
if (await pg.getByRole('dialog').isVisible().catch(() => false)) { log('submit dialog:', (await pg.getByRole('dialog').innerText()).slice(0, 200).replace(/\n/g, ' ')); const b = pg.getByRole('dialog').getByRole('button', { name: /ส่งตรวจ|ยืนยัน/ }).last(); await b.click(); await pg.waitForTimeout(2000) }
await pg.waitForTimeout(1500)
log('after submit row:', (await row.innerText()).replace(/\s+/g, ' ').slice(0, 220))
await shot(pg, 'R10v3', 'g3-04-submitted')
log('admin srvErr', a.serverErrors.join(';')); await a.browser.close()

const r = await openAs('uat.approver'); pg = r.page
await pg.goto(BASE + '/cases/submit'); await pg.waitForLoadState('networkidle')
row = pg.locator('tr', { hasText: 'UAT-CO1-901' })
log('approver row buttons', (await row.getByRole('button').allInnerTexts()).join(' | '))
await row.getByRole('button').filter({ hasText: /พิจารณา|ดูรายละเอียด/ }).first().click(); await pg.waitForTimeout(1500)
const dlg = pg.getByRole('dialog').first()
const txt = await dlg.innerText()
log('badge เอกสารชุด=', txt.includes('เอกสารชุด'), 'checkbox=', txt.includes('ตรวจเอกสารชุดแล้ว'), 'buttons:', (await dlg.getByRole('button').allInnerTexts()).join(' | '))
await dlg.getByText('เอกสารแนบ').first().scrollIntoViewIfNeeded().catch(() => {})
await shot(pg, 'R10v3', 'g3-05-reviewer-bundle-badge')
const resp = pg.waitForResponse((x) => /\/api\/cases\/.+\/status/.test(x.url()), { timeout: 15000 }).catch(() => null)
await dlg.getByRole('button', { name: 'รับเคส', exact: true }).click(); await pg.waitForTimeout(800)
const ok2 = pg.getByRole('dialog').last()
if ((await pg.getByRole('dialog').count()) > 1) log('confirm dialog after accept-click:', (await ok2.innerText()).slice(0, 200).replace(/\n/g, ' '))
const rr = await resp
log('accept without tick →', rr ? rr.status() + ' ' + JSON.stringify(await rr.json().catch(() => null)).slice(0, 250) : 'no request')
await pg.waitForTimeout(800); await shot(pg, 'R10v3', 'g3-06-accept-without-tick')
log('error on screen:', ((await pg.locator('body').innerText()).match(/[^\n]*(ติ๊ก|ยืนยันเอกสารชุด|เอกสารชุด)[^\n]*/g) ?? []).slice(0, 5).join(' / '))
log('approver srvErr', r.serverErrors.join(';'), 'console', r.consoleErrors.slice(0, 2).join(';'))
await r.context.storageState({ path: 'uat/bin/r10v3/.tmp-approver-state.json' }).catch(() => {})
await r.browser.close()
