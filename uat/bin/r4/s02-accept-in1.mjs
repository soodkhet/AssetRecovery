// R4.02–R4.05 in1 มือถือ: แดชบอร์ด, รอรับงาน, รับ C1 (dblclick), C2 ผ่าน modal, C7
import { openAs, shot, BASE, settle, sleep, collect, trackMutations, card, mainText, q, log, SQL, REF } from './_h.mjs'
const { browser, page, consoleErrors, serverErrors } = await openAs('uat.agent.in1', { mobile: true })
const mut = trackMutations(page)
log('=== s02', new Date().toISOString())
await page.goto(`${BASE}/field`); await settle(page)
log('R4.02 /field:', await mainText(page, 700))
await shot(page, 'R4', 'R4.02-in1-dashboard')
await page.goto(`${BASE}/field/pending`); await settle(page); await sleep(800)
log('R4.02 pending:', await mainText(page, 1500))
await shot(page, 'R4', 'R4.02-in1-pending', { fullPage: true })

// R4.03
const c1 = card(page, REF.C1, 'รับงาน')
await c1.getByRole('button', { name: 'รับงาน', exact: true }).dblclick()
log('R4.03 toasts:', await collect(page, 3500))
log('R4.03 mut:', mut.res)
await shot(page, 'R4', 'R4.03-c1-accepted')
log(q(`select count(*) from audit_logs where target_type='case_assignments' and action='status_change' and created_at>'2026-10-03 09:49:00+00'`))

// R4.04
mut.res.length = 0
await page.goto(`${BASE}/field/pending`); await settle(page); await sleep(600)
await card(page, REF.C2, 'รับงาน').getByRole('button', { name: 'ดูรายละเอียด' }).click()
const dlg = page.getByRole('dialog'); await dlg.waitFor(); await sleep(800)
const dt = (await dlg.innerText()).replace(/\s*\n+\s*/g, ' | ')
log('R4.04 modal:', dt.slice(0, 1200))
log('R4.04 has imei/debt:', dt.includes('356789100000029'), dt.includes('24,900.00'))
await shot(page, 'R4', 'R4.04-c2-detail', { fullPage: true })
await dlg.getByRole('button', { name: 'รับงาน', exact: true }).click()
log('R4.04 toasts:', await collect(page, 3000), mut.res)

// R4.05
mut.res.length = 0
await page.goto(`${BASE}/field/pending`); await settle(page); await sleep(600)
await card(page, REF.C7, 'รับงาน').getByRole('button', { name: 'รับงาน', exact: true }).click()
log('R4.05 toasts:', await collect(page, 3000), mut.res)
await page.goto(`${BASE}/field/pending`); await settle(page); await sleep(800)
log('R4.05 pending:', await mainText(page, 400))
await shot(page, 'R4', 'R4.05-pending-empty')
await page.goto(`${BASE}/field/accepted`); await settle(page); await sleep(800)
log('R4.05 accepted:', await mainText(page, 1200))
await shot(page, 'R4', 'R4.05-in1-accepted', { fullPage: true })
log(q(SQL.asg))
log('console', consoleErrors, 'server', serverErrors)
await browser.close()
