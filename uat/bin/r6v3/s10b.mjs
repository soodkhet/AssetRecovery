// R6.10 ต่อ: ตรวจหลังบ้าน + mgr.in ขั้น 1 ใหม่ + กระดิ่ง in2
import { openAs, shot, BASE, settle, sleep, log, R, X, q, uiApprove, TL, flat } from './_h.mjs'
log('=== s10b', new Date().toISOString())
log(q(`select status,approval_step_current cur,gross_satang,revision_note from expenses where id='${X.C3a}'`))
log(q(`select a.action,u.username,a.after_data->'events' ev from audit_logs a join users u on u.id=a.actor_id where target_id='${X.C3a}' and a.created_at > '2026-10-03 18:57:52+00' order by a.created_at`))
const i = await openAs('uat.agent.in2', { mobile: true }); await i.page.goto(`${BASE}/field`); await settle(i.page)
const b = i.page.locator('a[href*="notification"], button[aria-label*="แจ้งเตือน"]').first()
log('R6.10 in2 bell el:', await b.count()); if (await b.count()) { await b.click(); await sleep(1000); log('R6.10 in2 bell:', flat(await i.page.locator('body').innerText()).match(/แจ้งเตือน.{0,300}/)?.[0]); await shot(i.page, R, 'R6.10-in2-bell') }
await i.browser.close()
const m = await openAs('uat.mgr.in'); await m.page.goto(`${BASE}/finance?tab=comp`); await settle(m.page); await sleep(500)
const [st, ts] = await uiApprove(m.page, 'UAT-CO2-003', TL.a, 1); log('R6.10 mgr.in re-approve:', st.slice(0, 60), ts.at(-1))
await shot(m.page, R, 'R6.10-mgr-in-reapprove')
await m.browser.close()
log(q(`select status,approval_step_current cur,approval_step_total tot,jsonb_array_length(approval_history) h from expenses where id='${X.C3a}'`))
