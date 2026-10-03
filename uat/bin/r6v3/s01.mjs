// R6.01 เมนู/คิว/กระดิ่ง (อ่านอย่างเดียว) — non-GET ไป /api ถูก abort กันพลาด
import { openAs, shot, BASE, settle, sleep, log, R, flat } from './_h.mjs'
log('=== s01', new Date().toISOString())
for (const u of ['uat.mgr.in', 'uat.mgr.out', 'uat.sup.in', 'uat.finance', 'uat.exec']) {
  const s = await openAs(u); const { page, context } = s
  await context.route('**/api/**', r => (r.request().method() === 'GET' || r.request().url().includes('/api/auth/')) ? r.continue() : r.abort())
  await page.goto(`${BASE}/dashboard`); await settle(page)
  const nav = flat(await page.locator('aside').first().innerText().catch(() => ''))
  log(`R6.01 [${u}] nav has การเงิน=`, /การเงิน/.test(nav), '| nav:', nav.slice(0, 400))
  await page.goto(`${BASE}/finance?tab=comp`); await settle(page); await sleep(800)
  log(`R6.01 [${u}] url=`, page.url().replace(BASE, ''))
  if (page.url().includes('/finance')) {
    log(`R6.01 [${u}] tabs=`, JSON.stringify(await page.getByRole('tab').allInnerTexts()))
    const rows = await page.locator('tbody tr').allInnerTexts()
    log(`R6.01 [${u}] rows=${rows.length}`)
    for (const r of rows) log('   ', flat(r).slice(0, 260))
    log(`R6.01 [${u}] btn approve1=`, await page.getByRole('button', { name: 'อนุมัติขั้น 1' }).count(), 'reject=', await page.getByRole('button', { name: 'ตีกลับ' }).count())
    await shot(page, R, `R6.01-${u.replace('uat.', '')}-comp-tab`, { fullPage: true })
  }
  const r = await page.request.get(`${BASE}/api/compensation?status=all`)
  let j = {}; try { j = await r.json() } catch {}
  const d = Array.isArray(j.data) ? j.data : (j.data?.items ?? [])
  log(`R6.01 [${u}] API ${r.status()} n=${d.length} err=${j.error?.code ?? ''}`)
  const per = {}
  for (const it of d) { per[it.payeeName] = (per[it.payeeName] ?? 0) + it.grossSatang; log(`   ${it.caseRef ?? '—'} ${it.payeeName} ${it.expenseType} ${it.status} ${it.approvalStepCurrent}/${it.approvalStepTotal} g=${it.grossSatang} wht=${it.whtSatang} act=${it.viewerCanAct} basis=${(it.basisText ?? '').slice(0, 60)}`) }
  if (d.length) log(`R6.01 [${u}] per payee`, per)
  if (u.startsWith('uat.mgr')) {
    // กระดิ่ง
    const bell = page.getByRole('button', { name: /แจ้งเตือน/ }).first()
    if (await bell.count()) { await bell.click(); await sleep(1000); log(`R6.01 [${u}] bell:`, flat(await page.locator('[role="dialog"],[role="menu"],[data-radix-popper-content-wrapper]').last().innerText().catch(() => '(?)')).slice(0, 900)); await shot(page, R, `R6.01-${u.replace('uat.', '')}-bell`) }
    else log(`R6.01 [${u}] bell button not found`)
  }
  log(`R6.01 [${u}] console=`, s.consoleErrors.slice(0, 3), '5xx=', s.serverErrors)
  await s.browser.close()
}
