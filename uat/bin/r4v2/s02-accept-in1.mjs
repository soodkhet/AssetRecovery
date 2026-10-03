// R4.02–R4.05 v2 in1 มือถือ: แดชบอร์ด (N/A), รอรับงาน, กระดิ่ง, รับ C1 (dblclick) + noti accepted, C2 ผ่าน modal, C7
import { openAs, shot, BASE, settle, sleep, collect, trackMutations, card, mainText, q, log, SQL, REF, T0 } from './_h.mjs'
const R = 'R4v2'
const bell = async (page, name) => {
  await page.getByRole('button', { name: /แจ้งเตือน/ }).first().click(); await sleep(1200)
  const t = (await page.locator('body').innerText()).replace(/\s*\n+\s*/g, ' | ')
  const i = t.indexOf('แจ้งเตือนล่าสุด')
  log(`${name} bell:`, i >= 0 ? t.slice(i, i + 900) : t.slice(0, 600))
}
const { browser, page, consoleErrors, serverErrors } = await openAs('uat.agent.in1', { mobile: true })
const mut = trackMutations(page)
log('=== s02 v2', new Date().toISOString())
await page.goto(`${BASE}/field`); await settle(page); await sleep(800)
log('R4.02 /field:', await mainText(page, 700))
await shot(page, R, '02-in1-dashboard')
await page.goto(`${BASE}/field/pending`); await settle(page); await sleep(800)
log('R4.02 pending:', await mainText(page, 1500))
await shot(page, R, '02-in1-pending', { fullPage: true })
await bell(page, 'R4.02')
await shot(page, R, '02-in1-bell')
await page.keyboard.press('Escape'); await sleep(300)
await page.goto(`${BASE}/field/pending`); await settle(page); await sleep(800)

// R4.03
const c1 = card(page, REF.C1, 'รับงาน')
await c1.getByRole('button', { name: 'รับงาน', exact: true }).dblclick()
log('R4.03 toasts:', await collect(page, 3500))
log('R4.03 mut:', mut.res)
await shot(page, R, '03-c1-accepted')
log(q(`select count(*) audit_accept from audit_logs where target_type='case_assignments' and action='status_change' and created_at>'${T0}'`))
log(q(SQL.noti))

// R4.04
mut.res.length = 0
await page.goto(`${BASE}/field/pending`); await settle(page); await sleep(600)
await card(page, REF.C2, 'รับงาน').getByRole('button', { name: 'ดูรายละเอียด' }).click()
const dlg = page.getByRole('dialog'); await dlg.waitFor(); await sleep(800)
const dt = (await dlg.innerText()).replace(/\s*\n+\s*/g, ' | ')
log('R4.04 modal:', dt.slice(0, 900))
log('R4.04 has imei/debt:', dt.includes('356789100000029'), dt.includes('24,900.00'))
await shot(page, R, '04-c2-detail', { fullPage: true })
await dlg.getByRole('button', { name: 'รับงาน', exact: true }).click()
log('R4.04 toasts:', await collect(page, 3000), mut.res)

// R4.05
mut.res.length = 0
await page.goto(`${BASE}/field/pending`); await settle(page); await sleep(600)
await card(page, REF.C7, 'รับงาน').getByRole('button', { name: 'รับงาน', exact: true }).click()
log('R4.05 toasts:', await collect(page, 3000), mut.res)
await page.goto(`${BASE}/field/pending`); await settle(page); await sleep(800)
log('R4.05 pending:', await mainText(page, 400))
await shot(page, R, '05-pending-empty')
await page.goto(`${BASE}/field/accepted`); await settle(page); await sleep(800)
log('R4.05 accepted:', await mainText(page, 1200))
await shot(page, R, '05-in1-accepted', { fullPage: true })
log(q(SQL.asg)); log(q(SQL.noti))
log('console', consoleErrors, 'server', serverErrors)
await browser.close()

// R4.03 ตรวจกระดิ่ง mgr.in
const m = await openAs('uat.mgr.in')
await m.page.goto(`${BASE}/`); await settle(m.page); await sleep(800)
await bell(m.page, 'R4.03 mgr.in')
await shot(m.page, R, '03-mgr-in-bell')
const row = m.page.getByText('พนักงานกดรับงานแล้ว').first()
if (await row.count()) { await row.click(); await sleep(2000); log('R4.03 mgr.in click →', new URL(m.page.url()).pathname) } else log('R4.03 mgr.in: ไม่พบแถว พนักงานกดรับงานแล้ว')
log('mgr console', m.consoleErrors, 'server', m.serverErrors)
await m.browser.close()
