// R3.18 mgr.out C5 → out1 + probe ซ้ำ · R3.19 Kanban
import { openAs, shot, BASE, log, q, SQL, post, get, sleep, collect, trackApi, rowText, C, U, TEAM_A, TEAM_B, TEAM_C } from './_h.mjs'
const go = async (p) => { await p.goto(`${BASE}/cases/assign`); await p.waitForLoadState('networkidle'); await sleep(800) }
log('\n===== R3.18', new Date().toISOString())
const o = await openAs('uat.mgr.out'); const oApi = trackApi(o.page); await go(o.page)
await o.page.locator('tr', { hasText: 'UAT-CO2-005' }).first().getByRole('button', { name: 'มอบหมาย', exact: true }).click()
const d = o.page.getByRole('dialog'); await d.waitFor(); await sleep(1200)
log('cards:', await d.getByText(/เคสในมือ/).count(), 'ประเสริฐ:', await d.getByText('ประเสริฐ รับเหมา').count())
await d.getByText('ประเสริฐ รับเหมา').first().click(); await sleep(300)
await shot(o.page, 'R3', '18-mgrout-assign-C5-modal')
await d.getByRole('button', { name: 'ยืนยันมอบหมาย' }).click()
log('toasts:', await collect(o.page, 3000)); log('api:', oApi.splice(0))
await go(o.page); log('row C5:', await rowText(o.page, 'UAT-CO2-005'))
await shot(o.page, 'R3', '18-mgrout-list-after')
log('assign again', await post(o.page, `/api/cases/${C.C5}/assign`, { agentId: U.out1 }))
log('reassign same', await post(o.page, `/api/cases/${C.C5}/reassign`, { agentId: U.out1, reason: 'probe คนเดิม' }))
log(q(`select c.case_ref,u.username,a.status,cb.username by_user from case_assignments a join cases c on c.id=a.case_id join users u on u.id=a.agent_id join users cb on cb.id=a.created_by where c.case_ref='UAT-CO2-005'`))
log(q(`select a.actor_role,a.action,r.name role_name,r.role_group from audit_logs a left join roles r on r.name=a.actor_role where a.target_type='case_assignments' and a.actor_id='${U.mgrOut}'`).replace(/\n\(\d+ rows?\)/, ''))

log('\n===== R3.19', new Date().toISOString())
async function kanban(sess, who, teamLabels) {
  await go(sess.page)
  await sess.page.getByRole('button', { name: 'ดูภาพรวมทีม' }).click(); await sess.page.waitForLoadState('networkidle'); await sleep(1500)
  const sel = sess.page.locator('main select').first()
  for (const lbl of teamLabels) {
    const opts = await sel.locator('option').allInnerTexts()
    const o2 = opts.find(x => x.includes(lbl)); if (o2) { await sel.selectOption({ label: o2 }); await sleep(1500) }
    const txt = (await sess.page.locator('main').innerText()).replace(/\s*\n+\s*/g, ' | ')
    const i = txt.indexOf('ขอนแก่น'); const tail = txt.slice(txt.lastIndexOf('นราธิวาส') > 0 ? txt.lastIndexOf('นราธิวาส') : (i > 0 ? i : 0))
    log(`${who} kanban ${lbl}:`, tail.slice(0, 900))
    await shot(sess.page, 'R3', `19-${who}-kanban-${lbl.replace(/\s/g, '')}`, { fullPage: true })
  }
}
const m = await openAs('uat.mgr.in'); await kanban(m, 'mgrin', ['ทีม A', 'ทีม B'])
const s = await openAs('uat.sup.in'); await kanban(s, 'supin', ['ทีม A'])
await kanban(o, 'mgrout', ['ทีม C'])
const ag = JSON.parse((await m.page.request.get(`${BASE}/api/teams/${TEAM_A}/agents`).then(r => r.text())))
log('A agents:', ag.data.agents.map(a => `${a.fullName} active=${a.activeCaseCount} success=${a.successRate}`))
const ago = JSON.parse((await o.page.request.get(`${BASE}/api/teams/${TEAM_C}/agents`).then(r => r.text())))
log('C agents:', ago.data.agents.map(a => `${a.fullName} active=${a.activeCaseCount} success=${a.successRate}`))
log('console o:', o.consoleErrors, o.serverErrors, 'm:', m.consoleErrors, m.serverErrors, 's:', s.consoleErrors)
for (const x of [o, m, s]) await x.browser.close()
