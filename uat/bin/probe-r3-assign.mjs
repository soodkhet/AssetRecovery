// R3 probe — อ่านอย่างเดียว: หน้า /cases/assign ของผู้จัดการ/หัวหน้า, หน้า settings นโยบายมอบหมาย, หน้า field ของพนักงาน
// ทุก request ที่ไม่ใช่ GET ไปที่ /api/** (ยกเว้น /api/auth/*) ถูก abort ทิ้งที่ระดับ context — ไม่มีทางเกิด mutation
// รัน: node uat/bin/probe-r3-assign.mjs  → ผลเป็นข้อความ stdout + ภาพ uat/shots/R3-probe/*
import { openAs, shot, BASE } from './lib.mjs'

const TEAM_A = '8dc4fa90-cb6e-425f-9778-3a872b687ff2'
const TEAM_B = '5074e06b-0925-4571-a1d0-20defad46e70'
const TEAM_C = 'c89d6982-25f8-4457-aeb6-4c1ab0189c95'
const blocked = []

async function guard(context) {
  await context.route('**/api/**', (route) => {
    const req = route.request()
    if (req.method() === 'GET' || req.url().includes('/api/auth/')) return route.continue()
    blocked.push(`${req.method()} ${req.url()}`)
    return route.abort()
  })
}

const clip = (s, n = 1800) => (s.length > n ? `${s.slice(0, n)} …(+${s.length - n})` : s)

async function apiGet(page, path) {
  const r = await page.request.get(`${BASE}${path}`)
  let body = ''
  try { body = JSON.stringify(await r.json()) } catch { body = (await r.text()).slice(0, 200) }
  return `${r.status()} ${clip(body, 600)}`
}

async function assignPage(username, tag) {
  const s = await openAs(username)
  await guard(s.context)
  await s.page.goto(`${BASE}/cases/assign`)
  await s.page.waitForLoadState('networkidle')
  console.log(`\n===== ${username} /cases/assign url=${s.page.url()}`)
  const main = s.page.locator('main')
  console.log(clip((await main.innerText()).replace(/\n+/g, ' | '), 2500))
  const buttons = await s.page.locator('main button').allInnerTexts()
  console.log('buttons:', JSON.stringify([...new Set(buttons.map((b) => b.trim()).filter(Boolean))]))
  console.log('count "มอบหมาย" buttons:', await s.page.getByRole('button', { name: 'มอบหมาย', exact: true }).count())
  console.log('count disabled buttons:', await s.page.locator('main button[disabled]').count())
  await shot(s.page, 'R3-probe', `${tag}-list`, { fullPage: true })
  console.log('API /api/assignments:', await apiGet(s.page, '/api/assignments?limit=50'))
  for (const [k, t] of [['A', TEAM_A], ['B', TEAM_B], ['C', TEAM_C]]) {
    console.log(`API team ${k} agents:`, await apiGet(s.page, `/api/teams/${t}/agents`))
  }
  return s
}

// 1) ผู้จัดการ inhouse
{
  const s = await assignPage('uat.mgr.in', 'mgr-in')
  const row = s.page.locator('tr', { hasText: 'UAT-CO1-001' }).first()
  if (await row.count()) {
    await row.getByRole('button', { name: 'มอบหมาย', exact: true }).click()
    await s.page.waitForTimeout(1500)
    const dlg = s.page.locator('[role="dialog"]').first()
    console.log('MODAL:', clip((await dlg.innerText()).replace(/\n+/g, ' | '), 1500))
    await shot(s.page, 'R3-probe', 'mgr-in-modal-C1')
    await s.page.keyboard.press('Escape')
  }
  // team filter → B
  const sel = s.page.getByLabel('กรองตามทีม')
  if (await sel.count()) {
    console.log('team options:', JSON.stringify(await sel.locator('option').allInnerTexts()))
    await sel.selectOption({ label: 'UAT ทีม B นนทบุรี (ว่าง)' }).catch((e) => console.log('select B fail', e.message))
    await s.page.waitForTimeout(1500)
    console.log('LIST team B:', clip((await s.page.locator('main').innerText()).replace(/\n+/g, ' | '), 800))
    await shot(s.page, 'R3-probe', 'mgr-in-teamB-filter')
  }
  console.log('API kanban B:', await apiGet(s.page, `/api/teams/${TEAM_B}/kanban`))
  console.log('API C6 pending_review (assignments search):', await apiGet(s.page, '/api/assignments?search=UAT-CO1-006'))
  await s.browser.close()
}

// 2) หัวหน้าทีม inhouse
{
  const s = await assignPage('uat.sup.in', 'sup-in')
  await s.browser.close()
}

// 3) ผู้จัดการ outsource
{
  const s = await assignPage('uat.mgr.out', 'mgr-out')
  console.log('API team A kanban (ต้องไม่เห็น):', await apiGet(s.page, `/api/teams/${TEAM_A}/kanban`))
  await s.browser.close()
}

// 4) Superadmin: settings tab assignment
{
  const s = await openAs('admin')
  await guard(s.context)
  await s.page.goto(`${BASE}/settings/finance?tab=assignment`)
  await s.page.waitForLoadState('networkidle')
  console.log('\n===== admin settings assignment')
  console.log(clip((await s.page.locator('main').innerText()).replace(/\n+/g, ' | '), 1800))
  console.log('timeout value:', await s.page.locator('#assignment-reassign-timeout').inputValue().catch(() => 'n/a'))
  const boxes = s.page.locator('main input[type="checkbox"]')
  for (let i = 0; i < (await boxes.count()); i++) console.log('checkbox', i, await boxes.nth(i).isChecked())
  await shot(s.page, 'R3-probe', 'admin-settings-assignment', { fullPage: true })
  console.log('API policy:', await apiGet(s.page, '/api/settings/assignment-policy'))
  console.log('API jobs list:', await apiGet(s.page, '/api/jobs?jobType=reassign_timeout&limit=5'))
  await s.browser.close()
}

// 5) พนักงาน: หน้า field (มือถือ) + notifications
for (const u of ['uat.agent.in1', 'uat.agent.in2']) {
  const s = await openAs(u, { mobile: true })
  await guard(s.context)
  await s.page.goto(`${BASE}/field`)
  await s.page.waitForLoadState('networkidle')
  console.log(`\n===== ${u} /field url=${s.page.url()}`)
  console.log(clip((await s.page.locator('body').innerText()).replace(/\n+/g, ' | '), 900))
  await shot(s.page, 'R3-probe', `${u}-field`)
  console.log('API field notifications:', await apiGet(s.page, '/api/field/notifications'))
  console.log('API /api/assignments (ต้อง 403):', await apiGet(s.page, '/api/assignments'))
  await s.browser.close()
}

console.log('\nBLOCKED non-GET:', JSON.stringify(blocked))
