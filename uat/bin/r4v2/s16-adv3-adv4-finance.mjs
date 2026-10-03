// R4.33 in2 ADV3 (probe วันย้อนหลังบนหน้าจอ → วันนี้) · R4.34 out1 ADV-MAX (ADVANCE_EXCEEDS_MAX) → ADV4 · R4.35 การเงินเห็น ADV1–ADV4 (ห้ามกด)
import { openAs, shot, BASE, settle, sleep, collect, trackMutations, mainText, q, log } from './_h.mjs'
const R = 'R4v2'
const TODAY = '2026-10-03', YESTERDAY = '2026-10-02', TODAY7 = '2026-10-10'
const flat = s => s.replace(/\s*\n+\s*/g, ' | ')
const ADVQ = `select u.username,a.requested_satang,a.approved_satang,a.status,a.due_clear_date,a.purpose,a.id from advances a join payee_profiles p on p.id=a.payee_id join users u on u.id=p.user_id order by a.created_at`
log('=== s16 R4b v2', new Date().toISOString())
async function openModal(page) {
  await page.getByRole('button', { name: /ขอเงินทดรอง/ }).click(); await sleep(800)
  const ad = page.getByRole('dialog').filter({ hasText: 'ขอเบิกเงินทดรองจ่าย' }).last(); await ad.waitFor()
  return { ad, amt: ad.locator('input[inputmode=decimal]'), pur: ad.locator('textarea'), date: ad.locator('input[type=date]'), send: ad.getByRole('button', { name: 'ส่งคำขออนุมัติ' }),
    err: async () => (await ad.locator('.text-red-600, [role=alert]').allInnerTexts().catch(() => [])).map(s => s.trim()).filter(s => s && !s.startsWith('⚠️ กฎ')) }
}
// R4.33
{
  const { browser, page, consoleErrors, serverErrors } = await openAs('uat.agent.in2', { mobile: true })
  const mut = trackMutations(page)
  await page.goto(`${BASE}/field/advances`); await settle(page); await sleep(1000)
  log('R4.33 in2 advances:', await mainText(page, 300))
  const m = await openModal(page)
  await m.amt.fill('2000'); await m.pur.fill('UAT ADV3 ปล่อยเกินกำหนดเคลียร์เพื่อทดสอบ overdue'); await m.date.fill(YESTERDAY)
  log('R4.33 date value after fill yesterday:', await m.date.inputValue())
  mut.reqs.length = 0; mut.res.length = 0
  await m.send.click()
  log('R4.33 probe yesterday errors:', await m.err(), 'toasts:', await collect(page, 1500), 'reqs:', mut.reqs, 'res:', mut.res)
  await shot(page, R, '33-adv3-past-date')
  log(q(`select count(*) adv from advances`))
  await m.date.fill(TODAY); mut.res.length = 0
  await m.send.click()
  log('R4.33 toasts:', await collect(page, 3500), 'res:', mut.res)
  await settle(page); await sleep(800)
  log('R4.33 list:', await mainText(page, 500))
  await shot(page, R, '33-adv3-listed', { fullPage: true })
  log('console', consoleErrors, 'server', serverErrors)
  await browser.close()
}
// R4.34
{
  const { browser, page, consoleErrors, serverErrors } = await openAs('uat.agent.out1', { mobile: true })
  const mut = trackMutations(page)
  await page.goto(`${BASE}/field/advances`); await settle(page); await sleep(1000)
  const m = await openModal(page)
  await m.amt.fill('6000'); await m.pur.fill('UAT ADV-MAX เกินเพดาน 5,000 บาท'); await m.date.fill(TODAY7)
  mut.res.length = 0
  await m.send.click()
  log('R4.34 ADV-MAX errors:', await m.err(), 'toasts:', await collect(page, 1500), 'res:', mut.res)
  log('R4.34 modal text:', flat(await m.ad.innerText()).slice(0, 500))
  await shot(page, R, '34-adv-max')
  log(q(`select count(*) adv from advances`))
  const r = await page.request.post(`${BASE}/api/advances`, { data: { requestedSatang: 600000, purpose: 'UAT ADV-MAX เกินเพดาน 5,000 บาท', dueClearDate: TODAY7 } })
  log('R4.34 API ADV-MAX:', r.status(), JSON.stringify(await r.json()).slice(0, 300))
  await m.amt.fill('1000'); await m.pur.fill('UAT ADV4 ทดสอบใช้เกินยอดอนุมัติ (Q3)'); await m.date.fill(TODAY7)
  mut.res.length = 0
  await m.send.click()
  log('R4.34 ADV4 toasts:', await collect(page, 3500), 'res:', mut.res)
  await settle(page); await sleep(800)
  log('R4.34 list:', await mainText(page, 500))
  await shot(page, R, '34-adv4-listed', { fullPage: true })
  log('console', consoleErrors, 'server', serverErrors)
  await browser.close()
}
log(q(ADVQ))
// R4.35
log(q(`select r.name,rc.access_level from role_capabilities rc join roles r on r.id=rc.role_id join capabilities c on c.id=rc.capability_id where c.code='approve_advance'`))
{
  const { browser, page, consoleErrors, serverErrors } = await openAs('uat.finance')
  const mut = trackMutations(page)
  await page.goto(`${BASE}/finance?tab=advances`); await settle(page); await sleep(1500)
  log('R4.35 url:', page.url())
  log('R4.35 finance advances:', await mainText(page, 1500))
  const rows = (await page.locator('tbody tr').allInnerTexts()).map(s => s.replace(/\s+/g, ' ').slice(0, 200))
  log('R4.35 rows:', rows.length, rows)
  log('R4.35 buttons in table:', (await page.locator('tbody button').allInnerTexts()).map(s => s.trim()))
  await shot(page, R, '35-finance-advances', { fullPage: true })
  log('R4.35 non-GET reqs (ต้องว่าง):', mut.reqs)
  log('console', consoleErrors, 'server', serverErrors)
  await browser.close()
}
log(q(ADVQ))
