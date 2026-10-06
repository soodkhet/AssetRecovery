// Adjustment: การเงินสร้างรายการปรับปรุงรายได้ของงวด ก.ย. (ปิดแล้ว → ผู้บริหารอนุมัติ) · node adj.mjs create <ref> | approve <ref>
import { openAs, shot, log, q, collect, trackApi, U, clean } from './_h.mjs'
const [step, ref] = process.argv.slice(2)
const s = await openAs(step === 'create' ? 'uat.finance' : 'uat.exec'); const { page } = s; const api = trackApi(page)
await page.goto(U + '/finance?tab=adjustment'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1200)
if (step === 'create') {
  await page.getByRole('button', { name: '+ สร้าง Adjustment' }).click(); await page.waitForTimeout(1000)
  const d = page.getByRole('dialog').last()
  log('adj', 'types', await d.locator('select').first().evaluate(e => [...e.options].map(o => o.value + '=' + o.text)))
  await d.locator('select').first().selectOption({ index: 0 })
  await d.locator('input[placeholder^="เช่น CASE"]').fill(ref); await d.getByRole('button', { name: /ค้นหา/ }).first().click().catch(() => {}); await page.waitForTimeout(1500)
  const cand = d.locator('button', { hasText: ref }); log('adj', 'candidates', (await cand.allInnerTexts()).map(clean).slice(0, 3))
  await cand.first().click(); await page.waitForTimeout(600)
  log('adj', 'selected', clean(await d.innerText()).slice(0, 1200))
  const sel = d.locator('select').nth(1); if (await sel.count()) await sel.selectOption('decrease')
  const amt = d.locator('input[inputmode=decimal], input[placeholder="0.00"]').last(); await amt.fill('-10')
  await d.locator('textarea').last().fill('abc')
  const ok = d.getByRole('button', { name: 'สร้างรายการ' }); await page.waitForTimeout(500)
  log('adj', 'invalid (amount -10, reason 3 chars): create disabled=', await ok.isDisabled(), clean(await d.innerText()).match(/.{0,30}(ต้อง|อย่างน้อย|มากกว่า|ติดลบ).{0,50}/g)?.slice(-3))
  await amt.fill('100.00'); await d.locator('textarea').last().fill('ลดค่าบริการตามที่ตกลงกับลูกค้า (ด่าน 7 รอบทวน)')
  await shot(page, 'adj-form', { fullPage: true })
  await ok.click(); log('adj', 'create', await collect(page, 4000), api.splice(0).map(x => x.slice(0, 300)))
}
if (step === 'approve') {
  const row = page.locator('tr', { hasText: 'ลดค่าบริการตามที่ตกลงกับลูกค้า' }).first(); log('adj', 'row', clean(await row.innerText()), (await row.getByRole('button').allInnerTexts()).join('|'))
  await row.getByRole('button').first().click(); await page.waitForTimeout(1000)
  const d = page.getByRole('dialog').last(); log('adj', 'review', clean(await d.innerText()).slice(0, 900))
  for (const ta of await d.locator('textarea').all()) await ta.fill('อนุมัติปรับปรุงงวดปิด (ด่าน 7 รอบทวน)')
  await d.getByRole('button', { name: 'ยืนยันอนุมัติ' }).click(); log('adj', 'approve', await collect(page, 4000), api.splice(0).map(x => x.slice(0, 300)))
}
log('adj', q(`select status, adjustment_type, amount_satang, period_status_at_target, revenue_id is not null rev from adjustments order by created_at desc limit 1`))
log('adj', 'console', s.consoleErrors, s.serverErrors); await s.browser.close()
