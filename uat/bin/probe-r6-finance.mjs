// R6 probe — อ่านอย่างเดียว: หน้าการเงิน (/finance ทุกแท็บที่เกี่ยว R6) + /settings/finance?tab=payee|bankfile
// ของ uat.finance / uat.exec / uat.mgr.in · ทุก non-GET ไป /api/** (ยกเว้น /api/auth/*) และ Supabase ถูก abort
// ⇒ ไม่มี mutation · เปิด modal ได้เฉพาะที่ไม่ยิง API ตอนเปิด แล้วกด "ยกเลิก"/Escape เสมอ (ไม่กดปุ่มยืนยัน)
// รัน: node uat/bin/probe-r6-finance.mjs  → stdout + ภาพ uat/shots/R6-probe/*
import { openAs, shot, BASE } from './lib.mjs'

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
async function apiGet(page, path, n = 600) {
  const r = await page.request.get(`${BASE}${path}`)
  let body = ''
  try { body = JSON.stringify(await r.json()) } catch { body = (await r.text()).slice(0, 200) }
  return `${r.status()} ${clip(body, n)}`
}
async function apiCount(page, path) {
  const r = await page.request.get(`${BASE}${path}`)
  try {
    const j = await r.json()
    const d = Array.isArray(j.data) ? j.data : (j.data?.items ?? [])
    return { status: r.status(), n: d.length, data: d, err: j.error?.code }
  } catch { return { status: r.status(), n: -1, data: [] } }
}
async function dialogText(page) {
  const dlg = page.locator('[role="dialog"]').last()
  return (await dlg.count()) ? clip(flat(await dlg.innerText()), 1500) : '(no dialog)'
}
async function closeDialog(page) {
  const cancel = page.locator('[role="dialog"]').last().getByRole('button', { name: /ยกเลิก|ปิด/ }).first()
  if (await cancel.count()) await cancel.click().catch(() => {})
  else await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
}
async function tab(page, id, user) {
  await page.goto(`${BASE}/finance?tab=${id}`)
  await page.waitForLoadState('networkidle')
  console.log(`\n--- ${user} /finance?tab=${id} url=${page.url()}`)
  console.log('MAIN:', clip(flat(await page.locator('main').innerText()), 2600))
  await shot(page, 'R6-probe', `${user}-finance-${id}`, { fullPage: true })
}

for (const user of ['uat.finance', 'uat.exec', 'uat.mgr.in']) {
  const s = await openAs(user)
  await guard(s.context)
  const { page } = s
  console.log(`\n===================== ${user}`)
  await page.goto(`${BASE}/finance`)
  await page.waitForLoadState('networkidle')
  console.log('URL /finance →', page.url())
  console.log('NAV:', clip(flat(await page.locator('aside, nav').first().innerText().catch(() => '')), 600))
  if (!page.url().includes('/finance')) {
    console.log('(ไม่มีหน้า /finance)')
  } else {
    for (const id of ['comp', 'approval', 'payout', 'revenue']) await tab(page, id, user)
  }

  // API ที่ R6 ใช้ (GET)
  const comp = await apiCount(page, '/api/compensation?status=all')
  console.log(`API compensation: ${comp.status} n=${comp.n} err=${comp.err ?? ''}`)
  for (const it of comp.data) {
    console.log(`  ${it.caseRef ?? '— (ไม่ผูกเคส)'} ${it.payeeName} ${it.expenseType} ${it.status} step ${it.approvalStepCurrent}/${it.approvalStepTotal} role=${it.pendingStepRole} gross=${it.grossSatang} wht=${it.whtSatang} src=${it.whtRateSource} verified=${it.payeeVerified}`)
  }
  const adv = await apiCount(page, '/api/advances')
  console.log(`API advances: ${adv.status} n=${adv.n} err=${adv.err ?? ''}`, adv.data.map((a) => `${a.payeeName ?? ''}:${a.requestedSatang}:${a.status}:${a.dueClearDate}`).join(' · '))
  console.log('API payees:', await apiGet(page, '/api/payees', 900))
  console.log('API payout-batches:', await apiGet(page, '/api/payout-batches'))
  console.log('API revenues:', await apiGet(page, '/api/revenues'))
  console.log('API billing-batches:', await apiGet(page, '/api/billing-batches'))
  console.log('API bank-file-formats:', await apiGet(page, '/api/settings/bank-file-formats?status=active', 400))
  console.log('API bank-accounts:', await apiGet(page, '/api/settings/bank-accounts?status=active', 400))

  if (user === 'uat.finance') {
    // modal ที่เปิดได้โดยไม่ยิง API (ปุ่มยืนยันไม่กด)
    await page.goto(`${BASE}/finance?tab=payout`)
    await page.waitForLoadState('networkidle')
    const btn = page.getByRole('button', { name: /สร้างรอบจ่าย/ }).first()
    console.log('payout create button count=', await btn.count())
    if (await btn.count()) {
      await btn.click()
      await page.waitForTimeout(500)
      console.log('DIALOG create payout:', await dialogText(page))
      await shot(page, 'R6-probe', 'finance-create-payout-modal')
      await closeDialog(page)
    }
    await page.goto(`${BASE}/finance?tab=revenue`)
    await page.waitForLoadState('networkidle')
    const bb = page.getByRole('button', { name: /สร้างรอบวางบิล/ }).first()
    console.log('billing create button count=', await bb.count())
    if (await bb.count()) {
      await bb.click()
      await page.waitForTimeout(800)
      console.log('DIALOG create billing:', await dialogText(page))
      console.log('company options:', JSON.stringify(await page.locator('[role="dialog"] select').first().locator('option').allInnerTexts().catch(() => [])))
      await shot(page, 'R6-probe', 'finance-create-billing-modal')
      await closeDialog(page)
    }
    await page.goto(`${BASE}/finance?tab=approval`)
    await page.waitForLoadState('networkidle')
    const advRow = page.locator('tr', { hasText: '3,000.00' }).first()
    console.log('ADV1 row:', (await advRow.count()) ? flat(await advRow.innerText()) : '(none)')
    const apv = advRow.getByRole('button', { name: 'อนุมัติ' })
    if (await apv.count()) {
      await apv.click()
      await page.waitForTimeout(500)
      console.log('DIALOG approve advance:', await dialogText(page))
      await shot(page, 'R6-probe', 'finance-advance-approve-modal')
      await closeDialog(page)
    }
    const rej = advRow.getByRole('button', { name: 'ปฏิเสธ' })
    if (await rej.count()) {
      await rej.click()
      await page.waitForTimeout(500)
      console.log('DIALOG reject advance:', await dialogText(page))
      const confirm = page.locator('[role="dialog"]').last().getByRole('button', { name: /ยืนยันปฏิเสธ/ })
      console.log('reject confirm disabled (empty reason)=', await confirm.isDisabled().catch(() => 'n/a'))
      await closeDialog(page)
    }
    const claimBtn = page.getByRole('button', { name: /สร้างรายการเบิกเอง/ })
    console.log('manual claim button count=', await claimBtn.count())
    if (await claimBtn.count()) {
      await claimBtn.click()
      await page.waitForTimeout(800)
      console.log('DIALOG manual claim:', await dialogText(page))
      await closeDialog(page)
    }

    for (const t of ['payee', 'bankfile']) {
      await page.goto(`${BASE}/settings/finance?tab=${t}`)
      await page.waitForLoadState('networkidle')
      console.log(`\n--- uat.finance /settings/finance?tab=${t} url=${page.url()}`)
      console.log('MAIN:', clip(flat(await page.locator('main').innerText()), 2200))
      await shot(page, 'R6-probe', `finance-settings-${t}`, { fullPage: true })
    }
    await page.goto(`${BASE}/settings/finance?tab=payee`)
    await page.waitForLoadState('networkidle')
    for (const name of ['อนันต์ ตามทรัพย์', 'บุญมี ภาคสนาม', 'ประเสริฐ รับเหมา']) {
      const row = page.locator('tr', { hasText: name }).first()
      console.log(`payee row ${name}:`, (await row.count()) ? flat(await row.innerText()) : '(none)')
      const v = row.getByRole('button', { name: 'ยืนยัน', exact: true })
      console.log('  verify btn count=', await v.count(), 'disabled=', (await v.count()) ? await v.isDisabled() : 'n/a')
    }
    const v1 = page.locator('tr', { hasText: 'อนันต์ ตามทรัพย์' }).first().getByRole('button', { name: 'ยืนยัน', exact: true })
    if (await v1.count()) {
      await v1.click()
      await page.waitForTimeout(500)
      console.log('DIALOG verify payee:', await dialogText(page))
      const c = page.locator('[role="dialog"]').last().getByRole('button', { name: 'ยืนยันผู้รับเงิน' })
      console.log('verify confirm disabled (empty reason)=', await c.isDisabled().catch(() => 'n/a'))
      await shot(page, 'R6-probe', 'finance-verify-payee-modal')
      await closeDialog(page)
    }
    const add = page.getByRole('button', { name: /เพิ่ม Payee/ })
    if (await add.count()) {
      await add.click()
      await page.waitForTimeout(1000)
      console.log('DIALOG add payee:', await dialogText(page))
      console.log('user options:', JSON.stringify((await page.locator('[role="dialog"] select').first().locator('option').allInnerTexts().catch(() => [])).slice(0, 30)))
      await closeDialog(page)
    }
  }

  if (user === 'uat.mgr.in') {
    // คิวของผู้จัดการ: เห็น hotel (ไม่ผูกเคส/ไม่มี assignment) ไหม
    const hotel = comp.data.filter((it) => it.expenseType === 'hotel')
    console.log(`mgr.in sees hotel rows = ${hotel.length} (DB มี 1 แถว pending_approval)`)
  }
  console.log(`[${user}] console errors:`, JSON.stringify(s.consoleErrors.slice(0, 5)), 'server5xx:', JSON.stringify(s.serverErrors))
  await s.browser.close()
}
console.log('\nBLOCKED non-GET:', blocked.length, JSON.stringify(blocked.slice(0, 10)))
