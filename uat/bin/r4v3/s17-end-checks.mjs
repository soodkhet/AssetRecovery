// R4.36 แจ้งเตือนทั้งรอบ (SQL + GET /api/field/notifications + กระดิ่ง) · ภาพกระดิ่งธุรการ (C4 ซ้ำ)
import { openAs, shot, BASE, settle, sleep, q, log, get } from './_h.mjs'
const R = 'R4v3'
const T0 = '2026-10-03 17:40:00+00' // v3 ต้นรอบ R4a
const flat = s => s.replace(/\s*\n+\s*/g, ' | ')
log('=== s17 R4b v3', new Date().toISOString())
for (const u of ['uat.agent.in1', 'uat.agent.in2', 'uat.agent.out1']) {
  const { browser, page, consoleErrors, serverErrors } = await openAs(u, { mobile: true })
  const r = await page.request.get(`${BASE}/api/field/notifications`)
  const j = await r.json().catch(() => ({}))
  const items = (j.data?.items ?? j.data ?? []).map(n => `${n.eventCode ?? n.event_code ?? ''}|${n.title}|${n.linkPath ?? n.link_path ?? ''}`)
  log(`R4.36 ${u} API ${r.status()} unread=${j.data?.unreadCount ?? '?'} items=${items.length}:`, items)
  log(`R4.36 ${u} DB:`, q(`select n.event_code,n.title,n.link_path,n.read_at is not null rd from notifications n join users u on u.id=n.user_id where u.username='${u}' order by n.created_at desc`).split('\n').slice(2, -1).map(s => s.replace(/\s+\|\s+/g, '|').trim()))
  await browser.close()
}
{
  const { browser, page } = await openAs('uat.admin')
  await page.goto(`${BASE}/dashboard`); await settle(page); await sleep(1000)
  await page.getByRole('button', { name: /แจ้งเตือน/ }).first().click(); await sleep(1200)
  const t = flat(await page.locator('body').innerText()); const i = t.indexOf('แจ้งเตือนล่าสุด')
  log('R4.36 admin bell:', t.slice(i, i + 900))
  await shot(page, R, '36-admin-bell-c4-twice')
  await browser.close()
}
