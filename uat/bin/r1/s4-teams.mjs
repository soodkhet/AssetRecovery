import { execSync } from 'node:child_process'
import { openAs, shot, BASE, toasts, inlineErrors, fields, trackMutations, settle, log, sleep } from './_h.mjs'
const s = await openAs('admin')
const { page } = s
const m = trackMutations(page)
async function fill(dlg, t) {
  await dlg.locator('#team-name').fill(t.name)
  await dlg.locator('#team-side').selectOption(t.side)
  const opts = await dlg.locator('#team-plan option').allInnerTexts()
  log(t.name, 'plan options after side', JSON.stringify(opts))
  await dlg.locator('#team-plan').selectOption({ label: opts.find(o => o.startsWith(t.plan + ' (')) })
  log(t.name, 'supervisor', await dlg.locator('#team-supervisor').inputValue(), JSON.stringify(await dlg.locator('#team-supervisor option').allInnerTexts()))
  await dlg.locator('#team-status').selectOption('active')
  for (const p of t.provinces) await dlg.getByRole('checkbox', { name: p, exact: true }).first().check()
  await dlg.locator('#team-reason').fill(t.reason)
}
await page.goto(`${BASE}/settings/teams`); await settle(page)
// R1.13
await page.getByRole('button', { name: '+ สร้างทีม' }).click()
let dlg = page.getByRole('dialog')
log('R1.13 title', await dlg.locator('h2,h3').first().innerText())
log('R1.13 fields(head)\n  ' + (await fields(dlg)).split('\n').filter(l => l.includes('#team')).join('\n'))
await fill(dlg, { name: 'UAT ทีม A กรุงเทพ', side: 'inhouse', plan: 'UAT Inhouse', provinces: ['กรุงเทพมหานคร', 'สมุทรปราการ'], reason: 'ตั้งทีม A กรุงเทพสำหรับ UAT รอบที่ 1' })
log('R1.13 manager section', (await dlg.innerText()).match(/ผู้จัดการทีม[^\n]*\n[^\n]*/)?.[0])
await shot(page, 'R1', 'R1.13-team-a-form', { fullPage: true })
await dlg.getByRole('button', { name: 'สร้างทีม', exact: true }).click()
log('R1.13 toast', await toasts(page))
await settle(page)
await shot(page, 'R1', 'R1.13-team-a-done', { fullPage: true })
log('R1.13 main', (await page.locator('main').innerText()).replace(/\n+/g, ' | ').slice(0, 700))

// R1.14 race via API
const planId = execSync(`uat/bin/q.sh "select id from compensation_plans where name='UAT Inhouse' and is_current" | sed -n 4p`).toString().trim()
log('R1.14 planId', planId)
const body = { name: 'UAT ทีม B นนทบุรี (ว่าง)', side: 'inhouse', compensationPlanId: planId, supervisorId: null, managerIds: [], provinces: ['นนทบุรี'], status: 'active', reason: 'ตั้งทีม B นนทบุรีสำหรับ UAT รอบที่ 1 (ทดสอบคำขอพร้อมกัน)' }
const [a, b] = await Promise.all([1, 2].map(() => page.request.post(`${BASE}/api/teams`, { data: body })))
log('R1.14 A', a.status(), (await a.text()).slice(0, 300))
log('R1.14 B', b.status(), (await b.text()).slice(0, 300))
await page.reload(); await settle(page)
await shot(page, 'R1', 'R1.14-team-b-list', { fullPage: true })
log('R1.14 main', (await page.locator('main').innerText()).replace(/\n+/g, ' | ').slice(0, 900))

// R1.15 team C dblclick
await page.getByRole('button', { name: '+ สร้างทีม' }).click()
dlg = page.getByRole('dialog')
await dlg.locator('#team-side').selectOption('outsource')
log('R1.15 plan options when outsource', JSON.stringify(await dlg.locator('#team-plan option').allInnerTexts()))
await fill(dlg, { name: 'UAT ทีม C ปทุมธานี (OS)', side: 'outsource', plan: 'UAT Outsource เหมา', provinces: ['ปทุมธานี'], reason: 'ตั้งทีม C ปทุมธานีฝั่ง Outsource สำหรับ UAT รอบที่ 1' })
await shot(page, 'R1', 'R1.15-team-c-form', { fullPage: true })
const n0 = m.reqs.length
await dlg.getByRole('button', { name: 'สร้างทีม', exact: true }).dblclick()
log('R1.15 toast', await toasts(page, 2500))
await settle(page)
log('R1.15 new reqs', m.reqs.slice(n0), 'res', m.res)
const os = page.getByRole('button', { name: 'Outsource', exact: true })
if (await os.count()) await os.first().click()
await settle(page)
await shot(page, 'R1', 'R1.15-team-c-done', { fullPage: true })
log('R1.15 main', (await page.locator('main').innerText()).replace(/\n+/g, ' | ').slice(0, 700))
log('consoleErrors', s.consoleErrors, 'serverErrors', s.serverErrors)
await s.browser.close()
