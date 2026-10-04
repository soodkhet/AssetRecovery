// R10g.3 ผู้ตรวจ: รับโดยไม่ติ๊ก (ถูกปัด) → ติ๊กแล้วรับ
import { openAs, shot, BASE } from '../lib.mjs'
import { log } from './_h.mjs'
const r = await openAs('uat.approver'); const pg = r.page
const resps = []; pg.on('response', async (x) => { if (/\/api\/cases\/[^/]+\/status/.test(x.url())) resps.push(x.status() + ' ' + (await x.text().catch(() => '')).slice(0, 260)) })
await pg.goto(BASE + '/cases/submit'); await pg.waitForLoadState('networkidle')
const row = pg.locator('tr', { hasText: 'UAT-CO1-901' })
await row.getByRole('button', { name: 'พิจารณา' }).click(); await pg.waitForTimeout(1500)
const dlg = pg.getByRole('dialog').first()
await dlg.getByText('ตรวจเอกสารชุดแล้ว', { exact: false }).scrollIntoViewIfNeeded()
await shot(pg, 'R10v3', 'g3-05-reviewer-bundle-badge')
await dlg.getByRole('button', { name: 'รับเคส & ยืนยันทีม' }).click(); await pg.waitForTimeout(2500)
log('dialogs', await pg.getByRole('dialog').count(), 'resp1:', resps.join(' || '))
log('error on screen:', ((await pg.locator('body').innerText()).match(/[^\n]*(ติ๊ก|เอกสารชุด|ไม่สำเร็จ)[^\n]*/g) ?? []).slice(0, 6).join(' / '))
await shot(pg, 'R10v3', 'g3-06-accept-without-tick')
await dlg.getByText('ตรวจเอกสารชุดแล้ว', { exact: false }).click(); await pg.waitForTimeout(300)
await dlg.getByRole('button', { name: 'รับเคส & ยืนยันทีม' }).click(); await pg.waitForTimeout(3000)
log('resp2:', resps.slice(1).join(' || ').slice(0, 300))
await shot(pg, 'R10v3', 'g3-07-accepted')
log('srvErr', r.serverErrors.join(';'), 'console', r.consoleErrors.slice(0, 2).join(';'))
await r.browser.close()
