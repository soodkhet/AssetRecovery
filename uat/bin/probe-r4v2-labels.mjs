// R4 v2 probe — อ่านอย่างเดียว: ยืนยัน label หน้าจอใหม่หลังแก้ตามมติ PO (R3-end-v2 — ยังไม่มีเคส scheduled/closed)
// ทุก request ที่ไม่ใช่ GET ไปที่ /api/** (ยกเว้น /api/auth/*) ถูก abort ที่ระดับ context — ไม่มี mutation
// รัน: node uat/bin/probe-r4v2-labels.mjs → stdout + ภาพ uat/shots/R4v2-probe/*
import { openAs, shot, BASE } from './lib.mjs'

const C1 = 'a10492d4-c805-4c7d-9ec4-a63fa730e9ea'
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

// ── 1) พนักงาน in1 (มือถือ) ─────────────────────────────────────────
{
  const s = await openAs('uat.agent.in1', { mobile: true })
  await guard(s.context)
  const { page } = s
  await go(page, '/field')
  console.log('\n===== in1 /field', page.url())
  console.log(await text(page.locator('main'), 1200))
  await shot(page, 'R4v2-probe', 'in1-dashboard', { fullPage: true })

  await go(page, '/field/pending')
  console.log('\n===== in1 /field/pending')
  console.log(await text(page.locator('main'), 1200))

  console.log('\nAPI /api/field/notifications:', await apiGet(page, '/api/field/notifications', 1200))
  // กระดิ่ง
  const bell = page.getByRole('button', { name: /แจ้งเตือน/ }).first()
  console.log('bell buttons:', await page.getByRole('button', { name: /แจ้งเตือน/ }).count())
  if ((await bell.count()) > 0) {
    await bell.click().catch(() => {})
    await page.waitForTimeout(800)
    console.log('bell panel:', await text(page.locator('body'), 900))
    await shot(page, 'R4v2-probe', 'in1-bell')
    await page.keyboard.press('Escape').catch(() => {})
  }

  await go(page, '/field/income')
  console.log('\n===== in1 /field/income')
  console.log(await text(page.locator('main'), 800))

  await go(page, '/field/expenses')
  console.log('\n===== in1 /field/expenses')
  console.log(await text(page.locator('main'), 800))
  const sep = page.getByRole('button', { name: 'เบิกแยก', exact: true }).first()
  if ((await sep.count()) > 0) {
    await sep.click()
    await page.waitForTimeout(500)
    console.log('tab เบิกแยก:', await text(page.locator('main'), 600))
    const hotelBtn = page.getByRole('button', { name: /เบิกที่พัก/ }).first()
    if ((await hotelBtn.count()) > 0) {
      await hotelBtn.click()
      await page.waitForTimeout(700)
      const dlg = page.getByRole('dialog').last()
      console.log('hotel dialog:', await text(dlg, 1200))
      console.log('hotel inputs:', JSON.stringify(await dlg.locator('input,select,textarea').evaluateAll((els) => els.map((e) => ({ tag: e.tagName, type: e.getAttribute('type'), aria: e.getAttribute('aria-label'), min: e.getAttribute('min'), max: e.getAttribute('max') })))))
      await shot(page, 'R4v2-probe', 'in1-hotel-modal', { fullPage: true })
      await page.keyboard.press('Escape').catch(() => {})
    }
  }

  await go(page, '/field/advances')
  console.log('\n===== in1 /field/advances', page.url())
  console.log(await text(page.locator('main'), 900))
  const advBtn = page.getByRole('button', { name: /ขอเงินทดรอง/ }).first()
  console.log('advance button count:', await page.getByRole('button', { name: /ขอเงินทดรอง/ }).count())
  if ((await advBtn.count()) > 0) {
    await advBtn.click()
    await page.waitForTimeout(700)
    const dlg = page.getByRole('dialog').last()
    console.log('advance dialog:', await text(dlg, 1200))
    console.log('advance inputs:', JSON.stringify(await dlg.locator('input,textarea').evaluateAll((els) => els.map((e) => ({ tag: e.tagName, type: e.getAttribute('type'), min: e.getAttribute('min'), ph: e.getAttribute('placeholder') })))))
    await shot(page, 'R4v2-probe', 'in1-advance-modal', { fullPage: true })
    await page.keyboard.press('Escape').catch(() => {})
  }
  // เมนู hamburger
  const menu = page.getByRole('button', { name: 'เปิดเมนู' }).first()
  if ((await menu.count()) > 0) {
    await menu.click()
    await page.waitForTimeout(500)
    console.log('\nmenu links:', JSON.stringify(await page.locator('a').evaluateAll((as) => [...new Set(as.map((a) => `${a.textContent?.trim()}→${a.getAttribute('href')}`))].slice(0, 30))))
    await shot(page, 'R4v2-probe', 'in1-menu')
  }
  console.log('in1 consoleErrors:', JSON.stringify(s.consoleErrors.slice(0, 5)), 'serverErrors:', JSON.stringify(s.serverErrors))
  await s.browser.close()
}

// ── 2) เจ้าหน้าที่อนุมัติเคส (desktop) — /cases/submit ─────────────────────
{
  const s = await openAs('uat.approver')
  await guard(s.context)
  const { page } = s
  await go(page, '/cases/submit')
  console.log('\n===== approver /cases/submit', page.url())
  console.log(await text(page.locator('main'), 1200))
  const selects = await page.locator('main select').evaluateAll((els) => els.map((e) => ({ aria: e.getAttribute('aria-label'), options: [...e.options].map((o) => o.textContent?.trim()) })))
  console.log('selects:', JSON.stringify(selects))
  console.log('tabs/buttons:', JSON.stringify([...new Set((await page.locator('main button').allInnerTexts()).map((b) => b.trim()).filter(Boolean))].slice(0, 40)))
  await shot(page, 'R4v2-probe', 'approver-cases-submit', { fullPage: true })
  const detailBtn = page.getByRole('button', { name: 'ดูรายละเอียด' }).first()
  console.log('ดูรายละเอียด count:', await page.getByRole('button', { name: 'ดูรายละเอียด' }).count())
  if ((await detailBtn.count()) > 0) {
    await detailBtn.click()
    await page.waitForTimeout(1200)
    const dlg = page.getByRole('dialog').last()
    console.log('detail dialog:', await text(dlg, 1500))
    console.log('dialog buttons:', JSON.stringify([...new Set((await dlg.locator('button').allInnerTexts()).map((b) => b.trim()).filter(Boolean))]))
    await shot(page, 'R4v2-probe', 'approver-case-detail', { fullPage: true })
  }
  console.log('API case detail C1 keys:', await apiGet(page, `/api/cases/${C1}`, 400))
  console.log('approver consoleErrors:', JSON.stringify(s.consoleErrors.slice(0, 5)), 'serverErrors:', JSON.stringify(s.serverErrors))
  await s.browser.close()
}

// ── 3) ธุรการ — เมนูคลังสินค้า (Q1) ────────────────────────────────────
{
  const s = await openAs('uat.admin')
  await guard(s.context)
  const { page } = s
  await go(page, '/warehouse')
  console.log('\n===== admin /warehouse', page.url())
  console.log(await text(page.locator('main'), 600))
  await shot(page, 'R4v2-probe', 'admin-warehouse')
  await s.browser.close()
}

console.log('\nblocked non-GET:', blocked.length, JSON.stringify(blocked))
