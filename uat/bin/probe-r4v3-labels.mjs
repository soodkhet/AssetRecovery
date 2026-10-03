// R4 v3 probe — อ่านอย่างเดียว: ยืนยัน label หน้า "เบิกค่าใช้จ่าย" หลังมติ PO Q21 + แคตตาล็อก job (ฐาน R3-end-v3 — ยังไม่มีเช็คอิน)
// ทุก request ที่ไม่ใช่ GET ไปที่ /api/** (ยกเว้น /api/auth/*) ถูก abort ที่ระดับ context — ไม่มี mutation
// รัน: node uat/bin/probe-r4v3-labels.mjs → stdout + ภาพ uat/shots/R4v3-probe/*
import { openAs, shot, BASE } from './lib.mjs'

const blocked = []
const clip = (s, n = 1500) => (s.length > n ? `${s.slice(0, n)} …(+${s.length - n})` : s)
const text = async (loc, n) => clip((await loc.innerText().catch(() => '')).replace(/\s*\n+\s*/g, ' | '), n)
async function guard(context) {
  await context.route('**/api/**', (route) => {
    const req = route.request()
    if (req.method() === 'GET' || req.url().includes('/api/auth/')) return route.continue()
    blocked.push(`${req.method()} ${req.url()}`)
    return route.abort()
  })
}
async function apiGet(page, path, n = 700) {
  const r = await page.request.get(`${BASE}${path}`)
  let body = ''
  try { body = JSON.stringify(await r.json()) } catch { body = (await r.text()).slice(0, 200) }
  return `${r.status()} ${clip(body, n)}`
}
async function go(page, path) {
  await page.goto(`${BASE}${path}`)
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(800)
}

{
  const s = await openAs('uat.agent.in1', { mobile: true })
  await guard(s.context)
  const { page } = s
  await go(page, '/field/expenses')
  console.log('\n===== in1 /field/expenses', page.url())
  console.log(await text(page.locator('main'), 1500))
  await shot(page, 'R4v3-probe', 'in1-expenses', { fullPage: true })
  console.log('\nAPI caseBound:', await apiGet(page, '/api/field/expenses?type=caseBound', 600))
  console.log('\nAPI income:', await apiGet(page, '/api/field/income-summary', 600))
  await s.browser.close()
}
{
  const s = await openAs('admin')
  await guard(s.context)
  const { page } = s
  console.log('\nAPI jobs (admin):', await apiGet(page, '/api/jobs?jobType=daily_field_allowance', 900))
  await s.browser.close()
}
console.log('\nblocked non-GET:', blocked.length, blocked)
