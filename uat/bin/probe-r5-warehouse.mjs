// R5 probe — อ่านอย่างเดียว: หน้า /warehouse ของธุรการ + ผู้ใช้บริษัท (CO1/CO2)
// ทุก request ที่ไม่ใช่ GET ไปที่ /api/** (ยกเว้น /api/auth/*) และทุก non-GET ไป Supabase ถูก abort ที่ระดับ context
// ⇒ ไม่มี mutation · ไม่แตะ file input (ไม่อัปโหลด) · ไม่กดปุ่มที่ผ่าน validation ฝั่ง client แล้วจะยิง API
// รัน: node uat/bin/probe-r5-warehouse.mjs  → stdout + ภาพ uat/shots/R5-probe/*
import { openAs, shot, BASE } from './lib.mjs'

const ASSET = {
  C1: 'c7d95a2c-d7be-4f94-b3f0-d2369b61772f',
  C2: '09ceddf8-3e90-4979-bdbc-6ae7fd3642f1',
  C4: 'aed32462-4a4a-4429-bd48-fe636161b4ca',
  C5: 'e23d8891-cc73-4a06-b8bb-4a5cf9bc3582',
}
const RANDOM_LOT = '00000000-0000-4000-8000-000000000000'
const blocked = []

async function guard(context) {
  await context.route('**/*', (route) => {
    const req = route.request()
    const url = req.url()
    const isApi = url.startsWith(`${BASE}/api/`) && !url.includes('/api/auth/')
    const isSupabase = url.includes('supabase.co')
    if (req.method() !== 'GET' && req.method() !== 'HEAD' && (isApi || isSupabase)) {
      blocked.push(`${req.method()} ${url}`)
      return route.abort()
    }
    return route.continue()
  })
}

const clip = (s, n = 1800) => (s.length > n ? `${s.slice(0, n)} …(+${s.length - n})` : s)
const flat = (s) => s.replace(/\s*\n+\s*/g, ' | ')

async function apiGet(page, path, n = 700) {
  const r = await page.request.get(`${BASE}${path}`)
  let body = ''
  try { body = JSON.stringify(await r.json()) } catch { body = (await r.text()).slice(0, 200) }
  return `${r.status()} ${clip(body, n)}`
}

async function dialogText(page) {
  const dlg = page.locator('[role="dialog"]').last()
  return (await dlg.count()) ? clip(flat(await dlg.innerText()), 1600) : '(no dialog)'
}

// ── 1) ธุรการ ────────────────────────────────────────────────────────────────
{
  const s = await openAs('uat.admin')
  await guard(s.context)
  const { page } = s
  await page.goto(`${BASE}/warehouse`)
  await page.waitForLoadState('networkidle')
  console.log(`\n===== uat.admin /warehouse url=${page.url()}`)
  console.log('NAV:', clip(flat(await page.locator('header, nav').first().innerText()), 500))
  console.log('MAIN:', clip(flat(await page.locator('main').innerText()), 2500))
  console.log('tabs(role=tab):', JSON.stringify(await page.getByRole('tab').allInnerTexts()))
  console.log('tablist buttons:', JSON.stringify(await page.locator('[aria-label="แท็บคลังสินค้า"] button').allInnerTexts()))
  for (const ref of ['UAT-CO1-001', 'UAT-CO1-002', 'UAT-CO1-004', 'UAT-CO2-005', 'UAT-CO2-003']) {
    const row = page.locator('tr', { hasText: ref })
    console.log(`row ${ref}: count=${await row.count()}`, (await row.count()) ? flat(await row.first().innerText()) : '')
  }
  await shot(page, 'R5-probe', 'admin-intake-tab', { fullPage: true })

  // modal รับเข้าคลัง C1 — ตรวจ validation ฝั่ง client เท่านั้น
  const rowC1 = page.locator('tr', { hasText: 'UAT-CO1-001' }).first()
  await rowC1.getByRole('button', { name: 'รับเข้าคลัง', exact: true }).click()
  await page.waitForTimeout(800)
  console.log('\nINTAKE MODAL:', await dialogText(page))
  const dlg = page.locator('[role="dialog"]').last()
  const imei = dlg.getByLabel('IMEI ที่ตรวจจริงบนเครื่อง')
  console.log('getByLabel IMEI count:', await imei.count(), '| placeholder count:', await dlg.getByPlaceholder('พิมพ์หรือสแกน IMEI').count())
  const imeiBox = (await imei.count()) ? imei : dlg.getByPlaceholder('พิมพ์หรือสแกน IMEI')
  console.log('condition buttons:', JSON.stringify(await dlg.locator('button[aria-pressed]').allInnerTexts()))
  console.log('photo labels:', JSON.stringify(await dlg.locator('label:has(input[type=file])').allInnerTexts()))
  console.log('note getByLabel:', await dlg.getByLabel('รายละเอียดสภาพเครื่อง').count(), '| placeholder:', await dlg.getByPlaceholder('อธิบายสภาพที่พบ เช่น จอร้าว ไม่มีสายชาร์จ').count())

  // (a) ไม่เลือกสภาพ + IMEI ตรง → client INTAKE_MISSING_CONDITION (ไม่ยิง API)
  await imeiBox.fill('356789100000011')
  await page.waitForTimeout(300)
  await dlg.getByRole('button', { name: 'ยืนยันรับเข้าคลัง' }).click()
  await page.waitForTimeout(600)
  console.log('\n(a) no condition:', await dialogText(page))
  await shot(page, 'R5-probe', 'admin-intake-no-condition')
  // (b) 14 หลัก + ปกติ
  await dlg.getByRole('button', { name: 'ปกติ', exact: true }).click()
  await imeiBox.fill('35678910000001')
  await page.waitForTimeout(300)
  await dlg.getByRole('button', { name: 'ยืนยันรับเข้าคลัง' }).click()
  await page.waitForTimeout(600)
  console.log('\n(b) 14 digits:', await dialogText(page))
  await shot(page, 'R5-probe', 'admin-intake-imei14')
  // (c) มีขีด
  await imeiBox.fill('356789-100000011')
  await page.waitForTimeout(300)
  console.log('\n(c) dash value in box:', await imeiBox.inputValue(), '|', await dialogText(page))
  await shot(page, 'R5-probe', 'admin-intake-imei-dash')
  // (d) 15 หลักไม่ตรง → กดยืนยันครั้งแรก = เตือน (ไม่ยิง API) แล้วปุ่มเปลี่ยนป้าย — **ห้ามกดครั้งที่สอง**
  await imeiBox.fill('356789100000999')
  await page.waitForTimeout(300)
  await dlg.getByRole('button', { name: 'ยืนยันรับเข้าคลัง' }).click()
  await page.waitForTimeout(600)
  console.log('\n(d) mismatch after 1st click:', await dialogText(page))
  console.log('footer buttons:', JSON.stringify(await dlg.locator('button').allInnerTexts()))
  await shot(page, 'R5-probe', 'admin-intake-imei-mismatch')
  // (e) เว้นวรรคหน้า — UI trim แล้วถือว่าตรงไหม
  await imeiBox.fill(' 356789100000011')
  await page.waitForTimeout(300)
  console.log('\n(e) leading space:', await dialogText(page))
  // (f) ตรง + ชำรุด ไม่มีรายละเอียด → client INTAKE_MISSING_NOTE
  await imeiBox.fill('356789100000011')
  await dlg.getByRole('button', { name: 'ชำรุด', exact: true }).click()
  await page.waitForTimeout(300)
  await dlg.getByRole('button', { name: 'ยืนยันรับเข้าคลัง' }).click()
  await page.waitForTimeout(600)
  console.log('\n(f) damaged no note:', await dialogText(page))
  await shot(page, 'R5-probe', 'admin-intake-damaged-no-note')
  await dlg.getByRole('button', { name: 'ยกเลิก' }).click()
  await page.waitForTimeout(500)

  // modal ตีกลับ C2 — กดยืนยันโดยไม่กรอกเหตุผล (client REJECT_MISSING_REASON)
  const rowC2 = page.locator('tr', { hasText: 'UAT-CO1-002' }).first()
  await rowC2.getByRole('button', { name: 'ตีกลับ', exact: true }).click()
  await page.waitForTimeout(800)
  console.log('\nREJECT MODAL:', await dialogText(page))
  const rdlg = page.locator('[role="dialog"]').last()
  console.log('reason getByLabel:', await rdlg.getByLabel('เหตุผลที่ตีกลับ').count())
  await rdlg.getByRole('button', { name: 'ยืนยันตีกลับ' }).click()
  await page.waitForTimeout(600)
  console.log('reject empty:', await dialogText(page))
  await shot(page, 'R5-probe', 'admin-reject-empty')
  await rdlg.getByRole('button', { name: 'ยกเลิก' }).click()
  await page.waitForTimeout(500)

  // แท็บอื่น
  for (const name of ['ในคลัง', 'รอส่งมอบ', 'ส่งมอบแล้ว']) {
    const tab = page.locator('[aria-label="แท็บคลังสินค้า"]').getByRole('button', { name: new RegExp(`^${name}`) })
    const tabAlt = page.getByRole('tab', { name: new RegExp(`^${name}`) })
    const target = (await tab.count()) ? tab.first() : tabAlt.first()
    await target.click()
    await page.waitForTimeout(1200)
    console.log(`\nTAB ${name}:`, clip(flat(await page.locator('main').innerText()), 900))
    await shot(page, 'R5-probe', `admin-tab-${name}`)
  }

  console.log('\nAPI /api/assets:', await apiGet(page, '/api/assets?limit=50', 2500))
  console.log('API /api/assets/C1:', await apiGet(page, `/api/assets/${ASSET.C1}`, 1500))
  console.log('API /api/handover-lots:', await apiGet(page, '/api/handover-lots?limit=50'))
  console.log('API /api/notifications:', await apiGet(page, '/api/notifications?limit=10', 1500))

  // กระดิ่ง
  const bell = page.getByRole('button', { name: /แจ้งเตือน/ }).first()
  if (await bell.count()) {
    await bell.click()
    await page.waitForTimeout(1000)
    console.log('\nBELL:', clip(flat(await page.locator('body').innerText()).split('แจ้งเตือนล่าสุด')[1] ?? '(panel?)', 1200))
    await shot(page, 'R5-probe', 'admin-bell')
  }
  console.log('admin consoleErrors:', JSON.stringify(s.consoleErrors.slice(0, 8)))
  console.log('admin serverErrors:', JSON.stringify(s.serverErrors))
  await s.browser.close()
}

// ── 2) ผู้ใช้บริษัท ─────────────────────────────────────────────────────────
for (const [user, own, other] of [
  ['uat.co1.mgr', 'C1', 'C5'],
  ['uat.co2.admin', 'C5', 'C1'],
]) {
  const s = await openAs(user)
  await guard(s.context)
  const { page } = s
  await page.goto(`${BASE}/warehouse`)
  await page.waitForLoadState('networkidle')
  console.log(`\n===== ${user} /warehouse url=${page.url()}`)
  console.log('NAV:', clip(flat(await page.locator('header, nav').first().innerText()), 500))
  console.log('MAIN:', clip(flat(await page.locator('main').innerText()), 1500))
  console.log('main buttons:', JSON.stringify([...new Set((await page.locator('main button').allInnerTexts()).map((b) => b.trim()).filter(Boolean))]))
  console.log('count "รับเข้าคลัง"/"ตีกลับ" row buttons:',
    await page.locator('main tr').getByRole('button', { name: 'รับเข้าคลัง', exact: true }).count(),
    await page.locator('main tr').getByRole('button', { name: 'ตีกลับ', exact: true }).count())
  await shot(page, 'R5-probe', `${user}-warehouse`, { fullPage: true })
  console.log('API /api/assets:', await apiGet(page, '/api/assets?limit=50', 1500))
  console.log(`API own ${own}:`, await apiGet(page, `/api/assets/${ASSET[own]}`, 900))
  console.log(`API other ${other}:`, await apiGet(page, `/api/assets/${ASSET[other]}`))
  console.log('API lot random:', await apiGet(page, `/api/handover-lots/${RANDOM_LOT}`))
  console.log('API lot pdf random:', await apiGet(page, `/api/handover-lots/${RANDOM_LOT}/pdf`))
  console.log(`${user} serverErrors:`, JSON.stringify(s.serverErrors))
  await s.browser.close()
}

console.log('\nBLOCKED non-GET:', blocked.length, JSON.stringify(blocked))
